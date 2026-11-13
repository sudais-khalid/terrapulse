import json
import shutil
from pathlib import Path

import numpy as np
import pystac
import pytest

from terrapulse.export import DB_MAX, DB_MIN, quantize_db
from terrapulse.geo import merc_to_lonlat
from terrapulse.stac import APP, DB_BAND, _color_hint, _start_time, build

WEB = Path(__file__).resolve().parents[1] / "web" / "data"


@pytest.fixture
def catalog(tmp_path):
    """Build the catalog from the published manifests into a fresh scratch copy for each test."""
    out = tmp_path
    shutil.copy(WEB / "sites.json", out / "sites.json")
    for s in json.loads((WEB / "sites.json").read_text())["sites"]:
        (out / s["key"]).mkdir()
        shutil.copy(WEB / s["key"] / "manifest.json", out / s["key"] / "manifest.json")
    return build(out, log=lambda *_: None)


def test_one_item_per_pass(catalog):
    root = catalog.parent
    for s in json.loads((root / "sites.json").read_text())["sites"]:
        col = json.loads((root / s["key"] / "collection.json").read_text())
        items = [lk for lk in col["links"] if lk["rel"] == "item"]
        assert len(items) == s["passes"]
        item = json.loads((root / s["key"] / items[0]["href"]).read_text())
        assert item["id"] == f"{s['key']}-{s['first']}"
        assert item["properties"]["datetime"].startswith(s["first"])
        assert item["properties"]["sar:frequency_band"] == "L"


def test_raster_scale_offset_recover_db():
    db = np.linspace(DB_MIN, DB_MAX, 500)
    q = quantize_db(db).astype(float)
    back = q * DB_BAND["scale"] + DB_BAND["offset"]
    assert np.max(np.abs(back - db)) <= DB_BAND["scale"] / 2 + 1e-9


def test_projection_transform_matches_image_corners(catalog):
    root = catalog.parent
    m = json.loads((root / "lower-indus" / "manifest.json").read_text())
    item = json.loads(next((root / "lower-indus" / "items").glob("*.json")).read_text())
    a, _, c, _, e, f = item["properties"]["proj:transform"]
    h, w = item["properties"]["proj:shape"]
    lon_e, lat_s = merc_to_lonlat(c + a * w, f + e * h)
    assert (float(lon_e), float(lat_s)) == pytest.approx(tuple(m["image"]["corners"][2]), abs=1e-6)


def test_catalog_validates_against_stac_schemas(catalog):
    # Downloads the official STAC and extension JSON schemas: needs network access.
    n = pystac.Catalog.from_file(str(catalog)).validate_all()
    assert n == sum(s["passes"] for s in json.loads((catalog.parent / "sites.json").read_text())["sites"])


def test_color_hints():
    assert _color_hint("#1f6fd1") == "1F6FD1"
    assert _color_hint("#8a90a866") == "8A90A8"   # semi-transparent: colour kept
    assert _color_hint("#00000000") is None        # fully transparent: no hint


def test_class_codes_carry_the_map_colours(catalog):
    item = json.loads(next((catalog.parent / "lower-indus" / "items").glob("*.json")).read_text())
    classes = {c["value"]: c for c in item["assets"]["class"]["classification:classes"]}
    assert set(classes) == {1, 2, 3, 4}
    assert "color_hint" not in classes[1]          # land is drawn transparent
    assert classes[2]["color_hint"] == "1F6FD1"    # open water
    assert classes[3]["color_hint"] == "B04FD6"    # flooded vegetation
    col = json.loads((catalog.parent / "lower-indus" / "collection.json").read_text())
    rhythm = col["assets"]["rhythm"]["classification:classes"]
    assert [c["value"] for c in rhythm] == list(range(1, 9)) and all(len(c["color_hint"]) == 6 for c in rhythm)


def test_catalog_root_links(catalog):
    root = json.loads(catalog.read_text())
    assert root["id"] == "terrapulse" and root["stac_version"] == "1.1.0"
    about = [lk for lk in root["links"] if lk["rel"] == "about"]
    assert about == [{"rel": "about", "href": APP, "type": "text/html", "title": "TerraPulse web app"}]
    children = {lk["href"]: lk["title"] for lk in root["links"] if lk["rel"] == "child"}
    assert children == {"lower-indus/collection.json": "TerraPulse: Lower Indus, Sindh, Pakistan",
                        "amazon-manaus/collection.json": "TerraPulse: Amazon at Manaus, Brazil"}


