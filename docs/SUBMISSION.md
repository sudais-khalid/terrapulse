# TerraPulse: Space Apps 2026 project submission (paste-ready)

Challenge: **Dancing with the SARs** · Team: **TERRAPULSE** (Sudais Khalid, Sunnia Aslam) · Local event: Topi, Pakistan

Every field below matches the 2026 Project Page form, in order, and is filled in. Copy each section into the field with the same name.

## Before and during submission (checklist from the official 2026 guides)

**Eligibility**

- [ ] Both members are registered for the 2026 challenge, confirmed (not waitlisted) at the **same Local Event** (Topi), and appear on the **Members** tab of the team page. No members can be added after submission closes.
- [ ] Each member's **Full Name** in their Space Apps profile is correct (it is printed on the participant certificate).

**Timing (Local Event time, PKT)**

- [ ] The **Project** tab appears on Saturday 14 November at 9:00 a.m. Submission closes on **Sunday 15 November at 11:59 p.m.** Anything saved or submitted after that is not judged.
- [ ] Click **Edit**, turn the edit **Lock** on while one person edits, and click **Save Progress** often.
- [ ] You can edit and resubmit as many times as you like until the deadline. Only the last saved submission is judged, so submit early and improve afterwards if needed.

**Content rules**

- [ ] Everything on the page and in linked materials is in English. A video may be in another language only with English subtitles.
- [ ] Demo: a slide deck of at most **7 slides** (including title and intro), or a video of at most **30 seconds**. Over the limit means not eligible for Global Judging. Our deck has exactly 7 slides.
- [ ] No images, video or audio of anyone under 18. None are used.
- [ ] No NASA logos, flags or mission identifiers in generated content. None are used.
- [ ] All links open without a login. Test each one in a private browser window before submitting.
- [ ] Images: the page accepts JPG, PNG or GIF uploads up to 10 MB, but not videos or documents. Suggested uploads for the Detailed Project Description, all under 0.4 MB, from `web/assets/shots/`:
  - `clouds.jpg`: NISAR water map next to the cloud-covered MODIS image, 7 July 2026
  - `rice.jpg`: rice standing in water on the lower Indus, September 2026
  - `manaus.jpg`: open water at Manaus, 5 July and 2 November 2026
  - `area.jpg`: measuring an area across all passes

**Submitting**

- [ ] Tick: *"I have read and understand the project submission requirements as contained in the NASA Space Apps Project Submission Guide, and I agree to the Participant Terms and Conditions and Privacy Policy."*
- [ ] Tick: *"I confirm that the submitted project represents my team's original work and that all external resources including code, text and images (even if they are open source or freely available) used in the project are listed in the References field of the project submission form..."* Our References field lists every outside resource below.
- [ ] In **Use of Super Intelligence (SI)**, pick every option from the dropdown that applies to us: the ones for **code** and for **text** written with a large language model or chatbot (Claude). Do **not** pick image, video or audio generation. Paste our short answer below into the text box if there is one.
- [ ] Click **Submit for Judging** and check for the confirmation banner. Your participant certificate then appears in your profile (download it as PDF, Letter size, from a laptop).
- [ ] Optional (recommended by the guide for new websites): request a FortiGuard Web Filter Classification for the live app at https://www.fortiguard.com/faq/wfratingsubmit (category: Education or Web-based Application, Company Name: N/A), so judges on filtered networks can open it.

---

## Project Name

TerraPulse: Reading Earth's signals. Revealing its changes.

## High-Level Project Summary

TerraPulse is an open-source web app that turns NASA-ISRO NISAR L-band radar into a living map of how land and water change. For the lower Indus in Sindh, Pakistan, it streams a full year of NISAR GCOV data (28 passes) and maps open water, water hidden under crops and reeds, and the yearly rhythm of every 100 m of land. Water mapping is calibrated against a permanent lake and dry desert, corrected for radar mode, and checked against an independent lake. The app shows that NISAR saw the rice season unfold through monsoon clouds that blinded optical satellites: fields flooded in July, rice standing in water peaked at about 1,200 km² in September, then the harvest. A second site at Manaus shows the Amazon flood pulse, and any place on Earth can be explored through NASA's NISAR mosaics. Anyone can compare dates, measure an area, download data, or listen to the year as sound.

## Link to Project Demo

https://sudais-khalid.github.io/terrapulse/slides.html

(Our 7-slide demo deck: title, problem, NASA data, science, results, the app, impact. If we record the 30-second video from `docs/DEMO_VIDEO.md`, upload it to YouTube as *Unlisted* with the English subtitles from `docs/demo_subtitles.srt` and put that link here instead.)

