import numpy as np
import pytest
from PIL import Image

from terrapulse.export import DB_MAX, DB_MIN, DB_STEP, RAIN_AFFECTED_MM, flag_rain_affected, quantize_db, save_png


def dequantize(q: np.ndarray) -> np.ndarray:
    """The inverse used by the web app (web/assets/raster.js)."""
    out = np.full(q.shape, np.nan)
    ok = q > 0
    out[ok] = DB_MIN + (q[ok].astype(float) - 1) * DB_STEP
    return out


def test_quantize_round_trip_within_half_step():
    db = np.linspace(DB_MIN, DB_MAX, 1001)
    back = dequantize(quantize_db(db))
    assert np.nanmax(np.abs(back - db)) <= DB_STEP / 2 + 1e-9


def test_quantize_reserves_zero_for_nodata_and_clips():
    q = quantize_db(np.array([np.nan, -80.0, 40.0, -35.0, 5.0]))
    assert q.tolist() == [0, 1, 255, 1, 255]
    assert q.dtype == np.uint8


def test_rain_flag_uses_pass_day_and_two_days_before():
    daily = {"2026-09-25": 10.0, "2026-09-26": 8.0, "2026-09-27": 6.1, "2026-09-24": 99.0}
    entries = [{"date": "2026-09-27"}]
    flagged = flag_rain_affected(entries, daily)
    assert flagged == ["2026-09-27"]
    assert entries[0]["rain_3d_mm"] == pytest.approx(24.1)


def test_rain_flag_threshold_is_inclusive():
    entries = [{"date": "2026-01-03"}]
    flag_rain_affected(entries, {"2026-01-03": RAIN_AFFECTED_MM})
    assert entries[0]["rain_affected"] is True
    flag_rain_affected(entries, {"2026-01-03": RAIN_AFFECTED_MM - 0.1})
    assert entries[0]["rain_affected"] is False


def test_rain_flag_without_data_is_not_flagged():
    entries = [{"date": "2026-01-03"}]
    assert flag_rain_affected(entries, {"2025-12-01": 50.0}) == []
    assert entries[0]["rain_3d_mm"] is None and entries[0]["rain_affected"] is False


def test_palette_png_index_zero_is_transparent(tmp_path):
    a = np.array([[0, 1], [2, 3]], np.uint8)
    path = tmp_path / "class.png"
    save_png(a, path, palette=["#000000", "#00000000", "#1f6fd1", "#b04fd6"])
    im = Image.open(path)
    assert im.mode == "P"
    rgba = np.array(im.convert("RGBA"))
    assert rgba[0, 0, 3] == 0          # no data
    assert rgba[0, 1, 3] == 0          # land, fully transparent by design
    assert tuple(rgba[1, 0]) == (0x1F, 0x6F, 0xD1, 255)


def test_grey_png_keeps_values(tmp_path):
    a = np.arange(256, dtype=np.uint8).reshape(16, 16)
    path = tmp_path / "hh.png"
    save_png(a, path)
    assert np.array_equal(np.array(Image.open(path)), a)
