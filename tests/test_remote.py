"""The streaming HDF5 decoder must give exactly what h5py gives, chunk by chunk."""
import numpy as np
import pytest

from terrapulse.remote import ChunkRef, _coalesce, chunk_index, decode_chunk, filter_pipeline

h5py = pytest.importorskip("h5py")


@pytest.fixture
def gcov_like(tmp_path):
    """A small float32 raster stored like NISAR GCOV: chunked, shuffled and deflated."""
    rng = np.random.default_rng(3)
    data = (10 ** (rng.normal(-12, 4, (300, 260)) / 10)).astype(np.float32)
    path = tmp_path / "gcov.h5"
    with h5py.File(path, "w") as f:
        f.create_dataset("science/HHHH", data=data, chunks=(64, 64), shuffle=True, compression="gzip",
                         compression_opts=4, fletcher32=True)
    return path, data


def test_decoder_matches_h5py(gcov_like):
    path, data = gcov_like
    with h5py.File(path, "r") as f:
        dset = f["science/HHHH"]
        filters = filter_pipeline(dset)
        refs = chunk_index(dset, rows=(70, 200), cols=(10, 130))
        assert {(r.row, r.col) for r in refs} == {(r, c) for r in (64, 128, 192) for c in (0, 64, 128)}
        raw = path.read_bytes()
        for ref in refs:
            chunk = decode_chunk(raw[ref.offset: ref.offset + ref.size], ref, filters, dset.chunks, dset.dtype)
            want = data[ref.row: ref.row + 64, ref.col: ref.col + 64]
            np.testing.assert_array_equal(chunk[: want.shape[0], : want.shape[1]], want)


def test_coalesce_merges_nearby_ranges_only():
    refs = [ChunkRef("d", 0, 0, off, 100, 0) for off in (0, 150, 10_000, 10_120)]
    groups = _coalesce(refs, max_gap=64, max_size=1 << 20)
    assert [(s, e, len(m)) for s, e, m in groups] == [(0, 250, 2), (10_000, 10_220, 2)]


def test_coalesce_respects_max_request_size():
    refs = [ChunkRef("d", 0, 0, i * 100, 100, 0) for i in range(10)]
    groups = _coalesce(refs, max_gap=0, max_size=300)
    assert [len(m) for _, _, m in groups] == [3, 3, 3, 1]