@pytest.mark.parametrize("key", ["lower-indus", "amazon-manaus"])
def test_every_item_carries_its_pass_metadata(catalog, key):
    root = catalog.parent / key
    m = json.loads((root / "manifest.json").read_text())
    for d in m["dates"]:
        item = json.loads((root / "items" / f"{d['date']}.json").read_text())
        p = item["properties"]
        assert item["id"] == f"{key}-{d['date']}" and item["collection"] == key
        assert p["datetime"][:10] == d["date"] and p["datetime"].endswith("Z")
        assert p["sar:instrument_mode"] == d["mode"] and p["sar:polarizations"] == ["HH", "HV"]
        assert p["sat:relative_orbit"] == m["site"]["track"] and p["sat:orbit_state"] == "descending"
        assert {k: p[k] for k in p if k.startswith("terrapulse:")} == {
            "terrapulse:maturity": d["maturity"], "terrapulse:crid": d["crid"],
            "terrapulse:core_series": bool(d["core"]), "terrapulse:source_granule": d["scene"],
            "terrapulse:water_threshold_hh_db": d["thr_hh"], "terrapulse:water_threshold_hv_db": d["thr_hv"],
            "terrapulse:wind_roughened": d["wind_roughened"],
            "terrapulse:rain_3d_mm": d["rain_3d_mm"], "terrapulse:rain_affected": d["rain_affected"],
        }
        assert {a: v["href"] for a, v in item["assets"].items()} == {
            k: f"../dates/{d['date']}_{k}.png" for k in ("hh", "hv", "class")}
        derived = [lk["href"] for lk in item["links"] if lk["rel"] == "derived_from"]
        assert len(derived) == 1 and derived[0].endswith(d["scene"])


def test_collection_template_matches_items(catalog):
    root = catalog.parent / "amazon-manaus"
    col = json.loads((root / "collection.json").read_text())
    item = json.loads(next((root / "items").glob("*.json")).read_text())
    assert set(col["item_assets"]) == set(item["assets"])
    for k, tmpl in col["item_assets"].items():
        for field in ("type", "title", "roles", "raster:bands", "classification:classes"):
            assert tmpl.get(field) == item["assets"][k].get(field), (k, field)


def test_collection_summaries_and_links(catalog):
    col = json.loads((catalog.parent / "lower-indus" / "collection.json").read_text())
    sm = col["summaries"]
    assert sm["sar:polarizations"] == ["HH", "HV"] and sm["sar:frequency_band"] == ["L"]
    assert sm["sar:product_type"] == ["GCOV"] and sm["platform"] == ["nisar"]
    assert sm["terrapulse:maturity"] == ["PROVISIONAL", "VALIDATED"]
    assert col["license"] == "Apache-2.0"
    root = json.loads(catalog.read_text())
    for links in (col["links"], root["links"]):
        lic = [lk for lk in links if lk["rel"] == "license"]
        assert lic == [{"rel": "license", "href": "https://github.com/sudais-khalid/terrapulse/blob/main/LICENSE",
                        "type": "text/html"}]


def test_pass_time_comes_from_the_scene_name():
    scene = "NISAR_L2_PR_GCOV_023_140_D_090_4005_DHDH_A_20260623T221633_20260623T221711_P05023_N_F_J_001"
    assert _start_time(scene, "2026-06-23") == "2026-06-23T22:16:33Z"
    assert _start_time("", "2026-06-23") == "2026-06-23T00:00:00Z"   # no scene name: start of day


def test_collection_assets_point_at_real_files(catalog):
    for key in ("lower-indus", "amazon-manaus"):
        col = json.loads((catalog.parent / key / "collection.json").read_text())
        products = {"water_occurrence", "flooded_veg_frequency", "hv_range", "hh_median", "hv_median", "rhythm"}
        assert set(col["assets"]) == products | {"manifest", "stack"}
        for name, asset in col["assets"].items():
            assert (WEB / key / asset["href"]).is_file(), (key, name)
            if name in products:
                assert asset["href"] == f"products/{name}.png" and asset["type"] == "image/png"


def _same(a, b, where="") -> None:
    """Deep equality with a tolerance for floats (platform rounding)."""
    if isinstance(a, float) or isinstance(b, float):
        assert a == pytest.approx(b, rel=1e-9, abs=1e-9), where
    elif isinstance(a, dict):
        assert isinstance(b, dict) and a.keys() == b.keys(), (where, sorted(set(a) ^ set(b)))
        for k in a:
            _same(a[k], b[k], f"{where}/{k}")
    elif isinstance(a, list):
        assert isinstance(b, list) and len(a) == len(b), where
        for i, (x, y) in enumerate(zip(a, b, strict=True)):
            _same(x, y, f"{where}[{i}]")
    else:
        assert a == b, where


def test_rebuilt_catalog_matches_the_published_one(catalog):
    """Golden files: any change to the catalog output must be regenerated (python -m terrapulse stac) and reviewed."""
    built = sorted(p.relative_to(catalog.parent) for p in catalog.parent.rglob("*.json") if p.name != "manifest.json")
    published = sorted(p.relative_to(WEB) for p in WEB.rglob("*.json") if p.name != "manifest.json")
    assert built == published
    for rel in built:
        _same(json.loads((catalog.parent / rel).read_text()), json.loads((WEB / rel).read_text()), str(rel))
