"""Stream one NISAR GCOV granule's AOI into the site's common 100 m UTM grid."""
from __future__ import annotations

import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .catalog import Granule
from .config import GCOV_GROUP, POLS, Site
from .geo import bbox_to_utm_extent
from .remote import SignedUrl, chunk_index, decode_chunk, fetch_chunks, filter_pipeline, open_h5


@dataclass
class Grid:
    """North-up analysis grid in UTM. Cell (r, c) covers x0+c*res .. +res, y1-r*res .. -res."""
    epsg: int
    x0: float
    y1: float
    res: float
    width: int
    height: int

    @classmethod
    def for_site(cls, site: Site, epsg: int) -> "Grid":
        xmin, ymin, xmax, ymax = bbox_to_utm_extent(site.bbox, epsg)
        r = float(site.res_m)
        x0, x1 = math.floor(xmin / r) * r, math.ceil(xmax / r) * r
        y0, y1 = math.floor(ymin / r) * r, math.ceil(ymax / r) * r
        return cls(epsg, x0, y1, r, int(round((x1 - x0) / r)), int(round((y1 - y0) / r)))

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=1))

    @classmethod
    def load(cls, path: Path) -> "Grid":
        return cls(**json.loads(path.read_text()))


def _window(coords: np.ndarray, lo: float, hi: float) -> tuple[int, int]:
    """Index range [i0, i1) of pixel centres inside [lo, hi). Works for ascending or descending coords."""
    inside = np.nonzero((coords >= lo) & (coords < hi))[0]
    if inside.size == 0:
        return 0, 0
    return int(inside[0]), int(inside[-1]) + 1


