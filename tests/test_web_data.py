"""Contract tests for the published web data: what the browser app relies on."""
import json
from pathlib import Path

import pytest
from PIL import Image

WEB = Path(__file__).resolve().parents[1] / "web" / "data"
SITES = json.loads((WEB / "sites.json").read_text())["sites"] if (WEB / "sites.json").exists() else []

pytestmark = pytest.mark.skipif(not SITES, reason="web/data not exported")


@pytest.fixture(params=[s["key"] for s in SITES])
def site(request):
    root = WEB / request.param
    return root, json.loads((root / "manifest.json").read_text())


def test_index_matches_manifests(site):
    root, m = site
    entry = next(s for s in SITES if s["key"] == m["site"]["key"])
    assert entry["passes"] == len(m["dates"])
    assert entry["first"] == m["dates"][0]["date"] and entry["last"] == m["dates"][-1]["date"]


def test_dates_are_sorted_unique_and_complete(site):
    root, m = site
    dates = [d["date"] for d in m["dates"]]
    assert dates == sorted(set(dates))
    for d in dates:
        for kind in ("hh", "hv", "class"):
            assert (root / "dates" / f"{d}_{kind}.png").is_file(), f"missing {d}_{kind}.png"


def test_layers_share_the_manifest_grid(site):
    root, m = site
    size = (m["image"]["width"], m["image"]["height"])
    for png in [*(root / "products").glob("*.png"), root / "dates" / f"{m['dates'][0]['date']}_class.png"]:
        assert Image.open(png).size == size, png.name


def test_time_series_stack_size(site):
    root, m = site
    s = m["stack"]
    assert (root / s["file"]).stat().st_size == len(m["dates"]) * 2 * s["width"] * s["height"]


def test_quality_flags_and_thresholds(site):
    _, m = site
    for d in m["dates"]:
        assert d["maturity"] in {"PROVISIONAL", "VALIDATED"}
        assert -30 < d["thr_hh"] < -5 and -35 < d["thr_hv"] < -10
        assert isinstance(d["wind_roughened"], bool)
        if m.get("rain"):
            assert isinstance(d["rain_affected"], bool)


def test_zones_have_one_value_per_pass(site):
    _, m = site
    T = len(m["dates"])
    for key, z in m["zones"].items():
        for series in z.values():
            if isinstance(series, list):
                assert len(series) == T, key
