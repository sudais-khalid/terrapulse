# Data Notes (prep, verified 13 Nov 2026)

## NISAR GCOV (core data)

- Search: `asf_search.search(dataset="NISAR", processingLevel="GCOV", relativeOrbit=164, frame=76, intersectsWith=<AOI WKT>)`. Catalog search needs no login.
- Collections: `NISAR_L2_GCOV_BETA_V1` (drop), `NISAR_L2_GCOV_PROVISIONAL_V1` (use, CRID P05023), `NISAR_L2_GCOV_V1` (VALIDATED, from 21 Oct 2026, CRID P05036).
- When two granules share a date (product counter `_001` and `_002`), keep the highest counter.
- File: about 6.6 GB HDF5. Group `/science/LSAR/GCOV/grids/frequencyA` holds `HHHH`, `HVHV` (linear gamma-naught power, float32), `xCoordinates`, `yCoordinates`, `projection` (attr `epsg_code`, UTM 42N expected), `mask`, `numberOfLooks`.
- Pixel spacing: 10 m for 40 MHz (mode 4005, DHDH), 20 m for 20 MHz (mode 2005, QPDH).
- Access: HTTPS with header `Authorization: Bearer <EDL token>`; server answers 303 to a CloudFront signed URL. Stream only the AOI window with fsspec plus h5py. S3 direct access only works inside AWS us-west-2.
- Alternative: Harmony service can extract variables, subset and reproject server side to COG.
- Token: project `.env` as `EARTHDATA_TOKEN` (git-ignored). Tokens expire after about 60 days.

## Study frame dates (PROVISIONAL, P05023)

2025: 11-21, 12-03, 12-15, 12-27
2026: 01-08, 01-20, 02-01, 02-13, 02-25, 03-09, 03-21, 04-02, 04-14, 04-26, 05-08, 05-20, 06-01, 06-13, 06-25, 07-07, 07-19, 08-12, 08-24, 09-05, 09-17, 09-29, 10-11
VALIDATED: 2026-10-23.
Footprint approx: (67.45 26.19), (66.84 24.06), (69.28 23.46), (69.93 25.58).

## NASA GIBS NISAR layer (visual)

- WMTS REST: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NISAR_L2_Geocoded_Polarimetric_Covariance/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`
- Max zoom 13 (15.625 m). Dates: 2025-10-29 to present, daily. CORS `*`.
- Colors (dual-pol): HH in red and blue, HV in green. Vegetation green, urban or sparse vegetation orange/yellow, calm water and dry sand blue, rough water red.
- Orbit tracks: `OrbitTracks_NISAR_Ascending` and `OrbitTracks_NISAR_Descending` (Mapbox vector tiles, Level6).
- Tiles outside a swath are transparent; swath edges can look grey.

## Rainfall

- NASA POWER daily point API, no login: `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude=..&latitude=..&start=YYYYMMDD&end=YYYYMMDD&format=JSON`. Source MERRA-2 and GEOS-IT. Under-reads convective extremes here (shows about 70 mm in Aug 2026 at Hyderabad while news reports 360 mm in one event) and an odd 392 mm in Mar 2026.
- Preferred: GPM IMERG daily (GES DISC, Earthdata Login) for area averages over each zone.

## Local events to anchor the story (verify sources before publishing)

- March 2026: pre-monsoon storms in Sindh, Karachi deaths 18 to 19 Mar, PDMA advisories 24 to 30 Mar. NISAR passes 9 Mar, 21 Mar, 2 Apr.
- Early August 2026: heavy rain in Hyderabad (about 360 mm reported), Badin (212 mm), Thatta; Mirwah channel breaches in Badin (PDMA sitrep 2 Aug). NISAR gap 27 Jul to 10 Aug; passes 19 Jul and 12 Aug.

## Known product issues to state

- RFI can create bright blobs; edge mask misalignment; banding mostly fixed after BETA.
- Mixing maturities can create false change; we keep the core series on one CRID.

## Resources reviewed (challenge Resources tab)

- Earthdata Search, ASF Vertex, NISAR Data User Guide (nisar-docs.asf.alaska.edu), Earthdata intro to remote sensing and SAR, ARSET trainings, NISAR StoryMaps, NISAR Applications white papers (Floods, Flood Forecasting, Food Security, Coastal, Soil Moisture are most relevant), UAVSAR postcards.
- Partner: CSA RCM and RADARSAT-1 open data (mostly Canada), CSA SAR Python tutorial (GDAL and cartopy), CONAE SAOCOM L-band catalogue (needs registration). Not required for the MVP; SAOCOM is an optional L-band comparison.

## Local machine limits

- Download speed from the NASA archive about 0.04 MB/s with resets: run processing in Google Colab.
- Windows Application Control blocks pyproj and scikit-learn DLLs. numpy, h5py, scipy, Pillow, aiohttp load fine.
- spaceappschallenge.org and the CSA portal fail TLS checks locally; GIBS, ASF, GitHub, NASA POWER work.
