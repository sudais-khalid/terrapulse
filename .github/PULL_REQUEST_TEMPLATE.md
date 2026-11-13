## What and why

<!-- One or two sentences: what changes, and the problem it solves. -->

## How it was checked

- [ ] `ruff check .` and `pytest` pass
- [ ] If `terrapulse/` changed: notebook rebuilt with `python tools/build_notebook.py`
- [ ] If web layers changed: `python -m terrapulse stac` rerun and the app checked in a browser
- [ ] If numbers in the story or docs changed: they come from the exported data, not typed by hand
