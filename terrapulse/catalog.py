"""Find NISAR GCOV granules for a site and pick one clean product per date."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .config import BETA_COLLECTION, CORE_COLLECTION, VALIDATED_COLLECTION, Site


@dataclass
class Granule:
    date: str
    start_time: str
    scene: str
    url: str
    collection: str
    crid: str
    mode: str
    pol: str
    bandwidth: str
    counter: int
    core: bool  # part of the single-CRID core time series

    @property
    def maturity(self) -> str:
        if self.collection == VALIDATED_COLLECTION:
            return "VALIDATED"
        if self.collection == BETA_COLLECTION:
            return "BETA"
        return "PROVISIONAL"


def _parse(scene: str) -> dict:
    # NISAR_L2_PR_GCOV_033_164_D_076_4005_DHDH_A_<start>_<stop>_P05036_N_F_J_001
    p = scene.split("_")
    return {"mode": p[8], "pol": p[9], "crid": p[13], "counter": int(p[-1])}


def search(site: Site) -> list[Granule]:
    import asf_search as asf

    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        intersectsWith=site.wkt,
        relativeOrbit=site.track,
        frame=site.frame,
        flightDirection=site.direction,
        start=site.start,
        end=site.end,
        maxResults=1000,
    )
    out = []
    for g in results:
        pr = g.properties
        scene = pr.get("sceneName") or pr["fileID"]
        meta = _parse(scene)
        bw = pr.get("rangeBandwidth") or [""]
        out.append(Granule(
            date=pr["startTime"][:10],
            start_time=pr["startTime"],
            scene=scene,
            url=pr["url"],
            collection=pr.get("collectionName", ""),
            crid=meta["crid"],
            mode=meta["mode"],
            pol=meta["pol"],
            bandwidth=bw[0] if isinstance(bw, list) else str(bw),
            counter=meta["counter"],
            core=False,
        ))
    return out


def select(granules: list[Granule]) -> list[Granule]:
    """One product per date.

    Core series: the PROVISIONAL collection with its most common CRID, so the
    whole series comes from one processing version. VALIDATED products are kept
    (flagged core=False) because they postdate the PROVISIONAL series. BETA is dropped.
    """
    prov = [g for g in granules if g.collection == CORE_COLLECTION]
    crids = {}
    for g in prov:
        crids[g.crid] = crids.get(g.crid, 0) + 1
    core_crid = max(crids, key=crids.get) if crids else None

    by_date: dict[str, Granule] = {}
    for g in granules:
        if g.collection == BETA_COLLECTION:
            continue
        g.core = g.collection == CORE_COLLECTION and g.crid == core_crid
        cur = by_date.get(g.date)
        rank = (g.core or g.collection == VALIDATED_COLLECTION, g.collection == VALIDATED_COLLECTION, g.crid, g.counter)
        if cur is None:
            by_date[g.date] = g
        else:
            cur_rank = (cur.core or cur.collection == VALIDATED_COLLECTION, cur.collection == VALIDATED_COLLECTION, cur.crid, cur.counter)
            if rank > cur_rank:
                by_date[g.date] = g
    return [by_date[d] for d in sorted(by_date)]


def save(granules: list[Granule], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([asdict(g) for g in granules], indent=1))


def load(path: Path) -> list[Granule]:
    return [Granule(**d) for d in json.loads(path.read_text())]
