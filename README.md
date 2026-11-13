# TerraPulse

**Reading Earth's signals. Revealing its changes.**

TerraPulse turns a year of NISAR L-band radar into a living map of how the lower Indus in Sindh, Pakistan, changes through the seasons: floods arriving and draining, wetlands swelling and shrinking, crops growing and being harvested. It also lets anyone browse NISAR radar imagery anywhere on Earth.

Built by team **TERRAPULSE** (Sudais Khalid, Sunnia Aslam) for the 2026 NASA Space Apps Challenge, challenge *Dancing with the SARs*.

## What you can do

- **Story**: seven short chapters that walk through the year, with numbers computed from the data.
- **Explore**: switch layers, scrub through 28 satellite passes, compare two dates with a swipe divider, and click any spot to see its radar history.
- **Pulse strip**: open water and flooded vegetation for each pass against daily rainfall, for the whole area or for one place (Keenjhar Lake, Badin lagoons, Indus floodplain, farms, Hyderabad).
- **NISAR worldwide**: NASA GIBS daily NISAR mosaics for any place and day since October 2025.

## Layers

| Layer | What it shows | How it is made |
|---|---|---|
| Radar colour | HH (red, blue) and HV (green) backscatter per pass | NISAR GCOV gamma-naught, 100 m |
| Water and flooded vegetation | Open water, and water under crops or reeds | HH and HV below Otsu thresholds; L-band double bounce rule |
| What changed | New water, receding water, brighter HH, vegetation gain or loss | Log ratio between any two passes, computed in the browser |
| How often under water | Share of passes with open water | Per-pixel frequency |
| Surface rhythm | Places grouped by how their signal moved through the year | k-means on yearly statistics, named by physical rules |
| Vegetation swing | Range of HV over the year | 95th minus 5th percentile |

## Data

- **NISAR L2 GCOV** (NASA/JPL-Caltech and ISRO), from the ASF DAAC. Track 164, frame 76, descending. 27 passes from one processing version (PROVISIONAL, CRID P05023), 21 Nov 2025 to 11 Oct 2026, plus the VALIDATED pass of 23 Oct 2026.
- **NASA GIBS** layer `NISAR_L2_Geocoded_Polarimetric_Covariance` for the worldwide view.
- **NASA POWER** daily precipitation for rainfall context.
- **Esri World Imagery** and reference labels as the basemap.

## Method in brief

1. Search ASF for GCOV over the site and keep one product per date from a single CRID, so changes are not artefacts of software updates.
2. Stream only the study area out of each 6 GB HDF5 file: read the chunk index once, fetch the compressed chunks with parallel HTTP range requests, decode deflate and shuffle, and check the decoder against h5py.
3. Average 10 m and 20 m pixels onto one 100 m UTM grid (also reduces speckle); check for brightness bias between radar modes on stable targets.
4. Classify open water (Otsu on HH and HV), likely flooded vegetation (HH at least 3 dB above the pixel's own median and rising more than HV), and compute frequency, change and clustering products.
5. Reproject to Web Mercator and write small 8-bit PNG layers and a manifest that the web app decodes and colours in the browser.

Limits are listed in the app under *How it works*: wind-roughened water, wet soil versus flooded vegetation, radio interference, the 27 July to 10 August 2026 NISAR data gap, coarse rainfall, PROVISIONAL maturity.

## Run it

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip
echo "EARTHDATA_TOKEN=<your token>" > .env         # from https://urs.earthdata.nasa.gov/profile
python -m terrapulse search
python -m terrapulse ingest --workers 8          # resumable; slow links: use Colab instead
python -m terrapulse process                     # writes web/data/lower-indus
python -m http.server -d web 8000                # open http://localhost:8000
```

On a slow connection, run `notebooks/terrapulse_pipeline.ipynb` in Google Colab and download the two zips it produces.

## Repository

```
terrapulse/   Python pipeline (search, ingest, products, export, rain)
notebooks/    Colab notebook that runs the whole pipeline
web/          Static web app (MapLibre GL JS), deployable to GitHub Pages
docs/         Plan and data notes
```

## Use of AI

Code, documentation and copy in this project were drafted with the help of an AI coding assistant (Claude, by Anthropic) under the team's direction, then reviewed, tested and edited by the team. The scientific approach, study area, data choices and story are the team's own. No AI-generated images, video or audio are used.

## License

Apache License 2.0. See [LICENSE](LICENSE).
