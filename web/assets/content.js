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

// The cloudiest pass in optical imagery, checked against NASA MODIS Terra true colour (GIBS):
// about 65% cloud over the Indus delta on 7 July 2026, 96% cloud and haze over Manaus on 2 November 2026.
const CLOUDY_PASS = { "lower-indus": "2026-07-07", "amazon-manaus": "2026-11-02" };

// Daily rain helpers (mm, area mean over the whole study area).
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function rainBetween(m, from, to) {
  const s = m.rain?.series?.all;
  if (!s) return null;
  let total = 0, best = [0, null];
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    const v = s[d] ?? 0;
    total += v;
    const two = v + (s[addDays(d, 1)] ?? 0);
    if (addDays(d, 1) <= to && two > best[0]) best = [two, d];
  }
  return { total, peak2: best[0], peakDay: best[1] };
}
const rainName = (m) => (m.rain?.source?.includes("IMERG") ? "NASA's GPM IMERG" : "NASA POWER");
const shortDay = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const reliable = (m) => m.zones.all.series.map((s, i) => [s, i]).filter(([s, i]) => s && !m.dates[i].wind_roughened && !m.dates[i].rain_affected);

export function buildStory(m) {
  return m.site.key === "lower-indus" ? storyIndus(m) : storyGeneric(m);
}

