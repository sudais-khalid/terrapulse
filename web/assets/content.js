// Layers, story chapters and explainer text. Story numbers are computed from the manifest at runtime.

export const LAYERS = [
  { id: "radar", name: "Radar colour", desc: "NISAR HH and HV backscatter for the selected pass.", scope: "site", dated: true },
  { id: "water", name: "Water and flooded vegetation", desc: "Open water and water hidden under crops or reeds.", scope: "site", dated: true, threshold: true },
  { id: "change", name: "What changed", desc: "Differences between the compare date and the selected pass.", scope: "site", dated: true, needsCompare: true },
  { id: "occurrence", name: "How often under water", desc: "Share of the year's passes that saw open water.", scope: "site" },
  { id: "rhythm", name: "Surface rhythm", desc: "Each place grouped by how its radar signal moved through the year.", scope: "site" },
  { id: "crops", name: "Vegetation swing", desc: "How much the HV signal rose and fell: crop growth and harvest.", scope: "site" },
  { id: "gibs", name: "NISAR worldwide", desc: "NASA GIBS daily NISAR mosaics, anywhere on Earth.", scope: "world", dated: true },
];

export const RAMPS = {
  occurrence: [[0, [255, 255, 255, 0]], [0.05, [180, 214, 250, 150]], [0.4, [74, 157, 248, 220]], [1, [16, 52, 140, 245]]],
  crops: [[0, [0, 0, 0, 0]], [0.2, [70, 60, 30, 90]], [0.5, [224, 165, 38, 200]], [1, [140, 194, 101, 245]]],
};

export const WORLD_PLACES = [
  { name: "Indus delta, Pakistan", center: [67.8, 24.2], zoom: 8 },
  { name: "Sundarbans, Bangladesh", center: [89.3, 21.9], zoom: 8 },
  { name: "Amazon at Manaus, Brazil", center: [-60.0, -3.1], zoom: 8 },
  { name: "Mississippi delta, USA", center: [-89.6, 29.4], zoom: 8 },
  { name: "Nile delta, Egypt", center: [31.0, 30.9], zoom: 8 },
];

