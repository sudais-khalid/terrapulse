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

export function buildStory(m) {
  const dates = m.dates.map((d) => d.date);
  const all = m.zones.all.series;
  const idx = (d) => Math.max(0, dates.indexOf(d));
  const valid = all.map((s, i) => [s, i]).filter(([s]) => s);
  const wMax = valid.reduce((a, b) => (b[0].water_km2 > a[0].water_km2 ? b : a));
  const wMin = valid.reduce((a, b) => (b[0].water_km2 < a[0].water_km2 ? b : a));
  const fMax = valid.reduce((a, b) => (b[0].flooded_veg_km2 > a[0].flooded_veg_km2 ? b : a));
  const before = dates.includes("2026-07-19") ? "2026-07-19" : dates[Math.floor(dates.length / 2)];
  const after = dates.includes("2026-08-12") ? "2026-08-12" : dates[Math.min(dates.length - 1, idx(before) + 1)];
  const keen = m.zones.keenjhar;
  const keenVals = keen ? keen.series.filter(Boolean).map((s) => s.water_km2) : [];

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
      kicker: "Open water, measured",
      title: "Water you can count",
      body: `<p>Calm water is the darkest thing radar sees. TerraPulse marks a pixel as open water when both polarisations fall below a threshold found automatically from the data (HH under ${m.params.water_hh_db} dB, HV under ${m.params.water_hv_db} dB).</p>
             <div class="fig"><b>${km(wMax[0].water_km2)} km²</b><span>open water on ${day(dates[wMax[1]])}, the wettest pass of the year</span></div>
             <p>The driest pass, ${day(dates[wMin[1]])}, showed ${km(wMin[0].water_km2)} km². The blue line in the strip below tracks every pass in between.</p>`,
      view: { bbox: m.site.bbox }, layer: "water", date: dates[wMax[1]],
    },
    {
      kicker: "Monsoon 2026",
      title: "After the August rain",
      body: `<p>In early August 2026 a heavy monsoon spell hit Hyderabad, Badin and Thatta, and canals breached in Badin. NISAR happened to be off at that moment (a permanent instrument gap from 27 July to 10 August), but it imaged the area on ${day(before)} and again on ${day(after)}.</p>
             <p>Drag the divider: left is ${day(before)}, right is ${day(after)}. Blue is open water; purple marks fields where the radar brightened sharply, typical of water standing under crops or of soaked soil.</p>
             <p>For a pixel-by-pixel summary, open Explore and choose <i>What changed</i>.</p>
             <p class="src">Rain reports: Sindh PDMA situation reports, July and August 2026.</p>`,
      view: { center: [68.55, 24.85], zoom: 9 }, layer: "water", date: after, compare: before,
    },
    {
      kicker: "What L-band adds",
      title: "Water under the canopy",
      body: `<p>Optical satellites see the tops of crops and reeds. NISAR's 24 cm wavelength slips between leaves, hits standing water and bounces back off stems, which makes flooded vegetation unusually bright in HH.</p>
             <div class="fig"><b>${km(fMax[0].flooded_veg_km2)} km²</b><span>likely flooded vegetation on ${day(dates[fMax[1]])}</span></div>
             <p>Look for purple patches in the rice belt east of the Indus. These are estimates: a sharp rise in HH can also mean very wet soil.</p>`,
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
             ${keenVals.length ? `<p>Keenjhar Lake stays still at about ${km(keenVals.reduce((a, b) => a + b, 0) / keenVals.length)} km² of open water. The coastal lagoons, the floodplain and the rice belt each keep their own beat.</p>` : ""}
             <p>Now explore: pick any layer and date, click a spot to see its history, or switch to NISAR worldwide and fly anywhere on Earth.</p>`,
      view: { bbox: m.site.bbox }, layer: "rhythm",
    },
  ];
}

export const LEARN_HTML = `
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
  <li><b>Data:</b> NISAR Level-2 GCOV (radiometrically terrain corrected gamma-naught), track 164, frame 76, from the ASF DAAC. The core series uses one processing version (PROVISIONAL, CRID P05023) so changes are not artefacts of software updates. The newest pass comes from the VALIDATED collection and is marked in the strip.</li>
  <li><b>Streaming:</b> only the study area is read from each 6 GB file, by fetching the compressed HDF5 chunks we need in parallel.</li>
  <li><b>Grid:</b> 10 m and 20 m pixels are averaged to 100 m, which also suppresses speckle.</li>
  <li><b>Open water:</b> HH and HV both below thresholds chosen by Otsu's method on the whole year's histogram.</li>
  <li><b>Flooded vegetation (likely):</b> HH at least 3 dB above that pixel's own median, rising more than HV, and bright overall, excluding built-up areas.</li>
  <li><b>Change:</b> log ratio between any two dates, sorted into new water, receding water, brighter HH, more or less vegetation.</li>
  <li><b>Surface rhythm:</b> k-means clustering of each pixel's yearly statistics, named by physical rules.</li>
  <li><b>Rain:</b> NASA POWER daily precipitation for context.</li>
</ul>

<h3>Limits to keep in mind</h3>
<ul>
  <li>Wind can roughen water and hide it; very smooth dry soil can look like water.</li>
  <li>A sharp HH rise can mean very wet soil rather than standing water.</li>
  <li>Radio interference can create bright blobs on single dates.</li>
  <li>NISAR had a permanent data gap from 27 July to 10 August 2026.</li>
  <li>NASA POWER rainfall is a coarse model and underestimates local downpours.</li>
  <li>The PROVISIONAL products are calibrated but still being validated by the mission.</li>
</ul>

<h3>Data and credits</h3>
<ul>
  <li>NISAR GCOV: NASA/JPL-Caltech and ISRO, distributed by the Alaska Satellite Facility DAAC.</li>
  <li>NISAR worldwide mosaics: NASA Global Imagery Browse Services (GIBS).</li>
  <li>Rainfall: NASA POWER project (MERRA-2, GEOS-IT).</li>
  <li>Basemap: Esri World Imagery and reference labels.</li>
  <li>Built by team TERRAPULSE for the 2026 NASA Space Apps Challenge, challenge "Dancing with the SARs". Open source under Apache 2.0.</li>
</ul>
`;
