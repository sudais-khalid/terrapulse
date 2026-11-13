# TerraPulse: Space Apps 2026 project page (draft to paste)

Challenge: **Dancing with the SARs** · Team: **TERRAPULSE** (Sudais Khalid, Sunnia Aslam) · Local event: Topi, Pakistan

Add the demo video link below once it is uploaded. Check every field against the official 2026 Project Submission Guide.

---

## Project name

TerraPulse: Reading Earth's signals. Revealing its changes.

## High-level project summary

TerraPulse is an open-source web app that turns NASA-ISRO NISAR L-band radar into a living map of how land and water change. For the lower Indus in Sindh, Pakistan, it streams a full year of NISAR GCOV data (28 passes) and maps open water, water hidden under crops and reeds, and the yearly rhythm of every 100 m of land. Water mapping is calibrated against a permanent lake and dry desert, corrected for radar mode, and checked against an independent lake. The app shows that NISAR saw the rice season unfold through monsoon clouds that blinded optical satellites: fields flooded in July, rice standing in water peaked at about 1,200 km² in September, then the harvest. A second site at Manaus shows the Amazon flood pulse, and any place on Earth can be explored through NASA's NISAR mosaics. Anyone can compare dates, measure an area, download data, or listen to the year as sound.

## Link to project demo

