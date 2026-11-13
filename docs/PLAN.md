# TerraPulse: Project Plan (prep, written 13 Nov 2026)

Team: TERRAPULSE (Sudais Khalid, Sunnia Aslam). Challenge: Dancing with the SARs (NASA Space Apps 2026).
Tagline: Reading Earth's signals. Revealing its changes.

Status: research and planning only. Product code starts when the event opens (Sat 14 Nov, 09:00 local).

## 1. One-line pitch

An open-source web app that turns NISAR L-band radar into a living map of how Lower Sindh, Pakistan breathes through a full year: floods arriving and draining, wetlands swelling and shrinking, crops growing and being harvested. Anyone can also explore NISAR imagery anywhere on Earth.

## 2. Users

- Disaster and water managers (PDMA Sindh, irrigation department): where did water stand after the August 2026 rains, and for how long?
- Farmers' groups and agriculture officers: when did fields green up and get harvested, which areas stayed waterlogged?
- Educators, students and the public: what is radar, and why can it see through clouds and under crops?

## 3. Study area and data (verified)

- Area: Lower Sindh (Indus delta, Thatta, Badin wetlands, Keenjhar Lake, Hyderabad), NISAR track 164, frame 76, descending.
- Core series: 27 dates of NISAR L2 GCOV, PROVISIONAL collection, single processing version (CRID P05023), every 12 days from 21 Nov 2025 to 11 Oct 2026. Plus 23 Oct 2026 from the new VALIDATED collection, shown separately.
- Permanent NISAR data gap 27 Jul to 10 Aug 2026. Heavy rain hit Hyderabad and Badin in early August, so 19 Jul vs 12 Aug is the key before/after pair.
- Visual layer: NASA GIBS WMTS layer `NISAR_L2_Geocoded_Polarimetric_Covariance` (daily false-color mosaics, 15.6 m, CORS enabled, global).
- Rainfall driver: NASA GPM IMERG daily (preferred) with NASA POWER (MERRA-2) as a quick fallback.
- Context: Esri World Imagery or similar optical basemap, OpenStreetMap labels.

## 4. Product features

### MVP (must ship)
1. Explore mode: global map with NISAR GIBS false-color layer, date picker, play animation, before/after swipe between two dates, NISAR orbit tracks overlay, legend explaining colors.
2. Sindh study mode, from our own calibrated analysis:
   - Open water map per date (HH and HV backscatter thresholds).
   - Flooded vegetation per date (L-band double bounce: HH rise against dry-season baseline).
   - Water occurrence map (percent of dates under water: permanent vs seasonal).
   - Change map between any two dates (log ratio in dB).
   - Charts: water area over time per zone against rainfall.
3. Story mode: 5 to 7 chapters that fly the map and set layers and dates, with plain-language narrative.
4. Learn panel: what SAR is, L-band, HH vs HV, how to read the colors, limitations.
5. Public URL on GitHub Pages, no login.

### Stretch (in order of value to the demo)
1. Click any pixel to see its HH and HV time series.
2. "Surface rhythm" classes: unsupervised clustering of each pixel's yearly signal into permanent water, seasonal flood, crop cycle, mangrove or woody, urban, bare desert.
3. Adjustable water threshold slider computed live in the browser.
4. Zone statistics for named places (Keenjhar Lake, Haleji Lake, Nurri and Jubho lagoons, Indus channel, delta mangroves, Hyderabad).
5. Second site anywhere in the world through Explore mode presets.

## 5. Architecture

```
NISAR GCOV (ASF, Earthdata Cloud) --stream AOI subset--> pipeline (Python, run in Google Colab)
   -> common 100 m Web Mercator grid -> water / flooded vegetation / occurrence / change / stats
   -> small PNG layers + JSON manifest -> web/data/  (committed)
NASA GIBS WMTS (NISAR false color) ------------------> browser directly
NASA IMERG / POWER rainfall ---> pipeline ------------> web/data/rain.json
web/ (static: MapLibre GL JS + Chart.js) -------------> GitHub Pages
```

- Processing runs in Google Colab because the local link to the NASA archive is very slow (about 0.04 MB/s) and Windows policy blocks some Python libraries locally.
- Pipeline avoids pyproj and scikit-learn locally (pure NumPy UTM math, simple k-means) so it also runs on the team laptop for small tests.

## 6. Method (validity)

- GCOV gamma-naught power, converted to dB. Multi-looked to 100 m (reduces speckle).
- Only one processing version in the core series (P05023). Mode mix (20 MHz QPDH at 20 m, 40 MHz DHDH at 10 m) is resampled to one grid; we check for mode bias on stable targets (city, desert) and report it.
- Open water: Otsu threshold on HH and HV histograms, bounded to physically sensible ranges.
- Flooded vegetation: HH increase of at least 3 dB against the dry-season median plus high HH.
- Change: log ratio in dB, plus Cookbook temporal metrics (coefficient of variation, 95th minus 5th percentile).
- Sanity checks: Keenjhar Lake should read as permanent water; Hyderabad as stable bright urban; the early August rain should show new water on 12 Aug.
- Known limits stated in the app: RFI blobs, edge masks, wind-roughened water, the July/August gap, PROVISIONAL maturity.

## 7. Schedule (local time)

| When | Sudais | Sunnia |
|---|---|---|
| Sat 09:00 to 13:00 | Repo, pipeline core, Colab notebook, first date processed | Project page draft, story chapter research, local context |
| Sat 13:00 to 20:00 | Full series in Colab, products, export | Web app content: learn panel, legends, story text |
| Sat 20:00 to 24:00 | Web app: map, GIBS layer, swipe, study layers | Testing, screenshots, slide outline |
| Sun 09:00 to 15:00 | Charts, story mode, polish, deploy to Pages | 30 s video script and recording, slides |
| Sun 15:00 | Feature freeze | |
| Sun 15:00 to 21:00 | Bug fixes, README, license | Video edit with English subtitles, project page fields |
| Sun before 23:59 | Submit | Submit check |

## 8. Submission checklist

- Project name, summary, demo link (30 s video or 7 slides max, English), final project link (public, no login).
- NASA data used: NISAR GCOV (ASF DAAC), GIBS NISAR layer, GPM IMERG or POWER.
- Partner and other data: basemaps, OpenStreetMap. List every source.
- Use of AI: state tools and where used. Watermark any AI-generated images or video. No NASA logos or branding.
- Open-source license (Apache 2.0).

## 9. Open questions

- Which local event are we registered under (sets the 23:59 deadline time zone)?
- Confirm Google Colab for processing.
