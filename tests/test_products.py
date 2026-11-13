import numpy as np

from terrapulse.products import RHYTHM_CLASSES, _rhythm_name, kmeans, otsu


def test_otsu_splits_water_from_land():
    rng = np.random.default_rng(0)
    water = rng.normal(-24, 1.2, 4000)   # calm water, dark in HH
    land = rng.normal(-9, 2.0, 12000)    # fields and desert
    t = otsu(np.concatenate([water, land, [np.nan]]), -35, 5)
    assert -20 < t < -13


def test_kmeans_recovers_separated_clusters():
    rng = np.random.default_rng(1)
    centres = np.array([[0.0, 0.0], [10.0, 0.0], [0.0, 10.0]])
    x = np.concatenate([c + rng.normal(0, 0.3, (200, 2)) for c in centres])
    c, lab = kmeans(x, 3)
    found = np.array(sorted(map(tuple, np.round(c))))
    assert np.array_equal(found, np.array(sorted(map(tuple, centres))))
    assert len(np.unique(lab)) == 3


def test_kmeans_is_deterministic():
    x = np.random.default_rng(2).normal(size=(300, 4))
    a, la = kmeans(x, 4)
    b, lb = kmeans(x, 4)
    assert np.array_equal(a, b) and np.array_equal(la, lb)


def test_rhythm_rules_name_physical_classes():
    # hh_med, hv_med, hh_std, hv_std, occurrence, hv_range, flood_freq
    assert _rhythm_name((-22, -28, 1, 1, 0.9, 1, 0)) == 1      # permanent water
    assert _rhythm_name((-14, -22, 3, 2, 0.3, 4, 0)) == 2      # seasonal water
    assert _rhythm_name((-7, -16, 2, 1, 0.0, 3, 0.3)) == 3     # flood-prone vegetation
    assert _rhythm_name((-2, -12, 1, 1, 0.0, 2, 0)) == 6       # built-up
    assert _rhythm_name((-9, -18, 2, 2.5, 0.0, 8, 0)) == 4     # active cropland
    assert _rhythm_name((-7, -13, 1, 1, 0.0, 2, 0)) == 5       # forest
    assert _rhythm_name((-16, -27, 1, 1, 0.0, 1, 0)) == 7      # desert
    assert _rhythm_name((-12, -20, 1, 1, 0.0, 3, 0)) == 8      # sparse vegetation
    assert {c[0] for c in RHYTHM_CLASSES} == set(range(1, 9))