## Link to Final Project

https://sudais-khalid.github.io/terrapulse/

(Live web app. Source code, Colab notebook and data pipeline: https://github.com/sudais-khalid/terrapulse . Open data catalog: https://sudais-khalid.github.io/terrapulse/data/catalog.json)

## Detailed Project Description

**What it does**

The ASF archive holds 33 NISAR products for our Indus track; 3 are older BETA versions and 2 are duplicate reprocessings of dates we already have, so we use 28 distinct passes, each from a single processing version. TerraPulse answers three questions for any NISAR study area: where is water now, where is water hidden under vegetation, and how does each place change through the year.

- **Story mode** walks through the year in short chapters. Every number in the text is computed from the data when the page loads.
- **Explore mode** offers seven layers: radar colour, water and flooded vegetation, change between any two passes, how often each place was under water, a "surface rhythm" classification, vegetation swing, and NISAR worldwide.
- **Compare** two passes with a swipe divider, or compare radar with the optical image (MODIS or Harmonized Landsat Sentinel-2) of the same day, which shows why radar matters during the monsoon.
- **Pulse strip**: open water and flooded vegetation for every pass against daily GPM IMERG rainfall, for the whole area or one place. Press play to animate, or *Listen* to hear the year: pitch follows open water, a second voice follows flooded vegetation, and a soft hiss marks rain.
- **Tools**: click any pixel for its radar history, drag a box to measure any area across all passes, download CSV, and see automatically detected notable changes (compared only between passes in the same radar mode).
- **Anywhere on Earth**: fly anywhere, find the dates NISAR imaged that spot through the ASF Search API, and view NASA GIBS NISAR mosaics.
- **Shareable links** reproduce any view.
- **Open data**: every map layer is published as a STAC catalog, the open standard for Earth observation data, so anyone can reuse TerraPulse outputs in Python, QGIS or STAC Browser. Each pass links back to its source NISAR granule.

**How it works**

1. A Python pipeline (`terrapulse/`) searches the ASF DAAC archive and keeps one GCOV product per date from a single processing version (PROVISIONAL, CRID P05023), plus the newest VALIDATED passes, so changes are not software artefacts.
2. Each GCOV file is 6 to 9 GB. Instead of downloading it, TerraPulse reads the HDF5 chunk index and fetches only the compressed chunks covering the study area with parallel HTTP range requests, decodes them, and checks the decoder against h5py. Each pass becomes about 1 to 2 MB of map layers for the browser.
3. Samples flagged invalid by the NISAR mask (swath gaps) are dropped, and 10 m and 20 m pixels are averaged onto a 100 m grid.
4. Open water: HH and HV thresholds are chosen separately for each radar mode to best separate a permanent reference lake (Keenjhar Lake) from dry reference land (rocky desert near Jhimpir). The 40 MHz mode reads dark surfaces about 1 dB brighter, which this corrects. A pixel that turns at least 3 dB darker than its own median in both channels also counts as newly flooded.
5. Flooded vegetation: L-band passes through crop and reed canopies and double-bounces off stems standing in water, so HH jumps at least 3 dB above that pixel's normal level and rises more than HV.
6. Quality control: when the reference lake stops looking like water (wind roughening), the pass is flagged rather than reported as drying. Haleji Lake, not used for calibration, is an independent check.
7. Surface rhythm: unsupervised k-means clustering of each pixel's yearly statistics, named by physical rules (permanent water, seasonal water, flood-prone vegetation, cropland, woody vegetation, built-up, bare soil, sparse vegetation).
8. Rainfall: daily NASA GPM IMERG averaged over each zone.
9. Results are exported as small 8-bit Web Mercator PNG layers and a manifest. The static web app (MapLibre GL JS, plain JavaScript) decodes and colours them in the browser, so thresholds and change maps are computed live.
10. The same layers are published as a validated STAC 1.1.0 catalog. It records how to turn each 8-bit pixel back into decibels, where each image sits on Earth, what each class code means, and every pass's quality flags.
11. Engineering: a Python package with a command line, 57 automated tests (including the HDF5 decoder checked against h5py and the published data checked on every push), continuous integration on Python 3.10 to 3.13, and a Colab notebook kept in sync with the code by a test.

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
- Researchers and other apps can build on the outputs directly through the STAC catalog, without contacting us or reading our code.

**What makes it creative**

- The year is told as a dance: every place gets a "rhythm" (the still pool, the tide, the harvest waltz) found by clustering its radar signal and named by physical rules.
- *Listen* turns the year into music, so the flood season can be heard as well as seen.
- Radar and the optical image of the same day sit side by side behind a swipe divider, so anyone can see what the clouds hid.
- Story numbers are computed live from the data, and passes spoiled by wind or heavy rain are flagged automatically instead of being reported as change.
- The outputs are published as an open STAC catalog, so the maps are reusable data, not just pictures.

**Energy, accessibility and cost**

- *Energy:* instead of downloading whole 6 to 9 GB radar files, the pipeline fetches only the compressed pieces covering the study area, and the app is a static website with no server running. Each pass becomes 0.7 to 2 MB of map layers for the browser.
- *Accessibility:* plain-language stories, a typeface designed for low-vision readers (Atkinson Hyperlegible), keyboard control of the time strip and the compare divider, screen-reader labels, sound as a second way to read the data, and a layout that works on phones. No login is needed.
- *Cost:* everything is free to use and run: NASA open data, open-source libraries, Google Colab for processing and GitHub Pages for hosting. Adding a new site costs nothing but a short configuration and one Colab run.

**What we hope to achieve**

We want anyone responsible for land and water, starting with Sindh, to be able to open a link and see what the radar saw, even when clouds hide everything else. Next steps: automatic alerts when a new NISAR pass shows unusual water, more sites across Pakistan's flood-prone districts, and validation against field reports and optical imagery on clear days. Because the outputs are open (STAC) and the code is open source, other teams can adapt TerraPulse to their own rivers.

**Limits we state openly**

Wind-roughened water is undercounted (flagged); smooth dry desert can pass the water test (12 to 17% of desert pixels in our check area); a sharp HH rise can mean wet soil rather than standing water; radio interference can create bright spots; NISAR had a permanent data gap from 27 July to 10 August 2026; PROVISIONAL products are calibrated but still under validation.

**Tools, languages, hardware and software**

Python (NumPy, h5py, fsspec, aiohttp, SciPy, Pillow, asf_search), Google Colab for processing, JavaScript with MapLibre GL JS for the web app, Web Audio API for sound, GitHub Pages and GitHub Actions for hosting and continuous integration, pytest and ruff for testing and linting, STAC 1.1.0 (validated with pystac) for open data. Projection math (UTM, Web Mercator) and k-means are implemented in NumPy so the pipeline runs on restricted machines. No special hardware.

## Use of Super Intelligence (SI)

Yes. We used an AI coding assistant (Claude, by Anthropic) to help write code, documentation and text under our direction; we reviewed and tested everything. The idea, study sites, data and scientific method are our own. No AI-generated images, video or audio are used, and no NASA branding. This is noted in the project README.

## NASA Data

- **NISAR L2 GCOV** (Geocoded Polarimetric Covariance), NASA/JPL-Caltech and ISRO, from the ASF DAAC: 28 passes over the lower Indus (track 164, frame 76) and 10 passes over Manaus (track 140, frame 90). Core of every map and number.
- **NASA GIBS** layer `NISAR_L2_Geocoded_Polarimetric_Covariance`: NISAR worldwide view.
- **GPM IMERG** Late Run daily V07 (GES DISC): rainfall per zone in the pulse strip.
- **MODIS Terra Corrected Reflectance** and **Harmonized Landsat Sentinel-2 (HLS)** via NASA GIBS: optical comparison of the same day.
- **ASF Search API** and the **NISAR Data User Guide** (ASF): finding passes and product details.
- **NASA POWER** daily precipitation: fallback rainfall where IMERG is not available.

The form asks for one *Link Text* and one full *Link Url* per resource (click *Add* for each row):

| Link Text | Link Url |
|---|---|
| NISAR L2 GCOV (Geocoded Polarimetric Covariance) radar data | https://nisar-docs.asf.alaska.edu/gcov/ |
| NISAR mission (NASA-ISRO Synthetic Aperture Radar) | https://science.nasa.gov/mission/nisar/ |
| NISAR Data User Guide (ASF DAAC) | https://nisar-docs.asf.alaska.edu/ |
| ASF Data Search (NISAR data archive, ASF DAAC) | https://search.asf.alaska.edu/ |
| ASF Search API (finding NISAR passes) | https://docs.asf.alaska.edu/api/basics/ |
| NISAR on NASA Earthdata | https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/nisar |
| NISAR Cookbook (ASF OpenSARLab) | https://asfopensarlab.github.io/NISAR_Cookbook/ |
| GPM IMERG daily precipitation (Late Run V07) | https://gpm.nasa.gov/data/imerg |
| NASA GES DISC (IMERG data access) | https://disc.gsfc.nasa.gov/ |
| NASA GIBS (NISAR worldwide mosaics, MODIS and HLS imagery) | https://nasa-gibs.github.io/gibs-api-docs/ |
| MODIS Terra Corrected Reflectance | https://terra.nasa.gov/about/terra-instruments/modis |
| Harmonized Landsat and Sentinel-2 (HLS) | https://www.earthdata.nasa.gov/data/projects/hls |
| NASA POWER daily precipitation (fallback rainfall) | https://power.larc.nasa.gov/ |
| NASA Earthdata Login (data access) | https://urs.earthdata.nasa.gov/ |
| NASA Earthdata: What is Synthetic Aperture Radar | https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar |
| NISAR Societal Benefits (application white papers) | https://science.nasa.gov/mission/nisar/societal-benefits/ |

## Space Agency Partner Data and Other References

The form asks for one *Link Text* and one full *Link Url* per resource. Main resources (the last row links to the complete list below):

| Link Text | Link Url |
|---|---|
| ISRO (Indian Space Research Organisation), NISAR partner agency | https://www.isro.gov.in/ |
| Esri World Imagery basemap and reference labels | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 |
| Sindh PDMA monsoon situation reports 2026 | https://pdma.gos.pk/ |
| MapLibre GL JS (web map library) | https://maplibre.org/maplibre-gl-js/docs/ |
| NumPy (numerical computing) | https://numpy.org/ |
| h5py (reading NISAR HDF5 files) | https://www.h5py.org/ |
| asf_search (ASF Python search library) | https://github.com/asfadmin/Discovery-asf_search |
| STAC specification (open data catalog standard) | https://stacspec.org/ |
| Google Colab (data processing) | https://colab.research.google.com/ |
| GitHub Pages (hosting) | https://docs.github.com/en/pages |
| Counterproof (mutation testing of our tests) | https://github.com/sudais-khalid/counterproof |
| Claude by Anthropic (AI coding assistant) | https://claude.com/product/overview |
| Full list of all libraries, fonts and tools used | https://github.com/sudais-khalid/terrapulse/blob/main/docs/SUBMISSION.md |

**Space Agency Partner data**

- **ISRO (Indian Space Research Organisation)**, a 2026 Space Agency Partner, is NISAR's partner agency; ISRO's contribution is part of every NISAR product we use. Our maps use the L-band GCOV products distributed by the ASF DAAC.

**Other data**

- Esri World Imagery basemap (Esri, Maxar, Earthstar Geographics) and Esri World Boundaries and Places reference labels, shown with attribution in the app.
- Sindh PDMA situation reports, July and August 2026 (https://pdma.gos.pk/), cited in the app as context for the monsoon rain.

**Software, code and services** (open source or free to use, used as declared dependencies or services)

- Python libraries: NumPy, SciPy, h5py, Pillow, fsspec, aiohttp, requests, asf_search (Alaska Satellite Facility). Development: pytest, ruff, pystac and jsonschema (STAC validation).
- Web: MapLibre GL JS 4.7.1 (BSD-3-Clause, loaded from unpkg), Web Audio API.
- STAC 1.1.0 specification and extensions (https://stacspec.org/); STAC Browser by Radiant Earth (linked for browsing the catalog).
- Counterproof (mutation testing of our tests).
- Google Colab (processing), GitHub, GitHub Actions and GitHub Pages (code, testing, hosting).
- Fonts: Big Shoulders, Atkinson Hyperlegible and Martian Mono (Google Fonts, SIL Open Font License).
- Interface icons: Lucide (https://lucide.dev/, ISC licence). The NISAR satellite drawing is our own, based on NASA's description of the spacecraft.
- AI coding assistant: Claude (Anthropic).

**Images**

- All images are our own screenshots of the TerraPulse app. They show NISAR, MODIS and HLS data from NASA, and the Esri basemap with its attribution.

**Documentation and literature**

- NISAR Data User Guide, Alaska Satellite Facility: https://nisar-docs.asf.alaska.edu/ (Kristenson et al., 2026, doi:10.5281/ZENODO.20075813)
- NISAR applications white papers (Floods, Food Security): https://science.nasa.gov/mission/nisar/societal-benefits/
- Earthdata, What is Synthetic Aperture Radar: https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar
- ASF OpenSARLab NISAR Cookbook: https://asfopensarlab.github.io/NISAR_Cookbook/
- GPM IMERG: https://gpm.nasa.gov/data/imerg
- NASA GIBS: https://nasa-gibs.github.io/gibs-api-docs/
- Sindh PDMA situation reports, monsoon 2026: https://pdma.gos.pk/
