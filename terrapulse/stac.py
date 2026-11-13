"""Publish the web layers as a static STAC catalog (SpatioTemporal Asset Catalog, v1.1.0).

Every exported pass becomes a STAC Item whose assets are the 8-bit PNG layers the web app
uses. The raster extension records how to turn stored pixel values back into physical units
(dB, fractions), the projection extension georeferences the images in Web Mercator, and the
classification extension names the class codes. Tools such as STAC Browser, pystac or QGIS
can then discover and use TerraPulse outputs without reading any of our code.

    python -m terrapulse stac        # rebuild web/data/catalog.json from the exported manifests
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from urllib.parse import quote

from .export import CLASS_PALETTE, DB_MIN, DB_STEP
from .geo import lonlat_to_merc

STAC_VERSION = "1.1.0"
EXT = {
    "sar": "https://stac-extensions.github.io/sar/v1.0.0/schema.json",
    "sat": "https://stac-extensions.github.io/sat/v1.0.0/schema.json",
    "proj": "https://stac-extensions.github.io/projection/v2.0.0/schema.json",
    "raster": "https://stac-extensions.github.io/raster/v1.1.0/schema.json",
    "class": "https://stac-extensions.github.io/classification/v1.1.0/schema.json",
}
REPO = "https://github.com/sudais-khalid/terrapulse"
APP = "https://sudais-khalid.github.io/terrapulse/"
ASF_SEARCH = "https://api.daac.asf.alaska.edu/services/search/param?output=geojson&granule_list="
NISAR_L_BAND_GHZ = 1.257
PNG = "image/png"

# Stored value q (1..255, 0 = no data) to physical value: q * scale + offset.
DB_BAND = {"nodata": 0, "data_type": "uint8", "unit": "dB", "scale": DB_STEP, "offset": DB_MIN - DB_STEP}
FRACTION_BAND = {"nodata": 0, "data_type": "uint8", "unit": "1", "scale": 0.01, "offset": -0.01}
HV_RANGE_BAND = {"nodata": 0, "data_type": "uint8", "unit": "dB", "scale": 15 / 254, "offset": -15 / 254}


def _start_time(scene: str, day: str) -> str:
    # NISAR_L2_PR_GCOV_..._A_20260623T221633_20260623T221711_P05023_...
    for part in scene.split("_"):
        if len(part) == 15 and part[8] == "T" and part[:8].isdigit():
            return f"{part[:4]}-{part[4:6]}-{part[6:8]}T{part[9:11]}:{part[11:13]}:{part[13:15]}Z"
    return f"{day}T00:00:00Z"


def _classes(items: list[tuple[int, str, str, str]]) -> list[dict]:
    out = []
    for value, name, description, color in items:
        c = {"value": value, "name": name, "description": description}
        if color and len(color.lstrip("#")) >= 6:
            c["color_hint"] = color.lstrip("#")[:6].upper()
        out.append(c)
    return out


def _slug(text: str) -> str:
    return "-".join("".join(ch if ch.isalnum() else " " for ch in text.lower()).split())


def _geometry(m: dict) -> tuple[dict, list[float], dict]:
    corners = m["image"]["corners"]  # NW, NE, SE, SW in lon/lat
    lons, lats = [c[0] for c in corners], [c[1] for c in corners]
    geom = {"type": "Polygon", "coordinates": [[*corners, corners[0]]]}
    w, h = m["image"]["width"], m["image"]["height"]
    # Pixel size from the exact corners (the manifest's mercator_res_m is rounded for display).
    mx0, my1 = (float(v) for v in lonlat_to_merc(corners[0][0], corners[0][1]))
    mx1, my0 = (float(v) for v in lonlat_to_merc(corners[2][0], corners[2][1]))
    rx, ry = (mx1 - mx0) / w, (my1 - my0) / h
    proj = {"proj:code": "EPSG:3857", "proj:shape": [h, w], "proj:transform": [rx, 0.0, mx0, 0.0, -ry, my1]}
    return geom, [min(lons), min(lats), max(lons), max(lats)], proj


def _item(m: dict, d: dict, geom: dict, bbox: list[float], proj: dict, class_list: list[dict]) -> dict:
    site, day = m["site"], d["date"]
    pols = ["HH", "HV"]
    props = {
        "datetime": _start_time(d.get("scene") or "", day),
        "title": f"{site['name']}, NISAR pass {day}",
        "platform": "nisar", "instruments": ["l-sar"], "gsd": float(m["image"]["res_m"]),
        "sar:instrument_mode": str(d.get("mode") or "unknown"), "sar:frequency_band": "L",
        "sar:center_frequency": NISAR_L_BAND_GHZ, "sar:polarizations": pols, "sar:product_type": "GCOV",
        "sat:orbit_state": site["direction"].lower(), "sat:relative_orbit": site["track"],
        **proj,
        "terrapulse:maturity": d.get("maturity"), "terrapulse:crid": d.get("crid"),
        "terrapulse:core_series": bool(d.get("core")), "terrapulse:source_granule": d.get("scene"),
        "terrapulse:water_threshold_hh_db": d.get("thr_hh"), "terrapulse:water_threshold_hv_db": d.get("thr_hv"),
        "terrapulse:wind_roughened": d.get("wind_roughened"),
        "terrapulse:rain_3d_mm": d.get("rain_3d_mm"), "terrapulse:rain_affected": d.get("rain_affected"),
    }
    links = [{"rel": "root", "href": "../../catalog.json", "type": "application/json"},
             {"rel": "parent", "href": "../collection.json", "type": "application/json"},
             {"rel": "collection", "href": "../collection.json", "type": "application/json"}]
    if d.get("scene"):
        links.append({"rel": "derived_from", "href": ASF_SEARCH + quote(d["scene"]), "type": "application/geo+json",
                      "title": "Source NISAR L2 GCOV granule (ASF search)"})
    links.append({"rel": "alternate", "href": f"{APP}#site={site['key']}&mode=explore&layer=water&d={day}", "type": "text/html",
                  "title": "Open this pass in TerraPulse"})
    assets = {
        "hh": {"href": f"../dates/{day}_hh.png", "type": PNG, "title": "HH backscatter (gamma-naught, dB)",
               "roles": ["data"], "raster:bands": [DB_BAND]},
        "hv": {"href": f"../dates/{day}_hv.png", "type": PNG, "title": "HV backscatter (gamma-naught, dB)",
               "roles": ["data"], "raster:bands": [DB_BAND]},
        "class": {"href": f"../dates/{day}_class.png", "type": PNG, "title": "Open water and likely flooded vegetation",
                  "roles": ["data", "visual"], "raster:bands": [{"nodata": 0, "data_type": "uint8"}],
                  "classification:classes": class_list},
    }
    return {"type": "Feature", "stac_version": STAC_VERSION,
            "stac_extensions": [EXT["sar"], EXT["sat"], EXT["proj"], EXT["raster"], EXT["class"]],
            "id": f"{site['key']}-{day}", "collection": site["key"], "geometry": geom, "bbox": bbox,
            "properties": props, "links": links, "assets": assets}


def build_site(root: Path) -> dict:
    """Write <site>/collection.json and <site>/items/*.json; return the collection."""
    m = json.loads((root / "manifest.json").read_text())
    site = m["site"]
    geom, bbox, proj = _geometry(m)
    class_list = _classes([(int(k), _slug(v), v, CLASS_PALETTE[int(k)] if int(k) < len(CLASS_PALETTE) else "")
                           for k, v in m["classes"].items() if k != "0"])
    rhythm = _classes([(c["code"], _slug(c["label"]), f"{c['label']} ({c['dance']})", c["color"])
                       for c in m["rhythm_classes"]])
    items_dir = root / "items"
    if items_dir.exists():
        shutil.rmtree(items_dir)
    items_dir.mkdir(parents=True)
    times = []
    for d in m["dates"]:
        item = _item(m, d, geom, bbox, proj, class_list)
        times.append(item["properties"]["datetime"])
        (items_dir / f"{d['date']}.json").write_text(json.dumps(item, indent=1))

    def product(name, title, band=None, classes=None):
        a = {"href": f"products/{name}.png", "type": PNG, "title": title, "roles": ["data"], **proj}
        a["raster:bands"] = [band or {"nodata": 0, "data_type": "uint8"}]
        if classes:
            a["classification:classes"] = classes
        return a

    params = m["params"]
    collection = {
        "type": "Collection", "stac_version": STAC_VERSION,
        "stac_extensions": [EXT["sar"], EXT["sat"], EXT["proj"], EXT["raster"], EXT["class"]],
        "id": site["key"], "title": f"TerraPulse: {site['name']}, {site['country']}",
        "description": (f"{site.get('tagline', '')}. Surface change layers from {len(m['dates'])} NISAR L2 GCOV passes "
                        f"(track {site['track']}, frame {site['frame']}, {site['direction'].lower()}), resampled to "
                        f"{m['image']['res_m']} m and published as 8-bit PNGs in Web Mercator. Open water uses HH and HV "
                        f"thresholds calibrated per radar mode on a permanent water body ({site.get('water_ref')}) against "
                        f"never-flooded land ({site.get('dry_ref')}). Passes are flagged when wind roughened the reference "
                        f"water or when at least {params.get('rain_affected_mm_3d', 15)} mm of GPM IMERG rain fell in "
                        "the three days before."),
        "keywords": ["NISAR", "SAR", "L-band", "GCOV", "open water", "flooded vegetation", "change detection", site["country"]],
        "license": "Apache-2.0",
        "providers": [
            {"name": "NASA-ISRO SAR mission (NASA JPL, ISRO)", "roles": ["producer", "licensor"], "url": "https://nisar.jpl.nasa.gov/"},
            {"name": "Alaska Satellite Facility DAAC", "roles": ["host"], "url": "https://asf.alaska.edu/"},
            {"name": "TerraPulse (Sudais Khalid, Sunnia Aslam)", "roles": ["processor", "host"], "url": REPO},
        ],
        "extent": {"spatial": {"bbox": [bbox]}, "temporal": {"interval": [[min(times), max(times)]]}},
        "summaries": {
            "platform": ["nisar"], "instruments": ["l-sar"], "gsd": [float(m["image"]["res_m"])],
            "sar:frequency_band": ["L"], "sar:product_type": ["GCOV"], "sar:polarizations": ["HH", "HV"],
            "sar:instrument_mode": sorted({str(d.get("mode")) for d in m["dates"]}),
            "sat:orbit_state": [site["direction"].lower()], "sat:relative_orbit": [site["track"]],
            "terrapulse:maturity": sorted({d.get("maturity") for d in m["dates"]}),
        },
        "item_assets": {
            "hh": {"type": PNG, "title": "HH backscatter (gamma-naught, dB)", "roles": ["data"], "raster:bands": [DB_BAND]},
            "hv": {"type": PNG, "title": "HV backscatter (gamma-naught, dB)", "roles": ["data"], "raster:bands": [DB_BAND]},
            "class": {"type": PNG, "title": "Open water and likely flooded vegetation", "roles": ["data", "visual"],
                      "classification:classes": class_list},
        },
        "assets": {
            "water_occurrence": product("water_occurrence", "Share of passes with open water", FRACTION_BAND),
            "flooded_veg_frequency": product("flooded_veg_frequency", "Share of passes with likely flooded vegetation",
                                             FRACTION_BAND),
            "hv_range": product("hv_range", "Vegetation swing: HV 95th minus 5th percentile (dB)", HV_RANGE_BAND),
            "hh_median": product("hh_median", "Median HH backscatter over the year (dB)", DB_BAND),
            "hv_median": product("hv_median", "Median HV backscatter over the year (dB)", DB_BAND),
            "rhythm": product("rhythm", "Surface rhythm: places grouped by how their radar signal moved through the year",
                              classes=rhythm),
            "manifest": {"href": "manifest.json", "type": "application/json", "roles": ["metadata"],
                         "title": "TerraPulse manifest: calibration, quality flags, zone statistics, rainfall"},
            "stack": {"href": "stack.bin", "type": "application/octet-stream", "roles": ["data"],
                      "title": "Coarse HH/HV time series cube, uint8 [time, pol, y, x], same dB encoding",
                      "raster:bands": [DB_BAND]},
        },
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "license", "href": f"{REPO}/blob/main/LICENSE", "type": "text/html"},
                  {"rel": "about", "href": f"{APP}#site={site['key']}", "type": "text/html", "title": "Open in TerraPulse"},
                  *({"rel": "item", "href": f"items/{d['date']}.json", "type": "application/geo+json"} for d in m["dates"])],
    }
    (root / "collection.json").write_text(json.dumps(collection, indent=1))
    return collection


def build(web_data: Path, log=print) -> Path:
    """Rebuild the whole catalog from every site listed in web_data/sites.json."""
    index = json.loads((web_data / "sites.json").read_text())
    links = [{"rel": "root", "href": "./catalog.json", "type": "application/json"},
             {"rel": "about", "href": APP, "type": "text/html", "title": "TerraPulse web app"},
             {"rel": "license", "href": f"{REPO}/blob/main/LICENSE", "type": "text/html"}]
    for s in index["sites"]:
        col = build_site(web_data / s["key"])
        links.append({"rel": "child", "href": f"{s['key']}/collection.json", "type": "application/json", "title": col["title"]})
        log(f"  stac: {s['key']} collection with {sum(1 for lk in col['links'] if lk['rel'] == 'item')} items")
    catalog = {"type": "Catalog", "stac_version": STAC_VERSION, "id": "terrapulse", "title": "TerraPulse NISAR surface change",
               "description": ("Open water, flooded vegetation, change and seasonal rhythm mapped from NASA-ISRO NISAR "
                               "L-band radar time series by the TerraPulse open-source pipeline."),
               "links": links}
    path = web_data / "catalog.json"
    path.write_text(json.dumps(catalog, indent=1))
    return path