const km = (v) => (v >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
const day = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const monthName = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

// The cloudiest monsoon pass in optical imagery (checked against NASA MODIS true colour).
const CLOUDY_PASS = { "lower-indus": "2026-07-07" };

export function buildStory(m) {
  return m.site.key === "lower-indus" ? storyIndus(m) : storyGeneric(m);
}

// Data-driven story for any floodplain site: everything quoted is computed from the manifest.
function storyGeneric(m) {
  const dates = m.dates.map((d) => d.date);
  const first = dates[0], last = dates[dates.length - 1];
  const all = m.zones.all.series;
  const ok = all.map((s, i) => [s, i]).filter(([s, i]) => s && !m.dates[i].wind_roughened);
  const wFirst = ok[0][0].water_km2, wLast = ok[ok.length - 1][0].water_km2;
  const fFirst = ok[0][0].flooded_veg_km2, fLast = ok[ok.length - 1][0].flooded_veg_km2;
  const wMax = ok.reduce((a, b) => (b[0].water_km2 > a[0].water_km2 ? b : a));
  const wMin = ok.reduce((a, b) => (b[0].water_km2 < a[0].water_km2 ? b : a));
  const zones = Object.entries(m.zones).filter(([k, z]) => k !== "all" && ["wetland", "river", "lake"].includes(z.kind));
  const biggest = zones.map(([k, z]) => {
    const s = z.series.filter(Boolean);
    return s.length > 1 ? [z.name, s[s.length - 1].water_km2 - s[0].water_km2, s[s.length - 1].flooded_veg_km2 - s[0].flooded_veg_km2] : null;
  }).filter(Boolean).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const ref = m.zone_boxes[m.site.water_ref]?.name;
  const dir = (a, b) => (b < a ? "fell" : "rose");
  const isAmazon = m.site.key === "amazon-manaus";
  return [
    {
      kicker: `${m.dates.length} radar passes, ${m.site.name}, ${m.site.country}`,
      title: isAmazon ? "Where two rivers dance" : m.site.name,
      body: isAmazon
        ? `<p>At Manaus the black waters of the Rio Negro meet the muddy Solimoes and run side by side for kilometres before mixing into the Amazon. Around them, forests stand in water for months each year.</p>
           <p>NISAR imaged this reach ${m.dates.length} times between ${day(first)} and ${day(last)}, through the clouds that cover the rainforest most days.</p>`
        : `<p>NISAR imaged this area ${m.dates.length} times between ${day(first)} and ${day(last)}.</p>`,
      view: { bbox: m.site.bbox }, layer: "radar", date: first,
    },
    {
      kicker: "The flood pulse",
      title: isAmazon ? "The river breathes out" : "Water you can count",
      body: `<p>Open water across the area ${dir(wFirst, wLast)} from ${km(wFirst)} km² on ${day(first)} to ${km(wLast)} km² on ${day(last)}. It peaked at ${km(wMax[0].water_km2)} km² on ${day(dates[wMax[1]])} and was lowest at ${km(wMin[0].water_km2)} km² on ${day(dates[wMin[1]])}.</p>
             ${isAmazon ? `<p>At Manaus the river typically crests in June or July and drops to its lowest in October or November, a swing of about ten metres. Drag the divider: left is ${day(first)}, right is ${day(last)}.</p>` : ""}
             ${biggest ? `<div class="fig"><b>${biggest[1] >= 0 ? "+" : ""}${km(biggest[1])} km²</b><span>open water change in ${biggest[0]}, the biggest mover</span></div>` : ""}
             ${ref ? `<p class="src">Water thresholds calibrated on ${ref}.</p>` : ""}`,
      view: { bbox: m.site.bbox }, layer: "water", date: last, compare: first,
    },
    {
      kicker: "What L-band adds",
      title: isAmazon ? "Forests standing in water" : "Water under the canopy",
      body: `<p>When a forest floods, NISAR's 24 cm waves pass through the canopy, hit the water and bounce back off the trunks. Flooded forest shines in HH.</p>
             <div class="fig"><b>${km(fFirst)} → ${km(fLast)} km²</b><span>likely flooded vegetation, ${monthName(first)} to ${monthName(last)}</span></div>
             <p>Purple marks where the radar brightened sharply against that place's own normal level. Drag the divider, ${day(first)} on the left and ${day(last)} on the right, to see how much remains as the water drains from under the trees.</p>`,
      view: { bbox: m.site.bbox }, layer: "water", date: last, compare: first,
    },
    {
      kicker: "Every place has a rhythm",
      title: "The floodplain's dance",
      body: `<p>TerraPulse groups every 100 m cell by how its radar signal moved across these passes. Rivers and lakes hold still, the floodplain swirls as water comes and goes, and the upland forest sways slowly.</p>
             <p>Switch sites at the top to compare this rhythm with the lower Indus, or open Explore.</p>`,
      view: { bbox: m.site.bbox }, layer: "rhythm",
    },
  ];
}

function storyIndus(m) {
  const dates = m.dates.map((d) => d.date);
  const all = m.zones.all.series;
  const idx = (d) => Math.max(0, dates.indexOf(d));
  // Extremes skip passes where wind roughened the water (the reference lake stopped looking like water).
  const valid = all.map((s, i) => [s, i]).filter(([s, i]) => s && !m.dates[i].wind_roughened);
  const windy = m.dates.filter((d) => d.wind_roughened).map((d) => d.date);
  const wMax = valid.reduce((a, b) => (b[0].water_km2 > a[0].water_km2 ? b : a));
  const wMin = valid.reduce((a, b) => (b[0].water_km2 < a[0].water_km2 ? b : a));
  const fMax = valid.reduce((a, b) => (b[0].flooded_veg_km2 > a[0].flooded_veg_km2 ? b : a));
  const before = dates.includes("2026-07-19") ? "2026-07-19" : dates[Math.floor(dates.length / 2)];
  const after = dates.includes("2026-08-12") ? "2026-08-12" : dates[Math.min(dates.length - 1, idx(before) + 1)];
  const zs = (key, d, field) => m.zones[key]?.series[idx(d)]?.[field];
  const keen = m.zones.keenjhar;
  const keenVals = keen ? keen.series.filter((s, i) => s && !m.dates[i].wind_roughened).map((s) => s.water_km2) : [];
  const farms = m.zones["left-bank-farms"];
  const farmWater = farms ? farms.series.map((s, i) => [s ? s.water_km2 : -1, i]).reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
  const farmFlood = farms ? farms.series.map((s, i) => [s ? s.flooded_veg_km2 : -1, i]).reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
  const lagoonDelta = (zs("badin-lagoons", after, "water_km2") ?? 0) - (zs("badin-lagoons", before, "water_km2") ?? 0);
  const floodDelta = (zs("all", after, "flooded_veg_km2") ?? 0) - (zs("all", before, "flooded_veg_km2") ?? 0);
  const monthOf = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  return [
    {
      kicker: `${m.dates.length} radar passes, ${m.site.name}`,
      title: "The land keeps time",
      body: `<p>Every 12 days the NISAR satellite passes over the lower Indus and measures how the ground scatters its L-band radar back to space. Clouds, smoke and darkness do not stop it.</p>
             <p>Between ${day(dates[0])} and ${day(dates[dates.length - 1])} it recorded this delta's whole year: dry winter fields, pre-monsoon storms, the monsoon, the harvest.</p>
             <p>Press play on the strip below to watch the year go by, or keep reading.</p>`,
      view: { bbox: m.site.bbox }, layer: "radar", date: dates[0],
    },
    {
      kicker: "Reading the colours",
      title: "Green grows, blue lies flat",
      body: `<p>In this radar colour image, <b>green</b> is vegetation: leaves and stalks scatter the signal in every direction, so the cross-polarised HV channel lights up.</p>
             <p><b>Pink and white</b> are towns and tree trunks, where the signal bounces off walls and ground. <b>Dark blue to black</b> is calm water or smooth dry soil, which reflect the radar away like a mirror.</p>
             <p>Hyderabad glows near the top. The Indus is the dark thread running south to the sea.</p>`,
      view: { center: [68.25, 25.1], zoom: 9.2 }, layer: "radar", date: dates[idx(before)],
    },
    {
      kicker: "Why radar",
      title: "Clouds can't hide the water",
      body: `<p>On ${day(CLOUDY_PASS["lower-indus"])}, at the height of the monsoon, NASA's MODIS camera saw mostly cloud over the delta. NISAR, passing the same day, mapped every flooded field underneath.</p>
             <p>Drag the divider: left is NISAR's water map, right is the optical image from the same day. Radar brings its own light and its microwaves pass straight through cloud, smoke and darkness.</p>
             <p class="src">Optical: MODIS Terra corrected reflectance, NASA GIBS.</p>`,
      view: { center: [68.35, 24.85], zoom: 8.6 }, layer: "water", date: CLOUDY_PASS["lower-indus"], compareWith: "optical",
    },
    {
      kicker: "Open water, measured",
      title: "Water you can count",
      body: `<p>Calm water is the darkest thing radar sees, but at L-band smooth desert is nearly as dark. So TerraPulse learns its thresholds from two places it knows: Keenjhar Lake (always water) and the rocky desert near Jhimpir (always dry), separately for each radar mode. A field that suddenly turns 3 dB darker than its normal also counts as newly flooded.</p>
             <div class="fig"><b>${km(wMax[0].water_km2)} km²</b><span>open water on ${day(dates[wMax[1]])}, the wettest pass</span></div>
             <p>Keenjhar Lake reads about ${km(median(keenVals))} km² on almost every pass, a good sign the method is stable. The lowest reliable total, ${km(wMin[0].water_km2)} km², came in ${monthOf(dates[wMin[1]])}${windy.length ? `. On ${windy.map(day).join(" and ")} even the lake looked partly like land: wind had roughened its surface, so that pass is marked <i>wind</i> in the strip below and its total reads low` : ""}.</p>`,
      view: { bbox: m.site.bbox }, layer: "water", date: dates[wMax[1]],
    },
    {
      kicker: "Monsoon 2026",
      title: "After the August rain",
      body: `<p>In early August 2026 a heavy monsoon spell hit Hyderabad, Badin and Thatta, and canals breached in Badin. NISAR happened to be off at that moment (a permanent instrument gap from 27 July to 10 August), but it imaged the area on ${day(before)} and again on ${day(after)}.</p>
             <div class="fig"><b>${lagoonDelta >= 0 ? "+" : ""}${km(lagoonDelta)} km²</b><span>open water in the Badin coastal lagoons between the two passes</span></div>
             <p>Drag the divider: left is ${day(before)}, right is ${day(after)}. Blue is open water. Purple, which grew by ${km(floodDelta)} km², marks fields where the radar brightened sharply: water standing under a crop.</p>
             <p class="src">Rain reports: Sindh PDMA situation reports, July and August 2026.</p>`,
      view: { center: [68.62, 24.62], zoom: 9.1 }, layer: "water", date: after, compare: before,
    },
    {
      kicker: "What L-band adds",
      title: "Rice in standing water",
      body: `<p>Optical satellites see the tops of crops. NISAR's 24 cm wavelength slips between the leaves, hits the water under them and bounces back off the stems, so flooded fields light up in HH.</p>
             <div class="fig"><b>${km(fMax[0].flooded_veg_km2)} km²</b><span>likely flooded vegetation on ${day(dates[fMax[1]])}</span></div>
             ${farms && farmWater && farmFlood ? `<p>The radar traces the rice season on the left bank of the Indus: open water peaks on ${day(dates[farmWater[1]])} (${km(farmWater[0])} km²) as fields are flooded for transplanting, plants standing in water peak on ${day(dates[farmFlood[1]])} (${km(farmFlood[0])} km², about ${Math.round((farmFlood[0] / farms.area_km2) * 100)}% of that farm zone), then fade as the harvest comes in.</p>` : ""}
             <p class="src">Estimate: a sharp rise in HH can also mean very wet soil.</p>`,
      view: { center: [68.6, 25.0], zoom: 9.3 }, layer: "water", date: dates[fMax[1]],
    },
    {
      kicker: "The harvest waltz",
      title: "Fields that rise and fall",
      body: `<p>As crops grow, their leaves scatter more radar into the HV channel; at harvest the signal drops. This map shows how far HV swung during the year.</p>
             <p>Gold and green areas are the farms that danced the most. Desert and town barely move.</p>`,
      view: { center: [68.45, 25.05], zoom: 8.6 }, layer: "crops",
    },
    {
      kicker: "Every place has a rhythm",
      title: "One year, many dances",
      body: `<p>TerraPulse groups every 100 m cell by how its radar signal moved through the year, using unsupervised clustering, then names each group with simple physical rules.</p>
             <p>Keenjhar Lake and the Indus channel hold still. The rice belt swirls with water each autumn, the farms swing with every crop, and the green belt around Hyderabad and Tando Allahyar, known for its mango orchards, sways slowly all year.</p>
             <p>Now explore: pick any layer and date, click a spot to see its history, or switch to NISAR worldwide and fly anywhere on Earth.</p>`,
      view: { bbox: m.site.bbox }, layer: "rhythm",
    },
  ];
}

export function learnHTML(m) {
  const z = (k) => m.zone_boxes[k]?.name || k;
  const indus = m.site.key === "lower-indus";
  const rain = m.rain?.source || "no rainfall data loaded";
  return `
<h2>How it works</h2>
<p>TerraPulse reads radar from <b>NISAR</b>, the NASA and ISRO Synthetic Aperture Radar satellite launched in July 2025. It images nearly all land every 12 days, day or night, through clouds.</p>

<h3>Radar in one minute</h3>
<p>NISAR sends microwave pulses at the ground and records the echo. Two things shape the echo: how <b>rough or structured</b> the surface is, and how <b>wet</b> it is (water reflects microwaves strongly). Echo strength is reported in decibels (dB); lower is darker.</p>

<h3>The two channels used here</h3>
<div class="pol">
  <code>HH</code><span>Sent and received horizontally. Strong when the signal bounces off a wall or a stem standing in water (double bounce).</span>
  <code>HV</code><span>Sent horizontally, received vertically. Only volume scatterers such as leaves and branches twist the signal, so HV tracks vegetation.</span>
</div>

<h3>Why L-band</h3>
<p>NISAR's L-band wavelength is about 24 cm, long enough to pass through crop and reed canopies. That is why it can see water standing under vegetation that optical satellites and shorter radars miss.</p>

<h3>What we did with the data</h3>
<ul>
  <li><b>Data:</b> NISAR Level-2 GCOV (radiometrically terrain corrected gamma-naught), track ${m.site.track}, frame ${m.site.frame}, from the ASF DAAC. The core series uses one processing version (PROVISIONAL, CRID P05023) so changes are not artefacts of software updates. The newest pass comes from the VALIDATED collection and is marked in the strip.</li>
  <li><b>Streaming:</b> only the study area is read from each 6 GB file, by fetching the compressed HDF5 chunks we need in parallel.</li>
  <li><b>Quality mask:</b> samples NISAR flags as invalid (partially focused radar data in swath gaps) are dropped; on 20 MHz passes this removes about 16% of the area, shown in grey.</li>
  <li><b>Grid:</b> 10 m and 20 m pixels are averaged to 100 m, which also suppresses speckle.</li>
  <li><b>Open water:</b> HH and HV both below thresholds that best separate ${z(m.site.water_ref)} (water) from ${z(m.site.dry_ref)} (dry land), chosen separately for each radar mode because the 40 MHz mode reads dark surfaces about 1 dB brighter. A pixel that turns at least 3 dB darker than its own median in both channels also counts as newly flooded.${indus ? " Haleji Lake, not used for calibration, stays at a steady size: an independent check." : ""}</li>
  <li><b>Wind check:</b> if less than 70% of ${z(m.site.water_ref)} reads as water on a pass, wind has roughened the water and that pass is flagged.</li>
  <li><b>Flooded vegetation (likely):</b> HH at least 3 dB above that pixel's own median, rising more than HV, and bright overall, excluding built-up areas.</li>
  <li><b>Change:</b> log ratio between any two dates, sorted into new water, receding water, brighter HH, more or less vegetation.</li>
  <li><b>Surface rhythm:</b> k-means clustering of each pixel's yearly statistics, named by physical rules.</li>
  <li><b>Rain:</b> ${rain}.</li>
  <li><b>Optical comparison:</b> MODIS Terra true colour (daily, 250 m) and HLS (Landsat and Sentinel-2, 30 m) from NASA GIBS, shown beside the radar.</li>
</ul>

<h3>Limits to keep in mind</h3>
<ul>
  <li>Wind can roughen water and hide it.${indus ? " Smooth dry desert can look like water: in the Jhimpir check area 12 to 17% of desert pixels pass the water test, so small scattered blue specks on dry land are not reliable." : ""}</li>
  <li>A sharp HH rise can mean very wet soil rather than standing water.</li>
  <li>Radio interference can create bright blobs on single dates.</li>
  <li>NISAR had a permanent data gap from 27 July to 10 August 2026.</li>
  <li>Rainfall is averaged over grid cells about 10 km (IMERG) to 50 km (POWER) wide and can miss very local storms.</li>
  <li>The PROVISIONAL products are calibrated but still being validated by the mission.</li>
</ul>

<h3>Data and credits</h3>
<ul>
  <li>NISAR GCOV: NASA/JPL-Caltech and ISRO, distributed by the Alaska Satellite Facility DAAC.</li>
  <li>NISAR worldwide mosaics: NASA Global Imagery Browse Services (GIBS).</li>
  <li>Rainfall: ${rain}.</li>
  <li>Optical imagery: MODIS Terra and Harmonized Landsat Sentinel-2 (HLS), NASA GIBS.</li>
  <li>NISAR pass search: ASF Search API.</li>
  <li>Basemap: Esri World Imagery and reference labels.</li>
  <li>Built by team TERRAPULSE for the 2026 NASA Space Apps Challenge, challenge "Dancing with the SARs". Open source under Apache 2.0.</li>
</ul>
`;
}
