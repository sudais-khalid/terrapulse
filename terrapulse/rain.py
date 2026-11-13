"""Daily rainfall context from NASA POWER (MERRA-2 / GEOS-IT based, no login needed)."""
from __future__ import annotations

import json
import urllib.request

from .config import Site

POWER_URL = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG"
             "&longitude={lon:.4f}&latitude={lat:.4f}&start={start}&end={end}&format=JSON")


def _point(lon: float, lat: float, start: str, end: str) -> dict[str, float]:
    url = POWER_URL.format(lon=lon, lat=lat, start=start.replace("-", ""), end=end.replace("-", ""))
    req = urllib.request.Request(url, headers={"User-Agent": "terrapulse"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    p = data["properties"]["parameter"]["PRECTOTCORR"]
    return {f"{k[:4]}-{k[4:6]}-{k[6:]}": round(v, 2) for k, v in p.items() if v is not None and v >= 0}


def fetch(site: Site, log=print) -> dict:
    points = {"all": ((site.bbox[0] + site.bbox[2]) / 2, (site.bbox[1] + site.bbox[3]) / 2)}
    for z in site.zones:
        points[z.key] = ((z.bbox[0] + z.bbox[2]) / 2, (z.bbox[1] + z.bbox[3]) / 2)
    series = {}
    for key, (lon, lat) in points.items():
        try:
            series[key] = _point(lon, lat, site.start, site.end)
        except Exception as e:
            log(f"  rain {key}: {type(e).__name__}: {e}")
    log(f"  rainfall: {len(series)} points from NASA POWER")
    return {
        "source": "NASA POWER daily PRECTOTCORR (MERRA-2 and GEOS-IT), mm/day",
        "caveat": "Model reanalysis at about 50 km resolution. It smooths out local convective downpours, "
                  "so single storm totals can be much higher on the ground than shown.",
        "series": series,
    }
