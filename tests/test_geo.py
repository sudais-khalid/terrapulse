import numpy as np
import pytest

from terrapulse.geo import (
    bbox_to_utm_extent,
    lonlat_to_merc,
    lonlat_to_utm,
    merc_to_lonlat,
    self_test,
    utm_to_lonlat,
    utm_zone_from_epsg,
)


def test_builtin_self_test():
    self_test()


@pytest.mark.parametrize("epsg, zone, north", [(32642, 42, True), (32721, 21, False), (32601, 1, True)])
def test_zone_from_epsg(epsg, zone, north):
    assert utm_zone_from_epsg(epsg) == (zone, north)


def test_central_meridian_is_500_km_east():
    # Zone 21S (Manaus grid) has its central meridian at 57 W.
    x, _ = lonlat_to_utm(-57.0, -3.1, 32721)
    assert float(x) == pytest.approx(500_000.0, abs=1e-6)


@pytest.mark.parametrize("epsg, lon, lat", [(32642, 68.37, 25.38), (32721, -60.02, -3.10)])
def test_utm_round_trip_sub_millimetre(epsg, lon, lat):
    lons = lon + np.linspace(-1.5, 1.5, 7)
    lats = lat + np.linspace(-1.0, 1.0, 7)
    x, y = lonlat_to_utm(lons, lats, epsg)
    lon2, lat2 = utm_to_lonlat(x, y, epsg)
    # 1e-9 degrees is about 0.1 mm on the ground.
    assert np.allclose(lons, lon2, atol=1e-9)
    assert np.allclose(lats, lat2, atol=1e-9)


def test_southern_hemisphere_false_northing():
    _, y = lonlat_to_utm(-60.0, -3.1, 32721)
    assert 9_000_000 < float(y) < 10_000_000


def test_mercator_known_values():
    x, y = lonlat_to_merc(180.0, 0.0)
    assert float(x) == pytest.approx(20037508.342789244)
    assert float(y) == pytest.approx(0.0, abs=1e-9)
    lon, lat = merc_to_lonlat(*lonlat_to_merc(68.37, 25.38))
    assert (float(lon), float(lat)) == pytest.approx((68.37, 25.38))


def test_bbox_extent_contains_corners():
    bbox = (67.70, 24.30, 68.95, 25.50)
    xmin, ymin, xmax, ymax = bbox_to_utm_extent(bbox, 32642)
    for lon in (bbox[0], bbox[2]):
        for lat in (bbox[1], bbox[3]):
            x, y = lonlat_to_utm(lon, lat, 32642)
            assert xmin <= float(x) <= xmax and ymin <= float(y) <= ymax
