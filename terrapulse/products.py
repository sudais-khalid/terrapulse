"""Turn the per-date 100 m backscatter stack into surface change products.

All thresholds are derived from the data (Otsu) and bounded to physically
sensible L-band ranges, and every choice is written to the manifest so the
web app can explain it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import Site
from .geo import utm_to_lonlat
from .ingest import Grid

# Class codes used in per-date maps.
NODATA, LAND, OPEN_WATER, FLOODED_VEG = 0, 1, 2, 3
# A pass is flagged as wind-roughened when less than this share of the reference lake reads as water.
WIND_LAKE_FRAC = 0.7


@dataclass
class Stack:
    dates: list[str]
    meta: list[dict]
    hh: np.ndarray  # [T, H, W] dB, NaN = no data
    hv: np.ndarray
    grid: Grid


def load_stack(root: Path) -> Stack:
    grid = Grid.load(root / "grid.json")
    files = sorted((root / "dates").glob("*.npz"))
    dates, meta, hh, hv = [], [], [], []
    for f in files:
        z = np.load(f)
        if "hh_db" in z:
            a, b = z["hh_db"].astype(np.float32), z["hv_db"].astype(np.float32)
        else:  # early cache format: linear power
            with np.errstate(invalid="ignore", divide="ignore"):
                a, b = 10 * np.log10(z["hh"]), 10 * np.log10(z["hv"])
        a[~np.isfinite(a)] = np.nan
        b[~np.isfinite(b)] = np.nan
        dates.append(f.stem)
        meta.append(json.loads(f.with_suffix(".json").read_text()))
        hh.append(a)
        hv.append(b)
    if not dates:
        raise RuntimeError(f"no ingested dates in {root / 'dates'}")
    return Stack(dates, meta, np.stack(hh), np.stack(hv), grid)


# --------------------------------------------------------------------------- helpers
def otsu(values: np.ndarray, lo: float, hi: float, bins: int = 256) -> float:
    v = values[np.isfinite(values)]
    v = v[(v >= lo) & (v <= hi)]
    hist, edges = np.histogram(v, bins=bins, range=(lo, hi))
    p = hist.astype(np.float64) / max(hist.sum(), 1)
    centers = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(p)
    mu = np.cumsum(p * centers)
    mu_t = mu[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mu_t * w0 - mu) ** 2 / (w0 * (1 - w0))
    between[~np.isfinite(between)] = 0
    return float(centers[int(np.argmax(between))])


def zone_mask(site: Site, grid: Grid, bbox) -> np.ndarray:
    """Boolean mask of grid cells whose centre falls inside a lon/lat bbox."""
    w, s, e, n = bbox
    xs = grid.x0 + (np.arange(grid.width) + 0.5) * grid.res
    ys = grid.y1 - (np.arange(grid.height) + 0.5) * grid.res
    X, Y = np.meshgrid(xs, ys)
    lon, lat = utm_to_lonlat(X, Y, grid.epsg)
    return (lon >= w) & (lon <= e) & (lat >= s) & (lat <= n)


def kmeans(x: np.ndarray, k: int, iters: int = 40, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    """Plain NumPy k-means with k-means++ init. Returns (centroids, labels)."""
    rng = np.random.default_rng(seed)
    c = [x[rng.integers(len(x))]]
    for _ in range(1, k):
        d2 = np.min(((x[:, None, :] - np.array(c)[None]) ** 2).sum(-1), axis=1)
        c.append(x[rng.choice(len(x), p=d2 / d2.sum())])
    c = np.array(c)
    for _ in range(iters):
        lab = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), axis=1)
        new = np.array([x[lab == j].mean(0) if np.any(lab == j) else c[j] for j in range(k)])
        if np.allclose(new, c, atol=1e-5):
            break
        c = new
    return c, lab


RHYTHM_CLASSES = [
    # code, label, dance metaphor, colour
    (1, "Permanent water", "The still pool", "#1d4e89"),
    (2, "Seasonal water and wetland", "The tide", "#3fa7d6"),
    (3, "Flood-prone vegetation", "The swirl", "#7b5ea7"),
    (4, "Active cropland", "The harvest waltz", "#e0a526"),
    (5, "Woody vegetation, forest and orchards", "The slow sway", "#2e8b57"),
    (6, "Built-up area", "The steady beat", "#d1495b"),
    (7, "Bare soil and desert", "The quiet floor", "#c2b280"),
    (8, "Sparse vegetation and fallow", "The shuffle", "#9aa36b"),
]


def _rhythm_name(c) -> int:
    """Name a cluster centroid (in physical units) with simple radar rules."""
    hhm, hvm, hhs, hvs, occ, hvr, ffq = c
    if occ >= 0.6:
        return 1  # permanent water
    if occ >= 0.15:
        return 2  # seasonal water and wetland
    if ffq >= 0.12:
        return 3  # flood-prone vegetation
    if hhm > -4 and hhs < 2.0:
        return 6  # built-up: bright and steady
    if hvr >= 6 or hvs >= 2.0:
        return 4  # active cropland: big HV swing
    if hvm >= -16:
        return 5  # woody vegetation: high, steady HV
    if hvm < -24:
        return 7  # bare soil and desert
    return 8      # sparse vegetation and fallow


def rhythm_classes(X: np.ndarray, ok: np.ndarray, H: int, W: int, log=print, k: int = 10):
    """k-means on standardised yearly features, then rule-based names per cluster."""
    mu, sd = X.mean(0), X.std(0) + 1e-6
    rng = np.random.default_rng(3)
    idx = rng.choice(len(X), size=min(60000, len(X)), replace=False)
    cents, _ = kmeans((X[idx] - mu) / sd, k=k)
    lab = np.empty(len(X), np.int16)
    Z = (X - mu) / sd
    for s in range(0, len(Z), 200000):  # nearest centroid, in blocks to limit memory
        z = Z[s:s + 200000]
        lab[s:s + 200000] = np.argmin(((z[:, None, :] - cents[None]) ** 2).sum(-1), axis=1)
    cents_units = cents * sd + mu
    cluster_to_class = np.array([_rhythm_name(c) for c in cents_units], np.uint8)
    rhythm = np.zeros((H, W), np.uint8)
    rhythm[ok] = cluster_to_class[lab]
    log("  rhythm clusters -> classes: " + ", ".join(f"{i}:{c}" for i, c in enumerate(cluster_to_class)))
    return cents_units, cluster_to_class, rhythm


# --------------------------------------------------------------------------- main
def compute(stack: Stack, site: Site, log=print) -> dict:
    T, H, W = stack.hh.shape
    hh, hv = stack.hh.copy(), stack.hv.copy()
    valid = np.isfinite(hh) & np.isfinite(hv)
    modes = np.array([m.get("mode", "") for m in stack.meta])

    # 1. Mode bias check on temporally stable pixels (lowest 20% HH temporal std).
    with np.errstate(invalid="ignore"):
        std_hh0 = np.nanstd(hh, axis=0)
    stable = std_hh0 <= np.nanpercentile(std_hh0, 20)
    per_date_med = np.array([np.nanmedian(hh[t][stable]) for t in range(T)])
    per_date_med_hv = np.array([np.nanmedian(hv[t][stable]) for t in range(T)])
    bias = {}
    ref_mode = max(set(modes), key=list(modes).count)
    for m in sorted(set(modes)):
        sel = modes == m
        bias[m] = {"hh_db": float(np.nanmedian(per_date_med[sel]) - np.nanmedian(per_date_med[modes == ref_mode])),
                   "hv_db": float(np.nanmedian(per_date_med_hv[sel]) - np.nanmedian(per_date_med_hv[modes == ref_mode])),
                   "dates": int(sel.sum())}
    corrected = False
    if any(abs(b["hh_db"]) > 0.5 or abs(b["hv_db"]) > 0.5 for b in bias.values()):
        for t in range(T):
            hh[t] -= bias[modes[t]]["hh_db"]
            hv[t] -= bias[modes[t]]["hv_db"]
        corrected = True
    log(f"  mode bias (vs {ref_mode}): {json.dumps(bias)}; corrected={corrected}")

    with np.errstate(invalid="ignore"):
        hh_med = np.nanmedian(hh, axis=0)
        hv_med = np.nanmedian(hv, axis=0)
    d_hh = hh - hh_med[None]
    d_hv = hv - hv_med[None]

    # 2. Open water. At L-band, calm water sits near the noise floor in HV, but smooth dry
    #    desert is almost as dark in HH, so a blind histogram split misfires. We calibrate
    #    on a permanent reference lake (the darkest 40% of its zone by median HV) and take
    #    the 95th percentile of its values over all passes as thresholds.
    # Thresholds are calibrated separately per radar mode, because the 40 MHz mode has a
    # higher noise floor and reads dark targets about 1 dB brighter than the 20 MHz mode.
    ref = site.zone(site.water_ref) if site.water_ref else next((z for z in site.zones if z.kind == "lake"), None)
    core = None
    if ref is not None:
        zm = zone_mask(site, stack.grid, ref.bbox)
        core = zm & np.isfinite(hv_med) & (hv_med <= np.nanpercentile(hv_med[zm], 40))
        if core.sum() < 50:
            core = None
    dry_zone = site.zone(site.dry_ref) if site.dry_ref else next((z for z in site.zones if z.kind == "desert"), None)
    dry = zone_mask(site, stack.grid, dry_zone.bbox) if dry_zone else None
    thr, skill = {}, {}
    for m in sorted(set(modes)):
        sel = modes == m
        if core is not None and dry is not None and dry.sum() >= 50:
            # Pick the thresholds that best separate known water (reference lake) from
            # known dry land (desert check area): maximise Youden's J = hit rate - false alarms.
            L = np.stack([hh[sel][:, core].ravel(), hv[sel][:, core].ravel()], 1)
            D = np.stack([hh[sel][:, dry].ravel(), hv[sel][:, dry].ravel()], 1)
            L, D = L[np.all(np.isfinite(L), 1)], D[np.all(np.isfinite(D), 1)]
            best = (-1.0, -17.0, -24.0, 0.0, 0.0)
            for a in np.arange(-22, -13.9, 0.25):
                la, da = L[:, 0] < a, D[:, 0] < a
                for b in np.arange(-28, -19.9, 0.25):
                    tpr = float((la & (L[:, 1] < b)).mean())
                    fpr = float((da & (D[:, 1] < b)).mean())
                    if tpr - fpr > best[0]:
                        best = (tpr - fpr, float(a), float(b), tpr, fpr)
            thr[m] = (best[1], best[2])
            skill[m] = {"lake_hit_rate": round(best[3], 3), "desert_false_alarm": round(best[4], 3)}
        elif core is not None:
            thr[m] = (float(np.clip(np.nanpercentile(hh[sel][:, core], 95), -22, -14)),
                      float(np.clip(np.nanpercentile(hv[sel][:, core], 95), -28, -21)))
        else:
            v = valid[sel]
            thr[m] = (float(np.clip(otsu(hh[sel][v], -35, 5), -22, -14)), float(np.clip(otsu(hv[sel][v], -40, -5), -28, -21)))
    calib = (f"{ref.name} (water) vs {dry_zone.name} (dry land)" if skill else
             f"{ref.name}" if core is not None else "Otsu histogram split")
    if skill:
        log(f"  calibration skill per mode: {json.dumps(skill)}")
    t_hh_d = np.array([thr[m][0] for m in modes], np.float32)[:, None, None]
    t_hv_d = np.array([thr[m][1] for m in modes], np.float32)[:, None, None]
    steady_water = (hh < t_hh_d) & (hv < t_hv_d)
    # Newly flooded ground: both channels drop at least 3 dB below the pixel's own median
    # and end up close to water levels. Always-dark desert never changes, so it is excluded.
    new_water = (d_hh <= -3) & (d_hv <= -3) & (hh < t_hh_d + 2) & (hv < t_hv_d + 2)
    water = valid & (steady_water | new_water)
    t_hh, t_hv = thr[ref_mode]
    log(f"  open water thresholds per mode (calibrated on {calib}): " +
        ", ".join(f"{m}: HH < {a:.1f}, HV < {b:.1f} dB" for m, (a, b) in thr.items()))

    # Wind check: a permanent lake that stops looking like water has a wind-roughened surface.
    lake_frac = [None] * T
    if core is not None:
        for t in range(T):
            vv = valid[t] & core
            lake_frac[t] = round(float(water[t][vv].mean()), 3) if vv.sum() else None
        windy = [stack.dates[t] for t in range(T) if lake_frac[t] is not None and lake_frac[t] < WIND_LAKE_FRAC]
        log(f"  reference lake water fraction per pass: min {min(f for f in lake_frac if f is not None):.2f}; wind-roughened passes: {windy}")

    # 3. Flooded vegetation (L-band double bounce): HH jumps well above the pixel's
    #    own median, HH rises more than HV, and HH is bright.
    urban_like = hh_med > -4
    flooded = valid & ~water & (d_hh >= 3) & ((d_hh - d_hv) >= 2) & (hh >= -6) & ~urban_like[None]

    classes = np.full((T, H, W), NODATA, np.uint8)
    classes[valid] = LAND
    classes[water] = OPEN_WATER
    classes[flooded] = FLOODED_VEG
    # Light 3x3 majority-style cleanup of isolated pixels.
    try:
        from scipy.ndimage import median_filter
        for t in range(T):
            classes[t] = np.where(classes[t] == NODATA, NODATA, median_filter(classes[t], size=3))
    except ImportError:
        pass

    # 4. Temporal products.
    nvalid = valid.sum(0)
    with np.errstate(invalid="ignore", divide="ignore"):
        occurrence = np.where(nvalid > 0, (classes == OPEN_WATER).sum(0) / nvalid, np.nan)
        flood_freq = np.where(nvalid > 0, (classes == FLOODED_VEG).sum(0) / nvalid, np.nan)
        hv_range = np.nanpercentile(hv, 95, axis=0) - np.nanpercentile(hv, 5, axis=0)
        hh_std = np.nanstd(hh, axis=0)
        hv_std = np.nanstd(hv, axis=0)
        lin = 10 ** (hh / 10)
        cv = np.nanstd(lin, axis=0) / np.nanmean(lin, axis=0)
    enough = nvalid >= max(3, T // 3)

    # 5. Surface rhythm classes: k-means discovers groups, rules name them.
    feats = np.stack([hh_med, hv_med, hh_std, hv_std, occurrence, hv_range, flood_freq], -1)
    ok = enough & np.all(np.isfinite(feats), -1)
    X = feats[ok]
    if len(X) >= 1000:
        cents_units, cluster_to_class, rhythm = rhythm_classes(X, ok, H, W, log)
        # Small, distinctive classes can be absorbed by large clusters; pin them per pixel.
        rhythm[ok & (hh_med >= -5) & (hh_std <= 1.5)] = 6        # built-up: bright and steady HH
        rhythm[ok & (occurrence >= 0.8)] = 1                      # permanent water
    else:
        log("  rhythm skipped: not enough passes per pixel")
        cents_units, cluster_to_class, rhythm = np.zeros((0, 7)), np.zeros(0, np.uint8), np.zeros((H, W), np.uint8)

    # 6. Zone statistics per date.
    cell_km2 = (stack.grid.res / 1000) ** 2
    zones = {"all": ("Whole study area", np.ones((H, W), bool), "area")}
    for z in site.zones:
        zones[z.key] = (z.name, zone_mask(site, stack.grid, z.bbox), z.kind)
    zstats = {}
    for key, (zname, m, kind) in zones.items():
        rows = []
        zone_cells = max(int(m.sum()), 1)
        for t in range(T):
            v = valid[t] & m
            n = int(v.sum())
            if n < 0.3 * zone_cells:  # too little coverage to say anything
                rows.append(None)
                continue
            # Areas are scaled from the observed share to the whole zone, because passes
            # in the 20 MHz mode lose part of the area to masked swath gaps.
            scale = zone_cells / n * cell_km2
            w = float((classes[t][m] == OPEN_WATER).sum())
            f = float((classes[t][m] == FLOODED_VEG).sum())
            rows.append({
                "valid_frac": round(n / zone_cells, 3),
                "water_km2": round(w * scale, 2),
                "flooded_veg_km2": round(f * scale, 2),
                "water_km2_observed": round(w * cell_km2, 2),
                "hh_db": round(float(10 * np.log10(np.nanmean(10 ** (hh[t][v] / 10)))), 2),
                "hv_db": round(float(10 * np.log10(np.nanmean(10 ** (hv[t][v] / 10)))), 2),
            })
        zstats[key] = {"name": zname, "kind": kind, "area_km2": round(float(m.sum()) * cell_km2, 1), "series": rows}

    return {
        "hh": hh, "hv": hv, "valid": valid, "classes": classes,
        "occurrence": occurrence, "flood_freq": flood_freq, "hv_range": hv_range, "cv": cv,
        "hh_med": hh_med, "hv_med": hv_med, "rhythm": rhythm,
        "params": {
            "water_hh_db": round(t_hh, 2), "water_hv_db": round(t_hv, 2), "water_calibration": calib,
            "water_thresholds_by_mode": {m: {"hh_db": round(a, 2), "hv_db": round(b, 2), **skill.get(m, {})} for m, (a, b) in thr.items()},
            "wind_lake_frac": WIND_LAKE_FRAC,
            "reference_lake_water_frac": lake_frac,
            "water_rule": "HH and HV below thresholds calibrated on a permanent reference lake, or both channels at least 3 dB darker than the pixel's own median",
            "flood_rule": "HH rise >= 3 dB above pixel median, HH rise exceeds HV rise by >= 2 dB, HH >= -6 dB, not built-up",
            "mode_bias": bias, "mode_bias_corrected": corrected, "reference_mode": ref_mode,
            "kmeans_k": int(len(cents_units)), "rhythm_centroids": [[round(float(v), 3) for v in c] for c in cents_units],
            "rhythm_cluster_class": cluster_to_class.tolist(),
        },
        "zones": zstats,
    }
