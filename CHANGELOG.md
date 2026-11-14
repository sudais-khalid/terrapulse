# Changelog

All notable changes to TerraPulse. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Guided spotlight tour: 17 short steps that highlight each real control (modes, site, story buttons, map, pulse strip, play, listen, legend, layers, compare, measure, help) with Back, Next and Skip, keyboard support and automatic layout for phones; a branded start-up splash.
- Premium interface: NISAR satellite mark in the header, a quick tour for first-time visitors (reopen with the help button), a radar swath sweep when a story chapter opens, a radar-scope loader instead of plain loading text, line icons throughout, a chapter counter, keyboard shortcuts (arrow keys for chapters, Escape closes panels) and a NISAR fact card in *How it works*.
- Layouts for every screen: two-row header and a collapsible bottom sheet on phones, sticky Back and Next buttons, readable chart legend (inline on wide screens, a button elsewhere), month labels that never collide, safe-area support.

### Fixed

- The app no longer waits for basemap tiles before starting, so story text and layers appear even when the imagery server is slow.
- File sizes stated as 6 to 9 GB (checked against the ASF archive) instead of 6 GB; the unsupported "35 s per file" figure is replaced by the measured 1 to 2 MB of map layers per pass.
- Reference zones are labelled Jhimpir desert and Reserva Ducke forest instead of internal "check area" notes; *How it works* explains why the archive's 33 Indus products give 28 passes.

### Changed

- Tests checked with Counterproof mutation testing: all 8 planted faults in the STAC code are now caught (was 1 of 4). Test suite grows from 46 to 57 tests: no silent skips (missing data now fails), full per-pass metadata checks, and a golden-file comparison of the rebuilt catalog.
- STAC: fully transparent classes (land) no longer carry a misleading black colour hint; the collection's class template now matches the items.
- GitHub Actions updated to their Node 24 releases (checkout 7, setup-python 7, setup-node 7, configure-pages 6, upload-pages-artifact 5, deploy-pages 5); Dependabot now groups updates into one pull request per ecosystem.

## [1.0.0] - 2026-11-13

First public release, for the 2026 NASA Space Apps Challenge (*Dancing with the SARs*).

### Added

- **STAC catalog** of every published layer (`web/data/catalog.json`, STAC 1.1.0 with the SAR, satellite, projection, raster and classification extensions). Each NISAR pass is a STAC Item that links back to its source granule at ASF and records how to decode the 8-bit PNGs into dB and fractions. New `python -m terrapulse stac` stage.
- Test suite (46 tests): coordinate transforms, granule selection, the streaming HDF5 decoder checked against h5py, thresholding and clustering, rain flags, web data contracts, notebook sync, and STAC schema validation.
- Continuous integration on Python 3.10 to 3.13 (ruff, pytest) plus JavaScript and JSON checks; Dependabot for actions and pip.
- `pyproject.toml` packaging with a `terrapulse` command, `CITATION.cff`, contributor guide, security policy, code of conduct, issue and pull request templates, architecture notes.

### Changed

- The rain-affected rule is a standalone, tested function (`terrapulse.export.flag_rain_affected`).
- Lint fixes across the package (no behaviour change).

## [0.4.0] - 2026-11-13

### Added

- Amazon at Manaus results: 10 passes, water calibrated on the Rio Negro against Reserva Ducke forest.
- GPM IMERG rainfall results for both sites and an automatic **rain-affected** pass flag (at least 15 mm in the three days before a pass).
- Site-aware stories and *How it works* text; Manaus cloud chapter with MODIS on 2 November 2026.

## [0.3.0] - 2026-11-13

### Added

- GPM IMERG rainfall stage and the second study site, Amazon at Manaus.
- Multi-site app with a site switcher, side-by-side optical comparison (MODIS, HLS), area measurement, CSV download, notable change detection, *Listen* sonification, shareable links.
- Submission kit: slides, demo video script and subtitles.

## [0.2.0] - 2026-11-13

### Added

- Water thresholds calibrated per radar mode on Keenjhar Lake against the Jhimpir desert; wind-roughened pass flag.
- NISAR GCOV validity mask applied before averaging.

## [0.1.0] - 2026-11-13

### Added

- NISAR GCOV pipeline: ASF search, single-CRID product selection, streaming AOI ingest with parallel HTTP range requests, products, web export.
- Self-contained Colab notebook and the first version of the web app.

[Unreleased]: https://github.com/sudais-khalid/terrapulse/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sudais-khalid/terrapulse/releases/tag/v0.1.0
