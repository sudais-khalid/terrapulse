"""Command line: python -m terrapulse <stage> [--site lower-indus]

Stages:
  search   find NISAR GCOV granules and pick one product per date
  ingest   stream each date's AOI into the common 100 m grid (resumable)
  process  compute products and write web layers to web/data/<site>
  all      search + ingest + process
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import catalog
from .config import SITES
from .geo import self_test
from .ingest import Grid, ingest_granule
from .remote import get_token


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="terrapulse")
    ap.add_argument("stage", choices=["search", "ingest", "process", "all"])
    ap.add_argument("--site", default="lower-indus", choices=sorted(SITES))
    ap.add_argument("--cache", default="cache", help="working directory for intermediate data")
    ap.add_argument("--web", default="web/data", help="output folder for web layers")
    ap.add_argument("--no-rain", action="store_true", help="skip the NASA POWER rainfall download")
    ap.add_argument("--workers", type=int, default=8, help="parallel HTTP range requests")
    ap.add_argument("--dates", nargs="*", help="only these dates (YYYY-MM-DD)")
    ap.add_argument("--limit", type=int, help="only the first N dates")
    args = ap.parse_args(argv)

    self_test()
    site = SITES[args.site]
    root = Path(args.cache) / site.key
    granules_path = root / "granules.json"

    if args.stage == "process":
        return process(site, root, Path(args.web) / site.key, rain=not args.no_rain)

    if args.stage == "search" or not granules_path.exists():
        found = catalog.search(site)
        chosen = catalog.select(found)
        catalog.save(chosen, granules_path)
        print(f"{len(found)} granules found, {len(chosen)} dates selected -> {granules_path}")
        for g in chosen:
            print(f"  {g.date}  {g.maturity:11s} {g.crid}  {g.mode} {g.pol}  core={g.core}")
        if args.stage == "search":
            return 0

    granules = catalog.load(granules_path)
    if args.dates:
        granules = [g for g in granules if g.date in set(args.dates)]
    if args.limit:
        granules = granules[: args.limit]

    token = get_token()
    grid_path = root / "grid.json"
    grid = Grid.load(grid_path) if grid_path.exists() else None
    failures = []
    for i, g in enumerate(granules, 1):
        print(f"[{i}/{len(granules)}] {g.date} {g.maturity} {g.scene}")
        try:
            if grid is None:
                from .ingest import open_h5
                from .config import GCOV_GROUP
                h5, f = open_h5(g.url, token)
                epsg = int(h5[GCOV_GROUP]["projection"].attrs["epsg_code"])
                h5.close(); f.close()
                grid = Grid.for_site(site, epsg)
                root.mkdir(parents=True, exist_ok=True)
                grid.save(grid_path)
                print(f"  grid: EPSG {grid.epsg}, {grid.width} x {grid.height} cells at {grid.res:.0f} m")
            ingest_granule(g, site, token, root / "dates", grid=grid, workers=args.workers)
        except Exception as e:  # keep going; report at the end
            print(f"  FAILED {g.date}: {type(e).__name__}: {e}")
            failures.append(g.date)
    if failures:
        print(f"Failed dates (re-run to retry): {' '.join(failures)}")
        return 1
    if args.stage == "all":
        return process(site, root, Path(args.web) / site.key, rain=not args.no_rain)
    return 0


def process(site, root: Path, out: Path, rain: bool = True) -> int:
    import warnings

    from .export import export
    from .products import compute, load_stack

    # Empty pixels outside the radar swath raise harmless all-NaN warnings.
    warnings.filterwarnings("ignore", category=RuntimeWarning)

    stack = load_stack(root)
    print(f"process: {len(stack.dates)} dates, grid {stack.grid.width} x {stack.grid.height}")
    res = compute(stack, site)
    rain_data = None
    if rain:
        from .rain import fetch
        try:
            rain_data = fetch(site)
        except Exception as e:
            print(f"  rainfall skipped: {e}")
    export(stack, res, site, out, rain=rain_data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
