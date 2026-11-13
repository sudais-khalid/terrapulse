"""Fast, parallel reading of NISAR HDF5 chunks over HTTPS.

h5py reads chunks one by one, which is very slow over a high-latency link.
Here we read the chunk index once (through h5py on a cached remote file), then
download only the compressed chunks we need with merged, parallel HTTP range
requests, and decode them ourselves (deflate + shuffle, as used by NISAR GCOV).
"""
from __future__ import annotations

import os
import time
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

import numpy as np
import requests

H5Z_DEFLATE, H5Z_SHUFFLE, H5Z_FLETCHER32 = 1, 2, 3


# --------------------------------------------------------------------------- auth
def get_token(env_file: str | os.PathLike | None = None) -> str:
    """Earthdata Login bearer token from EARTHDATA_TOKEN, a .env file, or a prompt."""
    tok = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if tok:
        return tok
    candidates = [Path(env_file)] if env_file else [Path.cwd() / ".env", Path(__file__).resolve().parents[1] / ".env"]
    for p in candidates:
        if p.is_file():
            for line in p.read_text(encoding="utf8").splitlines():
                if line.strip().startswith("EARTHDATA_TOKEN="):
                    tok = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if tok:
                        return tok
    from getpass import getpass

    return getpass("Earthdata Login token (input hidden): ").strip()


class SignedUrl:
    """Resolves the ASF URL to a short-lived CloudFront URL and refreshes it."""

    def __init__(self, url: str, token: str, max_age_s: float = 1500):
        self.url, self.token, self.max_age_s = url, token, max_age_s
        self._signed, self._t, self._lock = None, 0.0, Lock()

    def get(self, force: bool = False) -> str:
        with self._lock:
            if force or self._signed is None or time.time() - self._t > self.max_age_s:
                r = requests.get(self.url, headers={"Authorization": f"Bearer {self.token}", "Range": "bytes=0-0"},
                                 allow_redirects=False, timeout=60)
                if r.status_code in (301, 302, 303, 307, 308):
                    self._signed = r.headers["Location"]
                elif r.status_code in (200, 206):
                    self._signed = self.url  # served directly
                else:
                    raise RuntimeError(f"Earthdata auth failed ({r.status_code}). Check EARTHDATA_TOKEN.")
                self._t = time.time()
            return self._signed


def open_h5(url: str, token: str, block_size: int = 1 << 20):
    """Open a remote HDF5 file for metadata and chunk index access."""
    import aiohttp
    import fsspec
    import h5py

    fs = fsspec.filesystem("http", headers={"Authorization": f"Bearer {token}"},
                           client_kwargs={"timeout": aiohttp.ClientTimeout(total=900)})
    f = fs.open(url, "rb", block_size=block_size, cache_type="blockcache")
    return h5py.File(f, "r", rdcc_nbytes=64 << 20), f


# --------------------------------------------------------------------------- chunks
@dataclass
class ChunkRef:
    dataset: str
    row: int  # chunk start row (pixels)
    col: int  # chunk start col (pixels)
    offset: int
    size: int
    filter_mask: int


def filter_pipeline(dset) -> list[int]:
    plist = dset.id.get_create_plist()
    return [plist.get_filter(i)[0] for i in range(plist.get_nfilters())]


