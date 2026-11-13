"""Pure NumPy map projection helpers (WGS84 UTM and Web Mercator).

pyproj is not required, so the pipeline runs on machines where compiled
projection libraries are unavailable. UTM uses the Kruger series
(accuracy far below one metre inside a UTM zone).
"""
from __future__ import annotations

import numpy as np

A_WGS84 = 6378137.0
F_WGS84 = 1 / 298.257223563
K0 = 0.9996
E0 = 500000.0
R_MERC = 6378137.0

_n = F_WGS84 / (2 - F_WGS84)
_A = A_WGS84 / (1 + _n) * (1 + _n**2 / 4 + _n**4 / 64)
_ALPHA = (
    _n / 2 - 2 / 3 * _n**2 + 5 / 16 * _n**3,
    13 / 48 * _n**2 - 3 / 5 * _n**3,
    61 / 240 * _n**3,
)
_BETA = (
    _n / 2 - 2 / 3 * _n**2 + 37 / 96 * _n**3,
    1 / 48 * _n**2 + 1 / 15 * _n**3,
    17 / 480 * _n**3,
)
_DELTA = (
    2 * _n - 2 / 3 * _n**2 - 2 * _n**3,
    7 / 3 * _n**2 - 8 / 5 * _n**3,
    56 / 15 * _n**3,
)
_C = 2 * np.sqrt(_n) / (1 + _n)


def utm_zone_from_epsg(epsg: int) -> tuple[int, bool]:
    """Return (zone, northern_hemisphere) for EPSG 326xx / 327xx."""
    if 32601 <= epsg <= 32660:
        return epsg - 32600, True
    if 32701 <= epsg <= 32760:
        return epsg - 32700, False
    raise ValueError(f"EPSG {epsg} is not a WGS84 UTM zone")


def _central_meridian(zone: int) -> float:
    return np.radians(-183.0 + 6.0 * zone)


def lonlat_to_utm(lon, lat, epsg: int):
    """WGS84 lon/lat (degrees) to UTM easting/northing (metres)."""
    zone, north = utm_zone_from_epsg(epsg)
    lam = np.radians(np.asarray(lon, dtype=np.float64)) - _central_meridian(zone)
    phi = np.radians(np.asarray(lat, dtype=np.float64))
    sphi = np.sin(phi)
    t = np.sinh(np.arctanh(sphi) - _C * np.arctanh(_C * sphi))
    xi_p = np.arctan2(t, np.cos(lam))
    eta_p = np.arctanh(np.sin(lam) / np.sqrt(1 + t**2))
    e = eta_p.copy()
    n = xi_p.copy()
    for j, a in enumerate(_ALPHA, start=1):
        e += a * np.cos(2 * j * xi_p) * np.sinh(2 * j * eta_p)
        n += a * np.sin(2 * j * xi_p) * np.cosh(2 * j * eta_p)
    easting = E0 + K0 * _A * e
    northing = K0 * _A * n + (0.0 if north else 10000000.0)
    return easting, northing


def utm_to_lonlat(easting, northing, epsg: int):
    """UTM easting/northing (metres) to WGS84 lon/lat (degrees)."""
    zone, north = utm_zone_from_epsg(epsg)
    x = np.asarray(easting, dtype=np.float64)
    y = np.asarray(northing, dtype=np.float64) - (0.0 if north else 10000000.0)
    xi = y / (K0 * _A)
    eta = (x - E0) / (K0 * _A)
    xi_p = xi.copy()
    eta_p = eta.copy()
    for j, b in enumerate(_BETA, start=1):
        xi_p -= b * np.sin(2 * j * xi) * np.cosh(2 * j * eta)
        eta_p -= b * np.cos(2 * j * xi) * np.sinh(2 * j * eta)
    chi = np.arcsin(np.sin(xi_p) / np.cosh(eta_p))
    phi = chi.copy()
    for j, d in enumerate(_DELTA, start=1):
        phi += d * np.sin(2 * j * chi)
    lam = _central_meridian(zone) + np.arctan2(np.sinh(eta_p), np.cos(xi_p))
    return np.degrees(lam), np.degrees(phi)


def lonlat_to_merc(lon, lat):
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    x = R_MERC * np.radians(lon)
    y = R_MERC * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    return x, y


def merc_to_lonlat(x, y):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    lon = np.degrees(x / R_MERC)
    lat = np.degrees(2 * np.arctan(np.exp(y / R_MERC)) - np.pi / 2)
    return lon, lat


def bbox_to_utm_extent(bbox, epsg: int, densify: int = 50):
    """Densified lon/lat bbox (W, S, E, N) to UTM (xmin, ymin, xmax, ymax)."""
    w, s, e, n = bbox
    t = np.linspace(0, 1, densify)
    lon = np.concatenate([w + (e - w) * t, np.full(densify, e), e - (e - w) * t, np.full(densify, w)])
    lat = np.concatenate([np.full(densify, s), s + (n - s) * t, np.full(densify, n), n - (n - s) * t])
    x, y = lonlat_to_utm(lon, lat, epsg)
    return float(x.min()), float(y.min()), float(x.max()), float(y.max())


def self_test() -> None:
    """Round trip and a known reference point (Hyderabad, Sindh in zone 42N)."""
    lon, lat = np.array([68.37, 67.0, 69.9]), np.array([25.38, 24.0, 26.2])
    x, y = lonlat_to_utm(lon, lat, 32642)
    lon2, lat2 = utm_to_lonlat(x, y, 32642)
    assert np.allclose(lon, lon2, atol=1e-9) and np.allclose(lat, lat2, atol=1e-9)
    # Central meridian of zone 42 is 69E: easting must be exactly 500 km there.
    xc, _ = lonlat_to_utm(69.0, 25.0, 32642)
    assert abs(float(xc) - 500000.0) < 1e-6
    mx, my = lonlat_to_merc(lon, lat)
    lon3, lat3 = merc_to_lonlat(mx, my)
    assert np.allclose(lon, lon3) and np.allclose(lat, lat3)
