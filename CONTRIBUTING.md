# Contributing to TerraPulse

Thanks for your interest. Bug reports, new study sites and improvements to the method are all welcome.

## Set up

```bash
python -m venv .venv
.venv/bin/pip install -e ".[dev]"     # Windows: .venv\Scripts\pip
cp .env.example .env                  # add your Earthdata token; never commit .env
```

The web app is static: `python -m http.server -d web 8000` and open http://localhost:8000.

## Before you open a pull request

```bash
ruff check .
pytest
python tools/build_notebook.py        # if you changed anything in terrapulse/
python -m terrapulse stac             # if you changed web/data
```

- Keep the pipeline dependency-light: NumPy, SciPy, Pillow, h5py. No GDAL is needed anywhere.
- Every number shown in the app's stories is computed from `web/data` when the page loads. Please do not type results into text by hand.
- Physical choices (thresholds, flags, rules) belong in `terrapulse/config.py` or as named constants, with a comment on why.
- Commit messages: imperative mood, one line under 72 characters, then a body explaining why if needed.

## Adding a study site

1. Add a `Site` in `terrapulse/config.py`: bounding box, NISAR track and frame (the app's *Find NISAR passes* tool lists them), a few named zones, one permanent water body (`water_ref`) and one area that never floods (`dry_ref`).
2. Run `search`, `ingest`, `rain` and `process` (see the README), or run the Colab notebook on a slow connection.
3. Check the calibration lines the pipeline prints (hit rate on water, false alarms on dry land) before publishing.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please do not open a public issue for a leaked token or a vulnerability.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