def ingest_granule(g: Granule, site: Site, token: str, out_dir: Path, grid: Grid | None = None,
                   workers: int = 8, log=print) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{g.date}.npz"
    if out.exists():
        with np.load(out) as z:
            if "masked" in z.files:
                log(f"  {g.date}: cached")
                return out
        log(f"  {g.date}: cache predates the validity mask, rebuilding")

    t0 = time.time()
    h5, fobj = open_h5(g.url, token)
    try:
        grp = h5[GCOV_GROUP]
        epsg = int(grp["projection"].attrs["epsg_code"])
        x = grp["xCoordinates"][:]
        y = grp["yCoordinates"][:]
        spacing = float(abs(x[1] - x[0]))
        if grid is None:
            grid = Grid.for_site(site, epsg)
        if epsg != grid.epsg:
            raise RuntimeError(f"{g.date}: EPSG {epsg} differs from grid EPSG {grid.epsg}")

        gx1 = grid.x0 + grid.width * grid.res
        gy0 = grid.y1 - grid.height * grid.res
        c0, c1 = _window(x, grid.x0, gx1)
        r0, r1 = _window(y, gy0, grid.y1)
        if c1 <= c0 or r1 <= r0:
            raise RuntimeError(f"{g.date}: granule does not overlap the site grid")

        refs, meta = [], {}
        for pol in POLS:
            if pol not in grp:
                raise RuntimeError(f"{g.date}: {pol} missing in product")
            d = grp[pol]
            meta[d.name] = (pol, filter_pipeline(d), d.chunks, d.dtype, d.shape)
            refs += chunk_index(d, (r0, r1), (c0, c1))

        # Validity mask (NISAR GCOV): 0 = built from partially focused samples (swath gaps),
        # 1..n = subswath number (valid), 255 = outside the acquisition.
        mask_refs = []
        if "mask" in grp and grp["mask"].chunks == grp[POLS[0]].chunks:
            md = grp["mask"]
            meta[md.name] = ("mask", filter_pipeline(md), md.chunks, md.dtype, md.shape)
            mask_refs = chunk_index(md, (r0, r1), (c0, c1))
        else:
            log(f"  {g.date}: no usable mask layer, keeping all positive samples")
        log(f"  {g.date} {g.mode} {g.pol} {spacing:.0f} m: window rows {r0}-{r1} cols {c0}-{c1}, {len(refs)} chunks, index {time.time() - t0:.0f}s")

        # Verify our decoder against h5py on one chunk before trusting it.
        first = refs[0]
        pol, filters, cshape, dtype, shape = meta[first.dataset]
        signed = SignedUrl(g.url, token)
        sample = next(fetch_chunks(signed, [first], lambda raw, ref: decode_chunk(raw, ref, filters, cshape, dtype), workers=1, log=lambda *_: None))[1]
        rr, cc = min(first.row + cshape[0], shape[0]), min(first.col + cshape[1], shape[1])
        ref_vals = grp[pol][first.row:rr, first.col:cc]
        if not np.array_equal(np.nan_to_num(sample[: rr - first.row, : cc - first.col]), np.nan_to_num(ref_vals)):
            raise RuntimeError("chunk decoder self-check failed")
    finally:
        h5.close()
        fobj.close()

    H, W, res = grid.height, grid.width, grid.res
    sums = {p: np.zeros((H, W), np.float64) for p in POLS}
    cnts = {p: np.zeros((H, W), np.int32) for p in POLS}

    def decode(raw, ref):
        _, filters, cshape, dtype, _ = meta[ref.dataset]
        return decode_chunk(raw, ref, filters, cshape, dtype)

    masks = {}
    if mask_refs:
        for ref, arr in fetch_chunks(signed, mask_refs, decode, workers=workers, log=lambda *_: None):
            masks[(ref.row, ref.col)] = arr
    n_masked = 0

    for ref, arr in fetch_chunks(signed, refs, decode, workers=workers, log=log):
        pol, _, cshape, _, shape = meta[ref.dataset]
        rr = min(ref.row + cshape[0], shape[0])
        cc = min(ref.col + cshape[1], shape[1])
        a = arr[: rr - ref.row, : cc - ref.col]
        trow = np.floor((grid.y1 - y[ref.row:rr]) / res).astype(np.int64)
        tcol = np.floor((x[ref.col:cc] - grid.x0) / res).astype(np.int64)
        rin = (trow >= 0) & (trow < H)
        cin = (tcol >= 0) & (tcol < W)
        if not rin.any() or not cin.any():
            continue
        a = a[rin][:, cin]
        trow, tcol = trow[rin], tcol[cin]
        valid = np.isfinite(a) & (a > 0)
        mk = masks.get((ref.row, ref.col))
        if mk is not None:
            mk = mk[: rr - ref.row, : cc - ref.col][rin][:, cin]
            good = (mk >= 1) & (mk != 255)
            if pol == POLS[0]:
                n_masked += int((valid & ~good).sum())
            valid &= good
        if not valid.any():
            continue
        tr0, tc0 = trow.min(), tcol.min()
        nr, nc = trow.max() - tr0 + 1, tcol.max() - tc0 + 1
        idx = ((trow - tr0)[:, None] * nc + (tcol - tc0)[None, :])[valid]
        s = np.bincount(idx, weights=a[valid].astype(np.float64), minlength=nr * nc).reshape(nr, nc)
        n = np.bincount(idx, minlength=nr * nc).reshape(nr, nc)
        sums[pol][tr0:tr0 + nr, tc0:tc0 + nc] += s
        cnts[pol][tr0:tr0 + nr, tc0:tc0 + nc] += n

    full = (res / spacing) ** 2
    result = {}
    for p in POLS:
        with np.errstate(invalid="ignore", divide="ignore"):
            mean = (sums[p] / cnts[p]).astype(np.float32)
        mean[cnts[p] < 0.5 * full] = np.nan  # partial cells at swath edges
        result[p] = mean
    # Stored as dB in float16 (0.01 dB precision, far below radar noise) to keep the cache small.
    with np.errstate(invalid="ignore", divide="ignore"):
        hh_db = (10 * np.log10(result["HHHH"])).astype(np.float16)
        hv_db = (10 * np.log10(result["HVHV"])).astype(np.float16)
    np.savez_compressed(out, hh_db=hh_db, hv_db=hv_db,
                        looks=(cnts["HHHH"].astype(np.float32) / full).astype(np.float16),
                        masked=np.array(bool(mask_refs)))
    (out_dir / f"{g.date}.json").write_text(json.dumps({**asdict(g), "spacing_m": spacing, "epsg": epsg,
                                                       "mask_applied": bool(mask_refs), "masked_native_px": n_masked,
                                                       "seconds": round(time.time() - t0, 1)}, indent=1))
    log(f"  {g.date}: done in {time.time() - t0:.0f}s, valid {np.isfinite(result['HHHH']).mean() * 100:.0f}% of grid")
    return out
