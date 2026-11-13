"""Write web-ready layers: Web Mercator 8-bit PNGs, a coarse time-series stack and a manifest."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from .config import DATA_GAP, Site
from .geo import lonlat_to_merc, lonlat_to_utm, merc_to_lonlat
from .ingest import Grid
from .products import RHYTHM_CLASSES, Stack

# dB quantisation shared with the web app: value = 1 + round((dB - DB_MIN) / DB_STEP), 0 = no data.
DB_MIN, DB_MAX = -35.0, 5.0
DB_STEP = (DB_MAX - DB_MIN) / 254
# A pass with at least this much rain (area mean, mm) over the pass day and the two days before is flagged.
RAIN_AFFECTED_MM = 15.0


def quantize_db(a: np.ndarray) -> np.ndarray:
    q = np.zeros(a.shape, np.uint8)
    ok = np.isfinite(a)
    q[ok] = (1 + np.round((np.clip(a[ok], DB_MIN, DB_MAX) - DB_MIN) / DB_STEP)).astype(np.uint8)
    return q


class MercatorWarp:
    """Nearest-neighbour lookup from a Web Mercator output grid into the UTM analysis grid."""

    def __init__(self, site: Site, grid: Grid):
        w, s, e, n = site.bbox
        lat_c = (s + n) / 2
        self.res = grid.res / math.cos(math.radians(lat_c))  # mercator metres per pixel
        mx0, my0 = lonlat_to_merc(w, s)
        mx1, my1 = lonlat_to_merc(e, n)
        self.width = int(round((float(mx1) - float(mx0)) / self.res))
        self.height = int(round((float(my1) - float(my0)) / self.res))
        self.mx0, self.my1 = float(mx0), float(my1)
        mx = self.mx0 + (np.arange(self.width) + 0.5) * self.res
        my = self.my1 - (np.arange(self.height) + 0.5) * self.res
        MX, MY = np.meshgrid(mx, my)
        lon, lat = merc_to_lonlat(MX, MY)
        ux, uy = lonlat_to_utm(lon, lat, grid.epsg)
        c = np.floor((ux - grid.x0) / grid.res).astype(np.int64)
        r = np.floor((grid.y1 - uy) / grid.res).astype(np.int64)
        self.inside = (r >= 0) & (r < grid.height) & (c >= 0) & (c < grid.width)
        self.r, self.c = np.clip(r, 0, grid.height - 1), np.clip(c, 0, grid.width - 1)
        lon_w, lat_n = merc_to_lonlat(self.mx0, self.my1)
        lon_e, lat_s = merc_to_lonlat(self.mx0 + self.width * self.res, self.my1 - self.height * self.res)
        self.corners = [[float(lon_w), float(lat_n)], [float(lon_e), float(lat_n)],
                        [float(lon_e), float(lat_s)], [float(lon_w), float(lat_s)]]

    def __call__(self, a: np.ndarray, fill=0):
        out = a[self.r, self.c]
        out = np.where(self.inside, out, fill)
        return out.astype(a.dtype)


def save_png(a: np.ndarray, path: Path, palette: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(a.astype(np.uint8), mode="L")
    if palette:
        # Palette entries are #RRGGBB or #RRGGBBAA; index 0 is always transparent (no data).
        im = Image.frombytes("P", im.size, a.astype(np.uint8).tobytes())
        pal, alpha = [0, 0, 0] * 256, [255] * 256
        for i, hexc in enumerate(palette):
            h = hexc.lstrip("#")
            pal[3 * i: 3 * i + 3] = [int(h[k:k + 2], 16) for k in (0, 2, 4)]
            alpha[i] = int(h[6:8], 16) if len(h) == 8 else 255
        alpha[0] = 0
        im.putpalette(pal)
        last = max(i for i in range(256) if i < len(palette)) + 1
        im.save(path, optimize=True, transparency=bytes(alpha[:last]))
        return
    im.save(path, optimize=True)


def _date_entry(d: str, m: dict, i: int, params: dict) -> dict:
    thr = params.get("water_thresholds_by_mode", {}).get(m.get("mode"), {})
    lake = (params.get("reference_lake_water_frac") or [None] * (i + 1))[i]
    return {
        "date": d, "maturity": "VALIDATED" if m.get("collection") == "NISAR_L2_GCOV_V1" else "PROVISIONAL",
        "core": m.get("core"), "crid": m.get("crid"), "mode": m.get("mode"), "pol": m.get("pol"),
        "spacing_m": m.get("spacing_m"), "scene": m.get("scene"),
        "thr_hh": thr.get("hh_db", params.get("water_hh_db")), "thr_hv": thr.get("hv_db", params.get("water_hv_db")),
        "lake_water_frac": lake, "wind_roughened": bool(lake is not None and lake < params.get("wind_lake_frac", 0.7)),
    }


def export(stack: Stack, res: dict, site: Site, out: Path, rain: dict | None = None,
           stack_factor: int = 4, log=print) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    warp = MercatorWarp(site, stack.grid)
    T = len(stack.dates)
    log(f"  web grid: {warp.width} x {warp.height} px, {warp.res:.0f} m mercator")

    # Per-date backscatter and classes. Inside the study grid, pixels without valid radar data
    # (masked swath gaps) get class 4 so the map can show them as "no data" instead of dry land.
    for t, d in enumerate(stack.dates):
        save_png(warp(quantize_db(res["hh"][t])), out / "dates" / f"{d}_hh.png")
        save_png(warp(quantize_db(res["hv"][t])), out / "dates" / f"{d}_hv.png")
        cls = res["classes"][t].copy()
        cls[cls == 0] = 4
        save_png(warp(cls), out / "dates" / f"{d}_class.png",
                 palette=["#000000", "#00000000", "#1f6fd1", "#b04fd6", "#8a90a866"])

    def pct(a):
        q = np.zeros(a.shape, np.uint8)
        ok = np.isfinite(a)
        q[ok] = 1 + np.round(np.clip(a[ok], 0, 1) * 100).astype(np.uint8)
        return q

    def scaled(a, lo, hi):
        q = np.zeros(a.shape, np.uint8)
        ok = np.isfinite(a)
        q[ok] = 1 + np.round((np.clip(a[ok], lo, hi) - lo) / (hi - lo) * 254).astype(np.uint8)
        return q

    save_png(warp(pct(res["occurrence"])), out / "products" / "water_occurrence.png")
    save_png(warp(pct(res["flood_freq"])), out / "products" / "flooded_veg_frequency.png")
    save_png(warp(scaled(res["hv_range"], 0, 15)), out / "products" / "hv_range.png")
    save_png(warp(quantize_db(res["hh_med"])), out / "products" / "hh_median.png")
    save_png(warp(quantize_db(res["hv_med"])), out / "products" / "hv_median.png")
    save_png(warp(res["rhythm"]), out / "products" / "rhythm.png",
             palette=["#000000"] + [c[3] for c in RHYTHM_CLASSES])

    # Coarse stack for click-anywhere time series: uint8 [T][2][h][w].
    f = stack_factor
    hq = np.stack([warp(quantize_db(res["hh"][t])) for t in range(T)])
    vq = np.stack([warp(quantize_db(res["hv"][t])) for t in range(T)])
    h2, w2 = warp.height // f, warp.width // f

    def down(q):
        # Mean in dB of valid cells per block (0 = no data).
        v = q[:, : h2 * f, : w2 * f].reshape(T, h2, f, w2, f).astype(np.float32)
        m = v > 0
        s = (v * m).sum((2, 4))
        n = m.sum((2, 4))
        o = np.zeros((T, h2, w2), np.uint8)
        o[n > 0] = np.round(s[n > 0] / n[n > 0]).astype(np.uint8)
        return o

    series = np.stack([down(hq), down(vq)], axis=1)  # T,2,h,w
    (out / "stack.bin").write_bytes(series.tobytes())

    manifest = {
        "version": 1,
        "site": {"key": site.key, "name": site.name, "country": site.country, "bbox": site.bbox,
                 "track": site.track, "frame": site.frame, "direction": site.direction},
        "image": {"width": warp.width, "height": warp.height, "corners": warp.corners,
                  "res_m": site.res_m, "mercator_res_m": round(warp.res, 2)},
        "stack": {"file": "stack.bin", "factor": f, "width": w2, "height": h2, "order": "T,pol(hh,hv),y,x"},
        "db_quant": {"min": DB_MIN, "max": DB_MAX, "step": DB_STEP, "nodata": 0},
        "dates": [_date_entry(d, m, i, res["params"]) for i, (d, m) in enumerate(zip(stack.dates, stack.meta))],
        "data_gap": DATA_GAP,
        "params": res["params"],
        "classes": {"0": "outside study area", "1": "land", "2": "open water", "3": "flooded vegetation (likely)",
                    "4": "no valid radar data (masked swath gap)"},
        "rhythm_classes": [{"code": c[0], "label": c[1], "dance": c[2], "color": c[3]} for c in RHYTHM_CLASSES],
        "zones": res["zones"],
        "zone_boxes": {z.key: {"name": z.name, "bbox": z.bbox, "kind": z.kind, "note": z.note} for z in site.zones},
        "rain": rain,
    }
    # Rain-affected passes: heavy rain in the three days before a pass wets canopies and soil
    # (HH brightens, can mimic flooded vegetation) and roughens water, so they are flagged.
    daily = ((rain or {}).get("series") or {}).get("all") or {}
    if daily:
        from datetime import date as _date, timedelta
        for e in manifest["dates"]:
            d0 = _date.fromisoformat(e["date"])
            vals = [daily.get(str(d0 - timedelta(days=k))) for k in range(3)]
            vals = [v for v in vals if v is not None]
            e["rain_3d_mm"] = round(sum(vals), 1) if vals else None
            e["rain_affected"] = bool(vals and sum(vals) >= RAIN_AFFECTED_MM)
        flagged = [e["date"] for e in manifest["dates"] if e.get("rain_affected")]
        manifest["params"]["rain_affected_mm_3d"] = RAIN_AFFECTED_MM
        log(f"  rain-affected passes (>= {RAIN_AFFECTED_MM} mm in 3 days): {flagged}")
    manifest["site"]["tagline"] = site.tagline
    manifest["site"]["water_ref"] = site.water_ref
    manifest["site"]["dry_ref"] = site.dry_ref
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    _update_index(out.parent, site, manifest)
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file()) / 1e6
    log(f"  wrote {out} ({size:.1f} MB)")
    return out


def _update_index(root: Path, site: Site, manifest: dict) -> None:
    """Keep web/data/sites.json listing every exported site, for the app's site switcher."""
    path = root / "sites.json"
    index = json.loads(path.read_text()) if path.exists() else {"sites": []}
    entry = {"key": site.key, "name": site.name, "country": site.country, "tagline": site.tagline,
             "bbox": site.bbox, "passes": len(manifest["dates"]),
             "first": manifest["dates"][0]["date"], "last": manifest["dates"][-1]["date"]}
    index["sites"] = [s for s in index["sites"] if s["key"] != site.key] + [entry]
    order = {"lower-indus": 0}
    index["sites"].sort(key=lambda s: (order.get(s["key"], 1), s["key"]))
    path.write_text(json.dumps(index, indent=1))