`<link to the 30-second video>` (slides: https://sudais-khalid.github.io/terrapulse/slides.html)

## Link to final project

https://sudais-khalid.github.io/terrapulse/ (live app) and https://github.com/sudais-khalid/terrapulse (code, notebook, data pipeline)

## Detailed project description

**What it does**

TerraPulse answers three questions for any NISAR study area: where is water now, where is water hidden under vegetation, and how does each place change through the year.

- **Story mode** walks through the year in short chapters. Every number in the text is computed from the data when the page loads.
- **Explore mode** offers seven layers: radar colour, water and flooded vegetation, change between any two passes, how often each place was under water, a "surface rhythm" classification, vegetation swing, and NISAR worldwide.
- **Compare** two passes with a swipe divider, or compare radar with the optical image (MODIS or Harmonized Landsat Sentinel-2) of the same day, which shows why radar matters during the monsoon.
- **Pulse strip**: open water and flooded vegetation for every pass against daily GPM IMERG rainfall, for the whole area or one place. Press play to animate, or *Listen* to hear the year: pitch follows open water, a second voice follows flooded vegetation, and a soft hiss marks rain.
- **Tools**: click any pixel for its radar history, drag a box to measure any area across all passes, download CSV, and see automatically detected notable changes (compared only between passes in the same radar mode).
- **Anywhere on Earth**: fly anywhere, find the dates NISAR imaged that spot through the ASF Search API, and view NASA GIBS NISAR mosaics.
- **Shareable links** reproduce any view.

**How it works**

1. A Python pipeline (`terrapulse/`) searches the ASF DAAC archive and keeps one GCOV product per date from a single processing version (PROVISIONAL, CRID P05023), plus the newest VALIDATED passes, so changes are not software artefacts.
2. Each GCOV file is about 6 GB. Instead of downloading it, TerraPulse reads the HDF5 chunk index and fetches only the compressed chunks covering the study area with parallel HTTP range requests, decodes them, and checks the decoder against h5py. One pass takes about 35 seconds in Google Colab.
3. Samples flagged invalid by the NISAR mask (swath gaps) are dropped, and 10 m and 20 m pixels are averaged onto a 100 m grid.
4. Open water: HH and HV thresholds are chosen separately for each radar mode to best separate a permanent reference lake (Keenjhar Lake) from dry reference land (rocky desert near Jhimpir). The 40 MHz mode reads dark surfaces about 1 dB brighter, which this corrects. A pixel that turns at least 3 dB darker than its own median in both channels also counts as newly flooded.
5. Flooded vegetation: L-band passes through crop and reed canopies and double-bounces off stems standing in water, so HH jumps at least 3 dB above that pixel's normal level and rises more than HV.
6. Quality control: when the reference lake stops looking like water (wind roughening), the pass is flagged rather than reported as drying. Haleji Lake, not used for calibration, is an independent check.
7. Surface rhythm: unsupervised k-means clustering of each pixel's yearly statistics, named by physical rules (permanent water, seasonal water, flood-prone vegetation, cropland, woody vegetation, built-up, bare soil, sparse vegetation).
8. Rainfall: daily NASA GPM IMERG averaged over each zone.
9. Results are exported as small 8-bit Web Mercator PNG layers and a manifest. The static web app (MapLibre GL JS, plain JavaScript) decodes and colours them in the browser, so thresholds and change maps are computed live.

**Key results (lower Indus, 21 Nov 2025 to 23 Oct 2026)**

- Keenjhar Lake reads 88 to 104 km² of open water on 24 of 28 passes (median 92 km²). Haleji Lake, the independent check, reads 14.5 to 18.4 km².
- The rice season on the left bank of the Indus: open water rose by 87 km² between 13 June and 7 July as fields were flooded for transplanting; flooded vegetation rose by 217 km² between 24 August and 17 September and peaked at 1,218 km² across the area on 17 September, then fell with the harvest.
- Across the early August 2026 monsoon rain, the Badin coastal lagoons gained about 62 km² of open water (19 July to 12 August).
- On 7 July 2026 MODIS saw mostly cloud over the delta while NISAR mapped the flooded fields beneath.
- 14 April 2026 is flagged as wind-roughened: only 13% of Keenjhar Lake looked like water.
- Amazon at Manaus (10 passes, 23 Jun to 2 Nov 2026): open water fell 20%, from 1,002 km² on 5 July to 800 km² on 2 November, as the river dropped toward low water. The Careiro várzea floodplain lost 42% of its open water, and flooded forest fell from about 50 km² to almost none. GPM IMERG recorded 175 mm of local rain over the same period, showing that the flood pulse is driven by the whole upstream basin. Water thresholds were calibrated on the Rio Negro against Reserva Ducke rainforest, which reads 0 km² of water on every pass.
- On 27 September 2026 at Manaus, 24 mm of rain in three days wet the canopy and briefly mimicked flooded forest. TerraPulse flags such passes automatically from IMERG and leaves them out of peaks and alerts.

**Benefits and intended impact**

- Disaster managers (for example PDMA Sindh) can see where water stood after a storm, even under cloud, and measure any area.
- Irrigation and agriculture departments can follow when rice fields were flooded, grew and were harvested.
- Wetland managers can track Ramsar lakes and lagoons pass by pass.
- Teachers and the public get radar explained in plain words, pictures and sound.
- The method scales: a new site is a short configuration entry and one Colab run, and the worldwide view works for any place NISAR images.

**Limits we state openly**

Wind-roughened water is undercounted (flagged); smooth dry desert can pass the water test (12 to 17% of desert pixels in our check area); a sharp HH rise can mean wet soil rather than standing water; radio interference can create bright spots; NISAR had a permanent data gap from 27 July to 10 August 2026; PROVISIONAL products are calibrated but still under validation.

**Tools, languages, hardware and software**

Python (NumPy, h5py, fsspec, aiohttp, SciPy, Pillow, asf_search), Google Colab for processing, JavaScript with MapLibre GL JS for the web app, Web Audio API for sound, GitHub Pages and GitHub Actions for hosting. Projection math (UTM, Web Mercator) and k-means are implemented in NumPy so the pipeline runs on restricted machines. No special hardware.

## NASA data

- **NISAR L2 GCOV** (Geocoded Polarimetric Covariance), NASA/JPL-Caltech and ISRO, from the ASF DAAC: 28 passes over the lower Indus (track 164, frame 76) and 10 passes over Manaus (track 140, frame 90). Core of every map and number.
- **NASA GIBS** layer `NISAR_L2_Geocoded_Polarimetric_Covariance`: NISAR worldwide view.
- **GPM IMERG** Late Run daily V07 (GES DISC): rainfall per zone in the pulse strip.
- **MODIS Terra Corrected Reflectance** and **Harmonized Landsat Sentinel-2 (HLS)** via NASA GIBS: optical comparison of the same day.
- **ASF Search API** and the **NISAR Data User Guide** (ASF): finding passes and product details.
- **NASA POWER** daily precipitation: fallback rainfall where IMERG is not available.

## Space agency partner and other data

- **ISRO** is NISAR's partner agency; its contribution is part of every NISAR product used.
- Esri World Imagery and World Boundaries and Places reference labels as the basemap.
- Sindh PDMA situation reports (July and August 2026) and news reports, cited in the app as context for the monsoon rain.
- Fonts: Big Shoulders Display, Atkinson Hyperlegible, Martian Mono (Google Fonts, Open Font License).
- Libraries: MapLibre GL JS (BSD-3), NumPy, SciPy, h5py, fsspec, aiohttp, Pillow, asf_search.

## Use of Artificial Intelligence

We used an AI coding assistant (Claude, by Anthropic) to help draft code, documentation and app text, under our direction. We chose the challenge, study areas, data and scientific approach, reviewed and tested the outputs, and checked every result against the data (for example, we replaced an automatic threshold after it counted desert as water). The AI-assisted code is in the repository and acknowledged in the README. No AI-generated images, video or audio are used; all images are screenshots of the app showing real NASA data.

## References

- NISAR Data User Guide, Alaska Satellite Facility: https://nisar-docs.asf.alaska.edu/ (Kristenson et al., 2026, doi:10.5281/ZENODO.20075813)
- NISAR applications white papers (Floods, Food Security): https://nisar.jpl.nasa.gov/applications/societal-benefit/
- Earthdata, What is Synthetic Aperture Radar: https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar
- ASF OpenSARLab NISAR Cookbook: https://asfopensarlab.github.io/NISAR_Cookbook/
- GPM IMERG: https://gpm.nasa.gov/data/imerg
- NASA GIBS: https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api
- Sindh PDMA situation reports, monsoon 2026: https://pdma.gos.pk/
