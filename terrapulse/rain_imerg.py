"""Daily rainfall from NASA GPM IMERG (Late Run, V07, 0.1 degree), averaged over each zone.

IMERG merges microwave and infrared satellite estimates, so unlike a reanalysis model it
captures local monsoon downpours. Each daily file is opened remotely and only the small
window around the study site is read.

Needs an Earthdata Login token whose account has approved the "NASA GESDISC DATA ARCHIVE"
application (Earthdata Login profile > Applications > Authorized Apps > Approve More Applications).
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

import numpy as np

from .config import Site
from .remote import open_h5

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
SHORT_NAME, VERSION = "GPM_3IMERGDL", "07"
SOURCE = "NASA GPM IMERG Late Run daily, V07, 0.1 degree (GES DISC)"


def granules(start: str, end: str) -> dict[str, str]:
    """Map date -> HTTPS URL for every daily IMERG Late file between start and end."""
    out: dict[str, str] = {}
    page = 1
    while True:
        url = (f"{CMR}?short_name={SHORT_NAME}&version={VERSION}&temporal={start}T00:00:00Z,{end}T23:59:59Z"
               f"&page_size=2000&page_num={page}&sort_key=start_date")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "terrapulse"}), timeout=120) as r:
            entries = json.load(r)["feed"]["entry"]
        for e in entries:
            m = re.search(r"3IMERG\.(\d{8})", e["title"])
            href = next((lk["href"] for lk in e.get("links", []) if lk["href"].startswith("https://") and lk["href"].endswith(".nc4")
                         and "opendap" not in lk["href"]), None)
            if m and href:
                d = m.group(1)
                out[f"{d[:4]}-{d[4:6]}-{d[6:]}"] = href  # later versions in the listing overwrite earlier ones
        if len(entries) < 2000:
            return dict(sorted(out.items()))
        page += 1


def _find_precip(h5):
    names = []
    h5.visititems(lambda n, o: names.append(n) if getattr(o, "ndim", 0) >= 2 else None)
    for want in ("precipitation", "precipitationCal"):
        for n in names:
            if n.split("/")[-1] == want:
                return h5[n]
    raise KeyError(f"no precipitation variable among {names}")


def _coord(h5, name: str):
    for n in (name, f"Grid/{name}"):
        if n in h5:
            return h5[n][:]
    raise KeyError(name)


def _site_window(site: Site, lon: np.ndarray, lat: np.ndarray, pad: float = 0.1):
    w, s, e, n = site.bbox
    i = np.nonzero((lon >= w - pad) & (lon <= e + pad))[0]
    j = np.nonzero((lat >= s - pad) & (lat <= n + pad))[0]
    return int(i[0]), int(i[-1]) + 1, int(j[0]), int(j[-1]) + 1


def _zone_means(site: Site, lon_w: np.ndarray, lat_w: np.ndarray, P: np.ndarray) -> dict[str, float]:
    """P is [lon, lat] in mm/day. Mean over grid cells whose centres fall in each zone (nearest cell if none)."""
    out = {}
    boxes = {"all": site.bbox, **{z.key: z.bbox for z in site.zones}}
    LON, LAT = np.meshgrid(lon_w, lat_w, indexing="ij")
    for key, (w, s, e, n) in boxes.items():
        m = (LON >= w) & (LON <= e) & (LAT >= s) & (LAT <= n) & np.isfinite(P)
        if not m.any():
            ci, cj = np.argmin(np.abs(lon_w - (w + e) / 2)), np.argmin(np.abs(lat_w - (s + n) / 2))
            v = P[ci, cj]
        else:
            v = float(np.nanmean(P[m]))
        if np.isfinite(v):
            out[key] = round(float(v), 2)
    return out


def fetch(sites: list[Site], token: str, cache_root: Path, log=print) -> dict[str, Path]:
    """Read IMERG for all sites in one pass over the daily files. Resumable per site."""
    start = min(s.start for s in sites)
    end = max(s.end for s in sites)
    urls = granules(start, end)
    log(f"IMERG: {len(urls)} daily files {start} to {end}")
    paths, results = {}, {}
    for s in sites:
        p = cache_root / s.key / "rain_imerg.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        paths[s.key] = p
        results[s.key] = json.loads(p.read_text())["series"] if p.exists() else {}
    t0, done = time.time(), 0
    for k, (date, url) in enumerate(urls.items(), 1):
        todo = [s for s in sites if s.start <= date <= s.end and date not in results[s.key].get("all", {})]
        if not todo:
            continue
        for attempt in range(4):
            try:
                h5, f = open_h5(url, token, block_size=256 * 1024)
                try:
                    lon, lat = _coord(h5, "lon"), _coord(h5, "lat")
                    var = _find_precip(h5)
                    units = str(var.attrs.get("units", b"mm/day"), "utf8") if isinstance(var.attrs.get("units"), bytes) else str(var.attrs.get("units", "mm/day"))
                    for s in todo:
                        i0, i1, j0, j1 = _site_window(s, lon, lat)
                        # Daily files are (time, lon, lat); be robust to (time, lat, lon).
                        if var.shape[-2] == lon.size:
                            P = np.asarray(var[0, i0:i1, j0:j1], np.float64)
                        else:
                            P = np.asarray(var[0, j0:j1, i0:i1], np.float64).T
                        P[P < 0] = np.nan
                        if "hr" in units:
                            P *= 24.0
                        for zone, mm in _zone_means(s, lon[i0:i1], lat[j0:j1], P).items():
                            results[s.key].setdefault(zone, {})[date] = mm
                finally:
                    h5.close()
                    f.close()
                break
            except Exception as e:
                msg = str(e)
                if "403" in msg or "401" in msg:
                    raise RuntimeError("GES DISC refused the download. In Earthdata Login, open Applications > "
                                       "Authorized Apps > Approve More Applications and approve 'NASA GESDISC DATA ARCHIVE', "
                                       "then run this step again.") from e
                if attempt == 3:
                    log(f"  {date}: skipped ({type(e).__name__}: {msg[:80]})")
                time.sleep(2 ** attempt)
        done += 1
        if done % 20 == 0:
            for s in sites:
                _save(paths[s.key], results[s.key])
            log(f"  {k}/{len(urls)} files, {time.time() - t0:.0f}s")
    for s in sites:
        _save(paths[s.key], results[s.key])
    log(f"IMERG done in {time.time() - t0:.0f}s")
    return paths


def _save(path: Path, series: dict) -> None:
    path.write_text(json.dumps({
        "source": SOURCE,
        "caveat": "Satellite estimate on a 0.1 degree (about 11 km) grid, averaged over each area. "
                  "Late Run products are calibrated less than the Final Run, which is not yet available for 2026.",
        "series": series,
    }))


def load(path: Path) -> dict | None:
    return json.loads(path.read_text()) if path.exists() else None