def chunk_index(dset, rows: tuple[int, int], cols: tuple[int, int]) -> list[ChunkRef]:
    """Chunks of `dset` intersecting the pixel window rows=[r0,r1), cols=[c0,c1)."""
    ch, cw = dset.chunks
    r0, r1 = rows
    c0, c1 = cols
    want = {(r, c) for r in range((r0 // ch) * ch, r1, ch) for c in range((c0 // cw) * cw, c1, cw)}
    refs: list[ChunkRef] = []
    name = dset.name
    if hasattr(dset.id, "chunk_iter"):
        def cb(info):
            key = (info.chunk_offset[0], info.chunk_offset[1])
            if key in want:
                refs.append(ChunkRef(name, key[0], key[1], info.byte_offset, info.size, info.filter_mask))
        dset.id.chunk_iter(cb)
    else:
        for (r, c) in want:
            info = dset.id.get_chunk_info_by_coord((r, c))
            if info.byte_offset is not None:
                refs.append(ChunkRef(name, r, c, info.byte_offset, info.size, info.filter_mask))
    return refs


def decode_chunk(raw: bytes, ref: ChunkRef, filters: list[int], chunk_shape, dtype) -> np.ndarray:
    data = raw
    # Filters are applied in order on write; undo them in reverse on read.
    for i in reversed(range(len(filters))):
        if ref.filter_mask & (1 << i):
            continue  # filter skipped for this chunk
        code = filters[i]
        if code == H5Z_DEFLATE:
            data = zlib.decompress(data)
        elif code == H5Z_SHUFFLE:
            itemsize = np.dtype(dtype).itemsize
            n = len(data) // itemsize
            b = np.frombuffer(data, dtype=np.uint8, count=n * itemsize)
            data = b.reshape(itemsize, n).T.tobytes() + data[n * itemsize:]
        elif code == H5Z_FLETCHER32:
            data = data[:-4]
        else:
            raise NotImplementedError(f"HDF5 filter {code} not supported")
    return np.frombuffer(data, dtype=dtype, count=int(np.prod(chunk_shape))).reshape(chunk_shape)


def _coalesce(refs: list[ChunkRef], max_gap: int, max_size: int) -> list[tuple[int, int, list[ChunkRef]]]:
    refs = sorted(refs, key=lambda r: r.offset)
    groups: list[tuple[int, int, list[ChunkRef]]] = []
    for r in refs:
        if groups:
            start, end, members = groups[-1]
            if r.offset - end <= max_gap and (r.offset + r.size - start) <= max_size:
                groups[-1] = (start, max(end, r.offset + r.size), members + [r])
                continue
        groups.append((r.offset, r.offset + r.size, [r]))
    return groups


def fetch_chunks(signed: SignedUrl, refs: list[ChunkRef], decode, workers: int = 8,
                 max_gap: int = 256 << 10, max_size: int = 8 << 20, retries: int = 5, log=print):
    """Download chunks with merged range requests; yields (ref, decoded_array)."""
    groups = _coalesce(refs, max_gap, max_size)
    total = sum(e - s for s, e, _ in groups)
    done_bytes, t0 = 0, time.time()
    session_local = {}

    def get_session():
        import threading
        tid = threading.get_ident()
        if tid not in session_local:
            session_local[tid] = requests.Session()
        return session_local[tid]

    def work(group):
        start, end, members = group
        for attempt in range(retries):
            try:
                r = get_session().get(signed.get(force=attempt > 1), headers={"Range": f"bytes={start}-{end - 1}"}, timeout=180)
                if r.status_code == 403:
                    signed.get(force=True)
                    raise RuntimeError("signed URL expired")
                r.raise_for_status()
                buf = r.content
                if len(buf) != end - start:
                    raise RuntimeError(f"short read {len(buf)} != {end - start}")
                return end - start, [(m, decode(buf[m.offset - start: m.offset - start + m.size], m)) for m in members]
            except Exception as e:  # network hiccup: back off and retry
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)
        raise RuntimeError("unreachable")

    with ThreadPoolExecutor(workers) as ex:
        futures = [ex.submit(work, g) for g in groups]
        last = 0.0
        for fut in as_completed(futures):
            nbytes, items = fut.result()
            done_bytes += nbytes
            for item in items:
                yield item
            now = time.time()
            if now - last > 10 or done_bytes == total:
                rate = done_bytes / max(now - t0, 1e-6) / 1e6
                log(f"    {done_bytes / 1e6:7.1f} / {total / 1e6:.1f} MB  ({rate:.2f} MB/s)")
                last = now
