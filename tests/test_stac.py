import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from terrapulse.export import DB_MAX, DB_MIN, quantize_db
from terrapulse.geo import merc_to_lonlat
from terrapulse.stac import DB_BAND, build

WEB = Path(__file__).resolve().parents[1] / "web" / "data"
pytestmark = pytest.mark.skipif(not (WEB / "sites.json").exists(), reason="web/data not exported")


@pytest.fixture(scope="module")
def catalog(tmp_path_factory):
    """Build the catalog from the published manifests into a scratch copy."""
    out = tmp_path_factory.mktemp("web")
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
    pystac = pytest.importorskip("pystac")
    pytest.importorskip("jsonschema")
    try:
        n = pystac.Catalog.from_file(str(catalog)).validate_all()
    except pystac.errors.STACValidationError:
        raise
    except Exception as e:  # schema download blocked (offline run)
        pytest.skip(f"schemas unavailable: {e}")
    assert n > 0