// Data-driven story for any floodplain site: everything quoted is computed from the manifest.
function storyGeneric(m) {
  const dates = m.dates.map((d) => d.date);
  const first = dates[0], last = dates[dates.length - 1];
  const ok = reliable(m);
  const wMax = ok.reduce((a, b) => (b[0].water_km2 > a[0].water_km2 ? b : a));
  const peak = dates[wMax[1]];
  const wPeak = wMax[0].water_km2, wLast = m.zones.all.series[dates.length - 1].water_km2;
  const fMax = ok.reduce((a, b) => (b[0].flooded_veg_km2 > a[0].flooded_veg_km2 ? b : a));
  const fLast = m.zones.all.series[dates.length - 1].flooded_veg_km2;
  const iPeak = wMax[1], iLast = dates.length - 1;
  const zones = Object.entries(m.zones).filter(([k, z]) => k !== "all" && k !== m.site.water_ref && ["wetland", "river", "lake"].includes(z.kind));
  const biggest = zones.map(([k, z]) => {
    const a = z.series[iPeak], b = z.series[iLast];
    return a && b ? [z.name, b.water_km2 - a.water_km2, a.water_km2] : null;
  }).filter(Boolean).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const ref = m.zone_boxes[m.site.water_ref]?.name;
  const pct = (a, b) => Math.round((Math.abs(b - a) / Math.max(a, 1e-9)) * 100);
  const rain = peak < last ? rainBetween(m, peak, last) : null;
  const wet = m.dates.filter((d) => d.rain_affected);
  const cloudy = dates.includes(CLOUDY_PASS[m.site.key]) ? CLOUDY_PASS[m.site.key] : null;
  const isAmazon = m.site.key === "amazon-manaus";
  const chapters = [
    {
      kicker: `${m.dates.length} radar passes, ${m.site.name}, ${m.site.country}`,
      title: isAmazon ? "Where two rivers dance" : m.site.name,
      body: isAmazon
        ? `<p>At Manaus the black waters of the Rio Negro meet the muddy Solimões and run side by side for kilometres before mixing into the Amazon. Around them, forests stand in water for months each year.</p>
           <p>NISAR imaged this reach ${m.dates.length} times between ${day(first)} and ${day(last)}, from high water into the low-water season.</p>
           <p>In this radar colour image the forest is green, the city pink and white, and the rivers and lakes black.</p>`
        : `<p>NISAR imaged this area ${m.dates.length} times between ${day(first)} and ${day(last)}.</p>`,
      view: { bbox: m.site.bbox }, layer: "radar", date: first,
    },
  ];
  if (cloudy) chapters.push({
    kicker: "Why radar",
    title: "Clouds can't hide the river",
    body: `<p>On ${day(cloudy)} NASA's MODIS camera saw this whole area under cloud and haze. NISAR, passing the same day, mapped every river channel, lake and flooded patch underneath.</p>
           <p>Drag the divider: left is NISAR's water map, right is the optical image from the same day. In the humid tropics clear optical views can be rare for weeks; radar does not need them.</p>
           <p class="src">Optical: MODIS Terra corrected reflectance, NASA GIBS.</p>`,
    view: { bbox: m.site.bbox }, layer: "water", date: cloudy, compareWith: "optical",
  });
  chapters.push({
    kicker: "The flood pulse",
    title: isAmazon ? "The river breathes out" : "Water you can count",
    body: `<p>Open water across the area peaked at ${km(wPeak)} km² on ${day(peak)} and ${wLast < wPeak ? "fell" : "stood"} to ${km(wLast)} km² by ${day(last)}${wLast < wPeak ? `, ${pct(wPeak, wLast)}% less` : ""}.</p>
           ${biggest ? `<div class="fig"><b>${biggest[1] >= 0 ? "+" : ""}${km(biggest[1])} km²</b><span>open water in ${biggest[0]}, ${biggest[1] < 0 ? "down" : "up"} ${pct(biggest[2], biggest[2] + biggest[1])}% from high water</span></div>` : ""}
           ${isAmazon && rain ? `<p>${rainName(m)} measured ${Math.round(rain.total)} mm of rain over the area between those two passes, yet the water kept draining. The Amazon's level is set by rain over its whole upstream basin, weeks to months earlier, not by local showers. At Manaus the river usually crests in June or July and is lowest in October or November.</p>` : ""}
           <p>Drag the divider: left is ${day(peak)}, right is ${day(last)}.</p>
           ${ref ? `<p class="src">Water thresholds calibrated on ${ref} (water) and ${m.zone_boxes[m.site.dry_ref]?.name || "dry land"}.</p>` : ""}`,
    view: { bbox: m.site.bbox }, layer: "water", date: last, compare: peak,
  });
  chapters.push({
    kicker: "What L-band adds",
    title: isAmazon ? "Forests standing in water" : "Water under the canopy",
    body: `<p>When a forest floods, NISAR's 24 cm waves pass through the canopy, hit the water and bounce back off the trunks. Flooded forest shines in HH.</p>
           <div class="fig"><b>${km(fMax[0].flooded_veg_km2)} → ${km(fLast)} km²</b><span>likely flooded vegetation, ${day(dates[fMax[1]])} to ${day(last)}</span></div>
           <p>Purple marks where the radar brightened sharply against that place's own normal level. Drag the divider to see it vanish as the water drains from under the trees.</p>
           ${wet.length ? `<p>One trap: on ${wet.map((d) => `${day(d.date)}, after ${Math.round(d.rain_3d_mm)} mm of rain in three days`).join("; ")}, wet canopies brightened and briefly mimicked flooding. TerraPulse flags such passes as <i>rain</i> in the strip and leaves them out of its peaks and alerts.</p>` : ""}`,
    view: { bbox: m.site.bbox }, layer: "water", date: last, compare: dates[fMax[1]],
  });
  chapters.push({
    kicker: "Every place has a rhythm",
    title: "The floodplain's dance",
    body: `<p>TerraPulse groups every 100 m cell by how its radar signal moved across these passes. Rivers and lakes hold still, the floodplain swirls as water comes and goes, and the upland forest sways slowly.</p>
           <p>Switch sites at the top to compare this rhythm with the lower Indus, or open Explore.</p>`,
    view: { bbox: m.site.bbox }, layer: "rhythm",
  });
  return chapters;
}

function storyIndus(m) {
  const dates = m.dates.map((d) => d.date);
  const all = m.zones.all.series;
  const idx = (d) => Math.max(0, dates.indexOf(d));
  // Extremes skip passes where wind roughened the water (the reference lake stopped looking like water).
  const valid = reliable(m);
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
  const aug = rainBetween(m, before, after);

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
             ${aug && aug.total >= 1 ? `<p>${rainName(m)} measured ${Math.round(aug.total)} mm of rain averaged over the study area between the two passes, ${Math.round(aug.peak2)} mm of it on ${shortDay(aug.peakDay)} and ${shortDay(addDays(aug.peakDay, 1))}.</p>` : ""}
             <div class="fig"><b>${lagoonDelta >= 0 ? "+" : ""}${km(lagoonDelta)} km²</b><span>open water in the Badin coastal lagoons between the two passes</span></div>
             <p>Drag the divider: left is ${day(before)}, right is ${day(after)}. Blue is open water. Purple, which grew by ${km(floodDelta)} km², marks fields where the radar brightened sharply: water standing under a crop.</p>
             <p class="src">Rain: ${m.rain?.source || "not loaded"}; Sindh PDMA situation reports, July and August 2026.</p>`,
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

const stacUrl = () => new URL("data/catalog.json", location.href).href.split("#")[0];

export function learnHTML(m) {
  const z = (k) => m.zone_boxes[k]?.name || k;
  const indus = m.site.key === "lower-indus";
  const rain = m.rain?.source || "no rainfall data loaded";
  const modes = [...new Set(m.dates.map((d) => d.mode))];
  const nVal = m.dates.filter((d) => d.maturity === "VALIDATED").length;
  const fr = m.params.reference_lake_water_frac?.filter((v) => v != null) || [];
  const frTxt = fr.length ? `${Math.round(Math.min(...fr) * 100)}% to ${Math.round(Math.max(...fr) * 100)}%` : "";
  const wet = m.dates.filter((d) => d.rain_affected).map((d) => d.date);
  return `
<h2>How it works</h2>
<p>TerraPulse reads radar from <b>NISAR</b>, the NASA and ISRO Synthetic Aperture Radar satellite launched in July 2025. It images nearly all land every 12 days, day or night, through clouds.</p>
<div class="sat-card">
  <svg viewBox="0 0 120 80" role="img" aria-label="Drawing of the NISAR satellite: a large gold mesh reflector on a boom, the instrument structure and a solar array"><path class="beam" d="M30 40 6 80h48z" fill="url(#g-beam)"/><use href="#nisar"/></svg>
  <dl>
    <dt>Launched</dt><dd>30 July 2025, a NASA and ISRO mission</dd>
    <dt>Radars</dt><dd>L-band, 24 cm wavelength (NASA JPL) and S-band, 9.4 cm (ISRO)</dd>
    <dt>Antenna</dt><dd>12 m gold-plated wire-mesh reflector on a 9 m boom</dd>
    <dt>Coverage</dt><dd>242 km wide swath; all land and ice every 12 days</dd>
    <dt>We use</dt><dd>L-band GCOV, HH and HV, ${m.dates.length} passes over ${m.site.name}</dd>
  </dl>
  <p class="src">Facts: NASA Science, About the NISAR Satellite. The drawing is illustrative.</p>
</div>

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
  <li><b>Data:</b> NISAR Level-2 GCOV (radiometrically terrain corrected gamma-naught), track ${m.site.track}, frame ${m.site.frame}, from the ASF DAAC. The core series uses one processing version (PROVISIONAL, CRID P05023) so changes are not artefacts of software updates. ${nVal === 1 ? "The newest pass comes from the VALIDATED collection (CRID P05036) and is marked in the strip." : nVal > 1 ? `The newest ${nVal} passes come from the VALIDATED collection (CRID P05036) and are marked in the strip.` : ""}</li>
  <li><b>Streaming:</b> only the study area is read from each 6 to 9 GB file, by fetching the compressed HDF5 chunks we need in parallel. Each pass becomes about 1 to 2 MB of map layers for your browser.</li>${indus ? `
  <li><b>Why 28 passes:</b> the ASF archive holds 33 products for this track and frame. Three are older BETA versions of 21 Nov, 15 Dec and 20 Jan, and two are duplicate reprocessings of 25 Jun and 5 Sep, so every date is used once, from a single processing version.</li>` : ""}
  <li><b>Quality mask:</b> samples NISAR flags as invalid (partially focused radar data in swath gaps) are dropped; ${modes.includes("2005") ? "on 20 MHz passes this removes about 16% of the area, " : ""}shown in grey.</li>
  <li><b>Grid:</b> 10 m and 20 m pixels are averaged to 100 m, which also suppresses speckle.</li>
  <li><b>Open water:</b> HH and HV both below thresholds that best separate ${z(m.site.water_ref)} (water) from ${z(m.site.dry_ref)} (dry land), ${modes.length > 1 ? "chosen separately for each radar mode because the 40 MHz mode reads dark surfaces about 1 dB brighter." : "for this site's single radar mode."} A pixel that turns at least 3 dB darker than its own median in both channels also counts as newly flooded.${indus ? " Haleji Lake, not used for calibration, stays at a steady size: an independent check." : ""}</li>
  <li><b>Wind check:</b> if less than 70% of ${z(m.site.water_ref)} reads as water on a pass, wind has roughened the water and that pass is flagged.</li>
  <li><b>Rain check:</b> a pass with at least ${m.params.rain_affected_mm_3d ?? 15} mm of rain over the area in the three days before it is flagged <i>rain</i>: wet canopies and soil brighten HH and roughen water.${wet.length ? ` Flagged here: ${wet.join(", ")}.` : " No pass is flagged at this site."}</li>
  <li><b>Flooded vegetation (likely):</b> HH at least 3 dB above that pixel's own median, rising more than HV, and bright overall, excluding built-up areas.</li>
  <li><b>Change:</b> log ratio between any two dates, sorted into new water, receding water, brighter HH, more or less vegetation.</li>
  <li><b>Surface rhythm:</b> k-means clustering of each pixel's yearly statistics, named by physical rules.</li>
  <li><b>Rain:</b> ${rain}.</li>
  <li><b>Optical comparison:</b> MODIS Terra true colour (daily, 250 m) and HLS (Landsat and Sentinel-2, 30 m) from NASA GIBS, shown beside the radar.</li>
</ul>

<h3>Limits to keep in mind</h3>
<ul>
  <li>Wind can roughen water and hide it.${frTxt ? ` Across all passes, ${z(m.site.water_ref)} read as water over ${frTxt} of its open-water core.` : ""}${indus ? " Smooth dry desert can look like water: in the Jhimpir check area 12 to 17% of desert pixels pass the water test, so small scattered blue specks on dry land are not reliable." : ""}</li>
  <li>A sharp HH rise can mean very wet soil or a rain-soaked canopy rather than standing water.</li>
  <li>Radio interference can create bright blobs on single dates.</li>
  <li>NISAR had a permanent data gap from 27 July to 10 August 2026.${m.site.key === "amazon-manaus" ? " At Manaus the series starts in June 2026, so the rising limb of the flood is not covered." : ""}</li>
  <li>Rainfall is averaged over grid cells about 10 km (IMERG) to 50 km (POWER) wide and can miss very local storms.${m.rain?.caveat ? " " + m.rain.caveat : ""}</li>
  <li>The PROVISIONAL products are calibrated but still being validated by the mission.</li>
</ul>

<h3>Open data</h3>
<p>Every layer in this app is published as a <b>STAC catalog</b> (SpatioTemporal Asset Catalog), the open standard for Earth observation data. Each NISAR pass is one entry that links back to its source radar granule at ASF and says how to turn the stored pixels into decibels, so the maps can be reused in Python, QGIS or any STAC tool.</p>
<p class="src"><a href="${stacUrl()}" target="_blank" rel="noopener">catalog.json</a> · <a href="https://radiantearth.github.io/stac-browser/#/external/${stacUrl().replace(/^https?:\/\//, "")}" target="_blank" rel="noopener">browse it in STAC Browser</a> · <a href="https://github.com/sudais-khalid/terrapulse" target="_blank" rel="noopener">source code and notebook</a></p>

<h3>Data and credits</h3>
<ul>
  <li>NISAR GCOV: NASA/JPL-Caltech and ISRO, distributed by the Alaska Satellite Facility DAAC.</li>
  <li>NISAR worldwide mosaics: NASA Global Imagery Browse Services (GIBS).</li>
  <li>Rainfall: ${rain}.</li>
  <li>Optical imagery: MODIS Terra and Harmonized Landsat Sentinel-2 (HLS), NASA GIBS.</li>
  <li>NISAR pass search: ASF Search API.</li>
  <li>Basemap: Esri World Imagery and reference labels.</li>
  <li>Interface icons: Lucide (ISC licence). The NISAR satellite drawing is our own, based on NASA's description.</li>
  <li>Built by team TERRAPULSE for the 2026 NASA Space Apps Challenge, challenge "Dancing with the SARs". Open source under Apache 2.0.</li>
</ul>
`;
}
