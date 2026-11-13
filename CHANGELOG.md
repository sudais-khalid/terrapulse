# Changelog

All notable changes to TerraPulse. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
- GPM IMERG daily rainfall for both sites and an automatic **rain-affected** pass flag (at least 15 mm in the three days before a pass).
- Site-aware stories and *How it works* text; Manaus cloud chapter with MODIS on 2 November 2026.

## [0.3.0] - 2026-11-13

### Added

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

[1.0.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sudais-khalid/terrapulse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sudais-khalid/terrapulse/releases/tag/v0.1.0
