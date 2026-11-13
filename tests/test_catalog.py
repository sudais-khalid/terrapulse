from terrapulse.catalog import Granule, _parse, select
from terrapulse.config import BETA_COLLECTION, CORE_COLLECTION, VALIDATED_COLLECTION

SCENE = "NISAR_L2_PR_GCOV_033_164_D_076_4005_DHDH_A_20260707T011122_20260707T011157_P05023_N_F_J_002"


def g(date, collection=CORE_COLLECTION, crid="P05023", counter=1):
    return Granule(date=date, start_time=date + "T01:11:22Z", scene=f"S_{date}_{crid}_{counter}", url="",
                   collection=collection, crid=crid, mode="4005", pol="DHDH", bandwidth="40", counter=counter, core=False)


def test_parse_scene_name():
    assert _parse(SCENE) == {"mode": "4005", "pol": "DHDH", "crid": "P05023", "counter": 2}


def test_select_keeps_one_product_per_date_from_the_majority_crid():
    chosen = select([
        g("2026-07-07"), g("2026-07-19"), g("2026-08-12"),
        g("2026-07-07", crid="P05010"),          # reprocessed by another software version
        g("2026-08-24", crid="P05010"),          # only available in the minority CRID
    ])
    assert [c.date for c in chosen] == ["2026-07-07", "2026-07-19", "2026-08-12", "2026-08-24"]
    by_date = {c.date: c for c in chosen}
    assert by_date["2026-07-07"].crid == "P05023" and by_date["2026-07-07"].core
    assert not by_date["2026-08-24"].core


def test_select_drops_beta_and_keeps_validated():
    chosen = select([g("2026-10-11"), g("2026-10-23", collection=VALIDATED_COLLECTION, crid="P05036"),
                     g("2026-10-23", collection=BETA_COLLECTION), g("2026-11-04", collection=BETA_COLLECTION)])
    assert [(c.date, c.maturity) for c in chosen] == [("2026-10-11", "PROVISIONAL"), ("2026-10-23", "VALIDATED")]


def test_select_prefers_highest_counter_for_duplicates():
    chosen = select([g("2026-07-07", counter=1), g("2026-07-07", counter=3)])
    assert len(chosen) == 1 and chosen[0].counter == 3
