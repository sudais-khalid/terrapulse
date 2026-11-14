import { LAYERS, RAMPS, WORLD_PLACES, learnHTML, buildStory } from "./content.js";
import { radarColour, waterLive, changeMap, ramp, cssGradient, CHANGE_CLASSES, dbOf } from "./raster.js";
import { Pulse } from "./pulse.js";
import { Sonifier } from "./sound.js";
import { areaSeries, toCSV, download, zoneRows, notableChanges, findPasses } from "./tools.js";

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const GIBS_NISAR = (date) => `${GIBS_BASE}/NISAR_L2_Geocoded_Polarimetric_Covariance/default/${date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;
const OPTICAL = {
  modis: { name: "MODIS Terra", maxzoom: 9, url: (d) => `${GIBS_BASE}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` },
  "hls-s30": { name: "Sentinel-2 (HLS)", maxzoom: 12, url: (d) => `${GIBS_BASE}/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/${d}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` },
  "hls-l30": { name: "Landsat (HLS)", maxzoom: 12, url: (d) => `${GIBS_BASE}/HLS_L30_Nadir_BRDF_Adjusted_Reflectance/default/${d}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` },
};
const COLOURS = { water: [74, 157, 248, 235], flood: [196, 90, 216, 225], nodata: [138, 144, 168, 102] };
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const $ = (s) => document.querySelector(s);
const state = {
  site: null, mode: "story", layer: "radar", index: 0, compare: false, compareWith: "date", optical: "modis",
  compareIndex: null, thr: null, opacity: 0.9, chapter: 0, playing: null, sound: false, measuring: false,
  zone: "all", gibsDate: null,
};
let M, SITES = [], DATA = "", maps, pulse, story = [], stackData = null, renderToken = 0, lastArea = null;
const sonifier = new Sonifier();

// ------------------------------------------------------------------ helpers
function status(msg, ms = 2200) {
  const s = $("#status");
  s.textContent = msg;
  s.classList.add("show");
  clearTimeout(status.t);
  if (ms) status.t = setTimeout(() => s.classList.remove("show"), ms);
}
// Radar loader: shown only when work takes longer than a moment, so quick renders never flicker.
let loaderTimer = null, loaderCount = 0;
function loading(on, text = "Processing radar layer") {
  const el = $("#loader");
  if (on) {
    loaderCount++;
    $("#loader-text").textContent = text;
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(() => { if (loaderCount > 0) el.hidden = false; }, 260);
  } else {
    loaderCount = Math.max(0, loaderCount - 1);
    if (!loaderCount) { clearTimeout(loaderTimer); el.hidden = true; }
  }
}
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
function setSheet(open) {
  $("#panel").classList.toggle("collapsed", !open);
  $("#sheet-toggle").setAttribute("aria-expanded", String(open));
}
function radarSweep() {
  if (reducedMotion()) return;
  const el = $("#scan");
  el.classList.remove("run");
  void el.offsetWidth; // restart the animation
  el.classList.add("run");
}
const fileFor = (date, kind) => `${DATA}dates/${date}_${kind}.png`;
const dateOf = (i) => M.dates[i].date;
const layerDef = (id) => LAYERS.find((l) => l.id === id);
const niceDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtKm = (v) => (v == null ? "n/a" : v >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));

function baseStyle() {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster", tileSize: 256, maxzoom: 18,
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        attribution: "Imagery: Esri, Maxar, Earthstar Geographics",
      },
      labels: {
        type: "raster", tileSize: 256, maxzoom: 18,
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      },
    },
    layers: [
      { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": -0.55, "raster-brightness-max": 0.75 } },
      { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.85 } },
    ],
  };
}

function makeMap(container) {
  const map = new maplibregl.Map({ container, style: baseStyle(), center: [0, 20], zoom: 2, attributionControl: { compact: true }, maxZoom: 15 });
  let ready;
  map.ready = new Promise((ok) => (ready = ok));
  // A newer image replacing one still decoding aborts the old load; that is expected, not an error.
  map.on("error", (e) => { if (e?.error?.name !== "AbortError") console.error(e?.error || e); });
  // Start as soon as the style is ready. Waiting for "load" would also wait for the basemap tiles,
  // so a slow imagery server would keep the whole app (story text, layers, pulse strip) blank.
  let started = false;
  const init = () => {
    if (started) return;
    started = true;
    map.addSource("site", { type: "image", url: BLANK, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
    map.addLayer({ id: "site", type: "raster", source: "site", paint: { "raster-opacity": state.opacity, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, "labels");
    map.addSource("gibs", { type: "raster", tiles: [GIBS_NISAR("2026-10-23")], tileSize: 256, maxzoom: 13, attribution: "NISAR mosaics: NASA GIBS" });
    map.addLayer({ id: "gibs", type: "raster", source: "gibs", layout: { visibility: "none" }, paint: { "raster-opacity": state.opacity } }, "labels");
    map.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#d0563f", "fill-opacity": 0.12 } });
    map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#d0563f", "line-width": 2 } });
    ready();
  };
  map.on("style.load", init);
  map.on("load", init);
  return map;
}
const whenLoaded = (map) => map.ready;

function setOptical(map, key, date) {
  const o = OPTICAL[key];
  if (map.getLayer("optical")) map.removeLayer("optical");
  if (map.getSource("optical")) map.removeSource("optical");
  map.addSource("optical", { type: "raster", tiles: [o.url(date)], tileSize: 256, maxzoom: o.maxzoom, attribution: `${o.name}: NASA GIBS` });
  map.addLayer({ id: "optical", type: "raster", source: "optical" }, "labels");
}
function hideOptical(map) {
  if (map.getLayer("optical")) map.setLayoutProperty("optical", "visibility", "none");
}

// ------------------------------------------------------------------ layers
// Water thresholds for a pass: calibrated per radar mode, shifted by the user's slider if moved.
function thrFor(i) {
  const d = M.dates[i];
  const shift = state.thr == null ? 0 : state.thr - M.params.water_hh_db;
  return { hh: (d.thr_hh ?? M.params.water_hh_db) + shift, hv: d.thr_hv ?? M.params.water_hv_db };
}
const isWet = (h, v, i) => h != null && v != null && h < thrFor(i).hh && v < thrFor(i).hv;

async function imageFor(layer, i, iB) {
  const q = M.db_quant;
  const d = dateOf(i);
  switch (layer) {
    case "radar": return radarColour(fileFor(d, "hh"), fileFor(d, "hv"), q);
    case "water": {
      if (state.thr == null) return fileFor(d, "class");
      const t = thrFor(i);
      return waterLive(fileFor(d, "hh"), fileFor(d, "hv"), fileFor(d, "class"), q, t.hh, t.hv, COLOURS);
    }
    case "change": {
      const ia = iB ?? Math.max(0, i - 1);
      const a = dateOf(ia);
      const res = await changeMap({ hh: fileFor(a, "hh"), hv: fileFor(a, "hv"), thr: thrFor(ia) },
                                  { hh: fileFor(d, "hh"), hv: fileFor(d, "hv"), thr: thrFor(i) }, q);
      showChangeStats(res.counts);
      return res.url;
    }
    case "occurrence": return ramp(`${DATA}products/water_occurrence.png`, RAMPS.occurrence, { from: 1, to: 101, hideBelow: 2 });
    case "crops": return ramp(`${DATA}products/hv_range.png`, RAMPS.crops, { from: 1, to: 255 });
    case "rhythm": return `${DATA}products/rhythm.png`;
  }
  return null;
}

// Ready-made PNGs go in by URL; computed layers (ImageData) are encoded once.
const scratch = document.createElement("canvas");
async function setSite(map, img) {
  await whenLoaded(map);
  let url = BLANK;
  if (typeof img === "string") url = img;
  else if (img instanceof ImageData) {
    scratch.width = img.width;
    scratch.height = img.height;
    scratch.getContext("2d").putImageData(img, 0, 0);
    url = scratch.toDataURL("image/png");
  }
  map.getSource("site").updateImage({ url, coordinates: M.image.corners });
}

function compareState() {
  const L = layerDef(state.layer);
  const comparing = state.compare && L.dated && state.layer !== "change";
  const optical = comparing && state.compareWith === "optical";
  const iB = state.compareIndex ?? Math.max(0, state.index - 1);
  return { L, comparing, optical, iB, world: L.scope === "world" };
}

async function render() {
  const token = ++renderToken;
  const { L, comparing, optical, iB, world } = compareState();
  for (const map of maps) {
    await whenLoaded(map);
    map.setLayoutProperty("gibs", "visibility", world ? "visible" : "none");
    map.setLayoutProperty("site", "visibility", world ? "none" : "visible");
    map.setPaintProperty("site", "raster-opacity", state.opacity);
    map.setPaintProperty("gibs", "raster-opacity", state.opacity);
  }
  $(".stage").classList.toggle("comparing", comparing);
  $("#swipe").hidden = !comparing;
  const mainDate = world && state.gibsDate ? state.gibsDate : dateOf(state.index);

  if (!world) loading(true);
  try {
    // Left (full) map: the compare pass when comparing two passes, otherwise the selected pass.
    const leftIndex = comparing && !optical ? iB : state.index;
    if (world) maps[0].getSource("gibs").setTiles([GIBS_NISAR(comparing && !optical ? dateOf(iB) : mainDate)]);
    else {
      const img = await imageFor(state.layer, leftIndex, state.layer === "change" ? iB : undefined);
      if (token !== renderToken) { loading(false); return; }
      await setSite(maps[0], img);
    }
    // Right (clipped) map.
    if (comparing && optical) {
      maps[1].setLayoutProperty("site", "visibility", "none");
      maps[1].setLayoutProperty("gibs", "visibility", "none");
      setOptical(maps[1], state.optical, mainDate);
    } else {
      hideOptical(maps[1]);
      if (comparing && world) maps[1].getSource("gibs").setTiles([GIBS_NISAR(dateOf(state.index))]);
      else if (comparing) {
        const img = await imageFor(state.layer, state.index);
        if (token !== renderToken) { if (!world) loading(false); return; }
        await setSite(maps[1], img);
      }
    }
  } catch (e) {
    console.error(e);
    status(`Could not draw this layer: ${e.message}`, 6000);
  }
  if (!world) loading(false);
  updateChrome();
  writeHash();
}

function updateChrome() {
  const { L, comparing, optical, iB, world } = compareState();
  const d = M.dates[state.index];
  $("#date-chip").hidden = !L.dated;
  if (L.dated) {
    const extra = (d.maturity === "VALIDATED" ? " · validated" : "") + (d.wind_roughened ? " · <b>wind-roughened water</b>" : "") + (d.rain_affected ? ` · <b>${d.rain_3d_mm} mm rain in 3 days</b>` : "");
    if (world && state.gibsDate) $("#date-chip").innerHTML = `<b>${niceDate(state.gibsDate)}</b> · NISAR worldwide (NASA GIBS)`;
    else $("#date-chip").innerHTML = state.layer === "change"
      ? `${niceDate(dateOf(iB))} <b>→</b> ${niceDate(d.date)}`
      : `<b>${niceDate(d.date)}</b> · pass ${state.index + 1} of ${M.dates.length}${extra}`;
  }
  const mainDate = world && state.gibsDate ? state.gibsDate : d.date;
  const short = isPhone(); // the date chip already shows the date on phones
  $("#swipe-tag-a").textContent = optical ? (short ? "NISAR radar" : `NISAR radar · ${niceDate(mainDate)}`) : niceDate(dateOf(iB));
  $("#swipe-tag-b").textContent = optical ? (short ? OPTICAL[state.optical].name : `${OPTICAL[state.optical].name} · ${niceDate(mainDate)}`) : niceDate(d.date);
  pulse.setIndex(state.index, (state.layer === "change" || (comparing && !optical)) ? iB : null);
  $("#threshold-block").hidden = !L.threshold;
  $("#compare-dates").hidden = state.compareWith === "optical";
  $("#optical-opts").hidden = state.compareWith !== "optical";
  $("#optical-hint").hidden = state.compareWith !== "optical";
  renderLegend();
}

function renderLegend() {
  const box = $("#layer-legend");
  const sw = (c, label, extra = "") => `<div class="sw"><i style="background:${Array.isArray(c) ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : c}"></i>${label}${extra}</div>`;
  switch (state.layer) {
    case "radar":
      box.innerHTML = `<div class="swatches">${sw("#3fbf4f", "Vegetation (strong HV)")}${sw("#e8c8e8", "Towns, trunks (strong HH and HV)")}${sw("#b03aa8", "Double bounce, wet stems (strong HH)")}${sw("#111", "Calm water, smooth soil")}</div>`;
      break;
    case "water":
      box.innerHTML = `<div class="swatches">${sw(COLOURS.water, "Open water")}${sw(COLOURS.flood, "Flooded vegetation (likely)")}${sw(COLOURS.nodata, "No valid radar data on this pass")}</div>`;
      break;
    case "change":
      box.innerHTML = `<div class="swatches">${CHANGE_CLASSES.map((c) => sw(c.color, c.label, `<em id="chg-${c.key}"></em>`)).join("")}</div>`;
      break;
    case "occurrence":
      box.innerHTML = `<div class="ramp" style="background:${cssGradient(RAMPS.occurrence)}"></div><div class="ramp-labels"><span>never</span><span>half the passes</span><span>always</span></div>`;
      break;
    case "crops":
      box.innerHTML = `<div class="ramp" style="background:${cssGradient(RAMPS.crops)}"></div><div class="ramp-labels"><span>steady</span><span>7 dB</span><span>15 dB swing</span></div>`;
      break;
    case "rhythm":
      box.innerHTML = `<div class="swatches">${M.rhythm_classes.map((c) => sw(c.color, c.label, `<em>${c.dance}</em>`)).join("")}</div>`;
      break;
    case "gibs":
      box.innerHTML = `<p>NASA's false colour: <span style="color:#3fbf4f">green</span> vegetation, <span style="color:#f0b04a">orange and yellow</span> towns and sparse land, <span style="color:#4a9df8">blue</span> calm water and dry sand. Each day shows only that day's passes; NISAR revisits every 12 days.</p>
        <div class="compare-dates"><label>Day <input type="date" id="gibs-date" min="2025-10-29" value="${state.gibsDate || dateOf(state.index)}"></label></div>`;
      $("#gibs-date").addEventListener("change", (e) => { state.gibsDate = e.target.value; render(); });
      break;
  }
}

function showChangeStats(counts) {
  const cell = (M.image.res_m / 1000) ** 2;
  requestAnimationFrame(() => {
    for (const c of CHANGE_CLASSES) {
      const e = document.getElementById(`chg-${c.key}`);
      if (e) e.textContent = `${Math.round(counts[c.key] * cell).toLocaleString("en-GB")} km²`;
    }
  });
}

// ------------------------------------------------------------------ pixel history and area analysis
async function loadStack() {
  if (!stackData) stackData = new Uint8Array(await (await fetch(DATA + M.stack.file)).arrayBuffer());
  return stackData;
}
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

async function inspect(lngLat) {
  const [[w, n], [e], , [, s]] = M.image.corners;
  const fx = (lngLat.lng - w) / (e - w);
  const fy = (mercY(n) - mercY(lngLat.lat)) / (mercY(n) - mercY(s));
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return;
  const { width: sw, height: sh, factor } = M.stack;
  const col = Math.floor((fx * M.image.width) / factor), row = Math.floor((fy * M.image.height) / factor);
  if (col >= sw || row >= sh) return;
  const st = await loadStack();
  const hh = [], hv = [];
  for (let t = 0; t < M.dates.length; t++) {
    const a = st[((t * 2) * sh + row) * sw + col], b = st[((t * 2 + 1) * sh + row) * sw + col];
    hh.push(a ? dbOf(a, M.db_quant) : null);
    hv.push(b ? dbOf(b, M.db_quant) : null);
  }
  drawInspector(lngLat, hh, hv);
}

function chartFrame(svg, lo, hi, unit) {
  const W = svg.clientWidth || 330, H = 170, pad = { l: 46, r: 8, t: 10, b: 20 };
  const times = M.dates.map((d) => Date.parse(d.date));
  const span = Math.max(1, times[times.length - 1] - times[0]);
  const x = (t) => pad.l + ((t - times[0]) / span) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const step = unit === "dB" ? 5 : niceStep(hi - lo);
  let g = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += `<text x="2" y="${y(v) + 3}" fill="#6f7697" font-family="Martian Mono" font-size="9">${fmtTick(v)} ${unit}</text><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#1c2650"/>`;
  g += `<line x1="${x(times[state.index])}" x2="${x(times[state.index])}" y1="${pad.t}" y2="${H - pad.b}" stroke="#d0563f"/>`;
  g += `<text x="${pad.l}" y="${H - 5}" fill="#6f7697" font-family="Martian Mono" font-size="9">${niceDate(M.dates[0].date)}</text><text x="${W - pad.r}" y="${H - 5}" text-anchor="end" fill="#6f7697" font-family="Martian Mono" font-size="9">${niceDate(M.dates[M.dates.length - 1].date)}</text>`;
  const line = (arr) => arr.map((v, i) => (v == null ? null : `${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" L");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  return { g, x, y, times, line, W, pad };
}
const niceStep = (r) => { const p = 10 ** Math.floor(Math.log10(Math.max(r, 1e-6) / 4)); return [1, 2, 5, 10].map((k) => k * p).find((s) => r / s <= 5) || p * 10; };
const fmtTick = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : +v.toFixed(1));

function openInspector(title) {
  $("#inspector").hidden = false;
  if (isPhone()) setSheet(false);
  $("#insp-title").textContent = title;
  $("#insp-csv").hidden = true;
}

function drawInspector(lngLat, hh, hv) {
  openInspector("Pixel history");
  $("#insp-coords").textContent = `${Math.abs(lngLat.lat).toFixed(4)}° ${lngLat.lat >= 0 ? "N" : "S"}, ${Math.abs(lngLat.lng).toFixed(4)}° ${lngLat.lng >= 0 ? "E" : "W"} · about ${M.image.res_m * M.stack.factor} m cell`;
  const svg = $("#insp-chart");
  const vals = [...hh, ...hv].filter((v) => v != null);
  if (!vals.length) { svg.innerHTML = ""; $("#insp-read").textContent = "No radar data at this spot."; return; }
  const lo = Math.floor(Math.min(...vals, M.params.water_hh_db) - 2), hi = Math.ceil(Math.max(...vals) + 2);
  const f = chartFrame(svg, lo, hi, "dB");
  let g = f.g;
  g += `<line x1="${f.pad.l}" x2="${f.W - f.pad.r}" y1="${f.y(M.params.water_hh_db)}" y2="${f.y(M.params.water_hh_db)}" stroke="#4a9df8" stroke-dasharray="3 3" opacity=".7"/>`;
  g += `<text x="${f.W - f.pad.r}" y="${f.y(M.params.water_hh_db) - 4}" text-anchor="end" fill="#4a9df8" font-family="Martian Mono" font-size="9">water threshold</text>`;
  g += `<path d="M${f.line(hv)}" fill="none" stroke="#8cc265" stroke-width="1.8"/><path d="M${f.line(hh)}" fill="none" stroke="#ece6d6" stroke-width="1.8"/>`;
  hh.forEach((v, i) => { if (isWet(v, hv[i], i)) g += `<circle cx="${f.x(f.times[i])}" cy="${f.y(v)}" r="3.5" fill="#4a9df8"/>`; });
  svg.innerHTML = g;
  const wet = hh.filter((v, i) => isWet(v, hv[i], i)).length;
  const n = hh.filter((v) => v != null).length;
  const hvv = hv.filter((v) => v != null);
  const swing = hvv.length ? Math.max(...hvv) - Math.min(...hvv) : 0;
  const read = [`<span style="color:#ece6d6">HH</span> and <span style="color:#8cc265">HV</span> over ${n} passes.`];
  read.push(wet === 0 ? "Never open water." : wet >= n * 0.8 ? `Open water on ${wet} of ${n} passes: a permanent water body.` : `Open water on ${wet} of ${n} passes.`);
  if (swing >= 7) read.push(`HV swung ${swing.toFixed(0)} dB, a strong growth and harvest cycle.`);
  $("#insp-read").innerHTML = read.join(" ");
}

async function analyseArea(box) {
  loading(true, "Measuring the area on every pass");
  openInspector("Area analysis");
  $("#insp-chart").innerHTML = "";
  $("#insp-read").textContent = "Reading every pass...";
  const res = await areaSeries(M, fileFor, box, (k, n) => { $("#insp-read").textContent = `Reading pass ${k} of ${n}...`; });
  loading(false);
  if (!res) { $("#insp-read").textContent = "That box is outside the study area."; return; }
  lastArea = { box, ...res };
  const w = res.rows.map((r) => r.water_km2), f = res.rows.map((r) => r.flooded_veg_km2);
  const vals = [...w, ...f].filter((v) => v != null);
  const hi = Math.max(1, ...vals) * 1.1;
  const fr = chartFrame($("#insp-chart"), 0, hi, "km²");
  let g = fr.g + `<path d="M${fr.line(w)}" fill="none" stroke="#4a9df8" stroke-width="2"/><path d="M${fr.line(f)}" fill="none" stroke="#c45ad8" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  res.rows.forEach((r, i) => { if (r.wind || r.rain) g += `<text x="${fr.x(fr.times[i])}" y="16" text-anchor="middle" fill="#f2c36b" font-family="Martian Mono" font-size="8">${r.wind ? "wind" : "rain"}</text>`; });
  $("#insp-chart").innerHTML = g;
  $("#insp-coords").textContent = `Box of ${fmtKm(res.areaKm2)} km² · ${box[1].toFixed(3)} to ${box[3].toFixed(3)}, ${box[0].toFixed(3)} to ${box[2].toFixed(3)}`;
  const ok = res.rows.filter((r) => r.water_km2 != null && !r.wind && !r.rain);
  const maxW = ok.reduce((a, b) => (b.water_km2 > a.water_km2 ? b : a), ok[0]);
  const minW = ok.reduce((a, b) => (b.water_km2 < a.water_km2 ? b : a), ok[0]);
  const maxF = ok.reduce((a, b) => (b.flooded_veg_km2 > a.flooded_veg_km2 ? b : a), ok[0]);
  $("#insp-read").innerHTML = ok.length
    ? `<span style="color:#4a9df8">Open water</span> ranged from ${fmtKm(minW.water_km2)} km² (${niceDate(minW.date)}) to ${fmtKm(maxW.water_km2)} km² (${niceDate(maxW.date)}). <span style="color:#c45ad8">Flooded vegetation</span> peaked at ${fmtKm(maxF.flooded_veg_km2)} km² on ${niceDate(maxF.date)}.`
    : "Not enough valid radar data in this box.";
  $("#insp-csv").hidden = false;
}

// ------------------------------------------------------------------ measuring
function setMeasuring(on) {
  state.measuring = on;
  $("#measure").classList.toggle("active", on);
  $("#measure .lbl").textContent = on ? "Drag a box on the map..." : "Measure an area";
  $(".stage").classList.toggle("measuring", on);
  if (on) {
    if (isPhone()) setSheet(false);
    state.compare = false;
    syncControls();
    render();
    maps[0].dragPan.disable();
    status("Drag a box over the area you want to measure", 3500);
  } else maps[0].dragPan.enable();
}

function setupMeasureEvents() {
  let start = null;
  const boxGeo = (a, b) => ({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat]]] } }] });
  maps[0].on("mousedown", (e) => { if (state.measuring) { start = e.lngLat; e.preventDefault(); } });
  maps[0].on("mousemove", (e) => { if (state.measuring && start) maps[0].getSource("area").setData(boxGeo(start, e.lngLat)); });
  maps[0].on("mouseup", (e) => {
    if (!state.measuring || !start) return;
    const a = start, b = e.lngLat;
    start = null;
    setMeasuring(false);
    if (Math.abs(a.lng - b.lng) < 0.005 || Math.abs(a.lat - b.lat) < 0.005) { maps[0].getSource("area").setData({ type: "FeatureCollection", features: [] }); return; }
    analyseArea([Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]);
  });
}

// ------------------------------------------------------------------ story and modes
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.dataset.pane !== mode));
  setSheet(true);
  $("#panel").scrollTop = 0;
  if (mode === "story") showChapter(state.chapter);
  else writeHash();
}

function flyTo(view, duration = 1600) {
  const panel = $("#panel");
  const phone = isPhone();
  const sheet = phone && !panel.classList.contains("collapsed") ? panel.offsetHeight : 0;
  const padding = phone ? { top: 50, bottom: Math.min(sheet + 16, maps[0].getContainer().clientHeight * 0.6), left: 16, right: 16 }
                        : { top: 30, bottom: 30, left: panel.offsetWidth + 40, right: 30 };
  if (view.bbox) maps[0].fitBounds([[view.bbox[0], view.bbox[1]], [view.bbox[2], view.bbox[3]]], { padding, duration });
  else maps[0].flyTo({ center: view.center, zoom: view.zoom, duration });
}

function showChapter(i) {
  state.chapter = Math.max(0, Math.min(story.length - 1, i));
  const c = story[state.chapter];
  $("#chapter").innerHTML = `<div class="kicker">${c.kicker}</div><h2>${c.title}</h2>${c.body}`;
  document.querySelectorAll("#story-progress button").forEach((b, k) => {
    if (k === state.chapter) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    b.classList.toggle("seen", k < state.chapter);
  });
  $("#prev-ch").disabled = state.chapter === 0;
  $("#next-ch .lbl").textContent = state.chapter === story.length - 1 ? "Explore the map" : "Next";
  $("#ch-count").textContent = `${state.chapter + 1} / ${story.length}`;
  $("#panel").scrollTop = 0;
  radarSweep();
  state.layer = c.layer;
  state.gibsDate = null;
  if (c.date) state.index = Math.max(0, M.dates.findIndex((d) => d.date === c.date));
  state.compareWith = c.compareWith || "date";
  state.compareIndex = c.compare ? M.dates.findIndex((d) => d.date === c.compare) : null;
  state.compare = !!c.compare || c.compareWith === "optical";
  syncControls();
  flyTo(c.view);
  render();
}

function syncControls() {
  const r = document.querySelector(`input[name="layer"][value="${state.layer}"]`);
  if (r) r.checked = true;
  $("#compare-toggle").checked = state.compare;
  $("#compare-opts").hidden = !state.compare;
  const cw = document.querySelector(`input[name="cmpwith"][value="${state.compareWith}"]`);
  if (cw) cw.checked = true;
  $("#optical-src").value = state.optical;
  if (state.compareIndex != null) $("#date-a").value = String(state.compareIndex);
  $("#date-b").value = String(state.index);
  $("#zone-select").value = state.zone;
}

// ------------------------------------------------------------------ sites
async function loadSite(key, { keepView = false } = {}) {
  const site = SITES.find((s) => s.key === key) || SITES[0];
  state.site = site.key;
  DATA = `data/${site.key}/`;
  M = await (await fetch(DATA + "manifest.json")).json();
  stackData = null;
  lastArea = null;
  Object.assign(state, { index: 0, compareIndex: null, compare: false, compareWith: "date", thr: null, chapter: 0, zone: "all", gibsDate: null });
  $("#site-select").value = site.key;
  for (const map of maps) {
    await whenLoaded(map);
    map.getSource("site").setCoordinates(M.image.corners);
    map.getSource("area").setData({ type: "FeatureCollection", features: [] });
  }
  $("#inspector").hidden = true;
  pulse.setDates(M.dates, M.data_gap);
  story = buildStory(M);
  setupSiteControls();
  updatePulseZone();
  if (!keepView) flyTo({ bbox: M.site.bbox }, 0);
}

function setupSiteControls() {
  const opts = M.dates.map((d, i) => `<option value="${i}">${d.date}${d.maturity === "VALIDATED" ? " (validated)" : ""}${d.wind_roughened ? " (wind)" : ""}${d.rain_affected ? " (rain)" : ""}</option>`).join("");
  $("#date-a").innerHTML = opts;
  $("#date-b").innerHTML = opts;
  const thr = $("#thr");
  thr.value = M.params.water_hh_db;
  $("#thr-out").textContent = `${M.params.water_hh_db} dB`;
  $("#places").innerHTML = Object.entries(M.zone_boxes).map(([k, z]) => `<button class="chip" data-zone="${k}" title="${z.note}">${z.name}</button>`).join("");
  $("#zone-select").innerHTML = Object.entries(M.zones).map(([k, z]) => `<option value="${k}">${z.name}</option>`).join("");
  $("#story-progress").innerHTML = story.map((c, i) => `<button aria-label="Chapter ${i + 1}: ${c.title}"></button>`).join("");
  $("#learn").innerHTML = learnHTML(M);
  const ev = notableChanges(M);
  $("#events").innerHTML = ev.length ? ev.map((e, i) => `<button class="event" data-i="${i}"><b class="${e.field === "flooded_veg_km2" ? "veg" : e.delta >= 0 ? "up" : "down"}">${e.delta >= 0 ? "+" : ""}${fmtKm(e.delta)}</b><span>km² ${e.label} · ${e.zone}</span><small>${niceDate(dateOf(e.from))} → ${niceDate(dateOf(e.to))}</small></button>`).join("")
    : `<p class="hint">No large pass-to-pass changes detected.</p>`;
  $("#events").onclick = (e) => {
    const b = e.target.closest(".event");
    if (!b) return;
    const x = ev[+b.dataset.i];
    Object.assign(state, { layer: "change", compareIndex: x.from, index: x.to, compare: false, zone: x.key, gibsDate: null });
    syncControls();
    updatePulseZone();
    flyTo({ bbox: M.zone_boxes[x.key].bbox });
    render();
  };
}

function updatePulseZone() {
  const k = $("#zone-select").value || "all";
  state.zone = k;
  const z = M.zones[k];
  $("#pulse-title").textContent = `Open water, ${k === "all" ? "whole study area" : z.name}`;
  const rain = M.rain?.series?.[k] || M.rain?.series?.all || null;
  const src = M.rain?.source?.includes("IMERG") ? "GPM IMERG" : M.rain ? "NASA POWER" : "none";
  const item = (k, label) => `<span class="lg"><i class="k ${k}"></i>${label}</span>`;
  $("#pulse-sub").innerHTML = item("k-water", "Open water, km²") + item("k-flood", "Flooded vegetation, km²") + item("k-rain", `Daily rain (${src})`) + item("k-gap", "NISAR data gap")
    + (M.dates.some((d) => d.wind_roughened) ? `<span class="lg"><i class="k k-flag">wind</i>lake roughened by wind</span>` : "")
    + (M.dates.some((d) => d.rain_affected) ? `<span class="lg"><i class="k k-flag">rain</i>heavy rain before the pass</span>` : "");
  pulse.setData(z.series, rain);
}

// ------------------------------------------------------------------ play and listen
function soundValues(i) {
  const z = M.zones[state.zone].series;
  const maxW = Math.max(1, ...z.filter(Boolean).map((s) => s.water_km2));
  const maxF = Math.max(1, ...z.filter(Boolean).map((s) => s.flooded_veg_km2));
  const rain = M.rain?.series?.[state.zone] || M.rain?.series?.all || {};
  const t = Date.parse(dateOf(i) + "T00:00:00Z");
  let r12 = 0;
  for (const [d, mm] of Object.entries(rain)) { const dt = (t - Date.parse(d + "T00:00:00Z")) / 864e5; if (dt >= 0 && dt < 12) r12 += mm; }
  const s = z[i];
  return { water: s ? s.water_km2 / maxW : 0, flood: s ? s.flooded_veg_km2 / maxF : 0, rain: r12 / 80 };
}

function togglePlay(force) {
  const on = force ?? !state.playing;
  if (!on) {
    clearInterval(state.playing);
    state.playing = null;
    $("#play").setAttribute("aria-pressed", "false");
    return;
  }
  if (state.playing) return;
  if (!layerDef(state.layer).dated || state.layer === "gibs" || state.layer === "change") { state.layer = "radar"; syncControls(); }
  $("#play").setAttribute("aria-pressed", "true");
  const step = async () => {
    state.index = (state.index + 1) % M.dates.length;
    if (state.sound) sonifier.note(soundValues(state.index));
    await render();
  };
  if (state.sound) sonifier.note(soundValues(state.index));
  state.playing = setInterval(step, 1100);
}

async function toggleListen() {
  state.sound = !state.sound;
  $("#listen").setAttribute("aria-pressed", String(state.sound));
  if (state.sound) {
    await sonifier.start();
    status("Listening: higher notes mean more open water, the second voice is flooded vegetation, the hiss is rain", 5000);
    togglePlay(true);
  } else sonifier.stop();
}

// ------------------------------------------------------------------ compare swipe and map sync
function setupSwipe() {
  const handle = $(".swipe-handle");
  const setPos = (pct) => {
    pct = Math.max(2, Math.min(98, pct));
    handle.style.left = pct + "%";
    handle.setAttribute("aria-valuenow", Math.round(pct));
    $("#map-b").style.clipPath = `inset(0 0 0 ${pct}%)`;
  };
  setPos(55);
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    const rect = $(".stage").getBoundingClientRect();
    const move = (ev) => setPos(((ev.clientX - rect.left) / rect.width) * 100);
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
  handle.addEventListener("keydown", (e) => {
    const cur = parseFloat(handle.style.left);
    if (e.key === "ArrowLeft") setPos(cur - 3);
    if (e.key === "ArrowRight") setPos(cur + 3);
  });
}

function syncMaps(a, b) {
  let lock = false;
  const sync = (from, to) => from.on("move", () => {
    if (lock) return;
    lock = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    lock = false;
  });
  sync(a, b);
  sync(b, a);
}

// ------------------------------------------------------------------ shareable links
let hashTimer;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (!M || !maps) return;
    const c = maps[0].getCenter();
    const p = new URLSearchParams({ site: state.site, mode: state.mode });
    if (state.mode === "story") p.set("ch", String(state.chapter + 1));
    else {
      p.set("layer", state.layer);
      p.set("d", dateOf(state.index));
      if (state.compare || state.layer === "change") p.set("c", state.compareWith === "optical" && state.compare ? `optical:${state.optical}` : dateOf(state.compareIndex ?? Math.max(0, state.index - 1)));
      if (state.gibsDate) p.set("g", state.gibsDate);
      if (state.zone !== "all") p.set("zone", state.zone);
      p.set("at", `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${maps[0].getZoom().toFixed(2)}`);
    }
    history.replaceState(null, "", "#" + p.toString());
  }, 300);
}

function applyHash(p) {
  if (p.get("mode") === "story" || !p.get("mode")) {
    state.chapter = Math.max(0, (+p.get("ch") || 1) - 1);
    setMode("story");
    return;
  }
  const idx = (d) => M.dates.findIndex((x) => x.date === d);
  if (p.get("layer") && layerDef(p.get("layer"))) state.layer = p.get("layer");
  if (p.get("d") && idx(p.get("d")) >= 0) state.index = idx(p.get("d"));
  const c = p.get("c");
  if (c?.startsWith("optical:")) { state.compare = true; state.compareWith = "optical"; state.optical = c.split(":")[1] in OPTICAL ? c.split(":")[1] : "modis"; }
  else if (c && idx(c) >= 0) { state.compareIndex = idx(c); state.compare = state.layer !== "change"; }
  if (p.get("g")) state.gibsDate = p.get("g");
  if (p.get("zone") && M.zones[p.get("zone")]) state.zone = p.get("zone");
  syncControls();
  updatePulseZone();
  setMode(p.get("mode") === "learn" ? "learn" : "explore");
  const at = (p.get("at") || "").split(",").map(Number);
  if (at.length === 3 && at.every(Number.isFinite)) maps[0].jumpTo({ center: [at[1], at[0]], zoom: at[2] });
  render();
}

// ------------------------------------------------------------------ static controls
function setupStaticControls() {
  $("#layer-list").innerHTML += LAYERS.map((l) => `<label class="layer-opt"><input type="radio" name="layer" value="${l.id}"${l.id === state.layer ? " checked" : ""}><span><b>${l.name}</b><small>${l.desc}</small></span></label>`).join("");
  $("#layer-list").addEventListener("change", (e) => {
    state.layer = e.target.value;
    if (state.layer === "gibs") maps[0].flyTo({ zoom: Math.min(maps[0].getZoom(), 8) });
    render();
  });
  $("#compare-toggle").addEventListener("change", (e) => {
    state.compare = e.target.checked;
    if (state.compare && state.compareIndex == null) state.compareIndex = Math.max(0, state.index - 1);
    syncControls();
    render();
  });
  document.querySelectorAll('input[name="cmpwith"]').forEach((r) => r.addEventListener("change", (e) => { state.compareWith = e.target.value; render(); }));
  $("#optical-src").addEventListener("change", (e) => { state.optical = e.target.value; render(); });
  $("#date-a").addEventListener("change", (e) => { state.compareIndex = +e.target.value; render(); });
  $("#date-b").addEventListener("change", (e) => { state.index = +e.target.value; render(); });
  let thrTimer;
  $("#thr").addEventListener("input", () => {
    state.thr = +$("#thr").value;
    $("#thr-out").textContent = `${$("#thr").value} dB`;
    clearTimeout(thrTimer);
    thrTimer = setTimeout(render, 120);
  });
  $("#opacity").addEventListener("input", (e) => { state.opacity = +e.target.value; render(); });
  $("#places").addEventListener("click", (e) => {
    const k = e.target.dataset.zone;
    if (!k) return;
    flyTo({ bbox: M.zone_boxes[k].bbox });
    if (M.zones[k]) { $("#zone-select").value = k; updatePulseZone(); }
  });
  $("#world-places").innerHTML = WORLD_PLACES.map((p, i) => `<button class="chip" data-i="${i}">${p.name}</button>`).join("");
  $("#world-places").addEventListener("click", (e) => {
    const p = WORLD_PLACES[e.target.dataset.i];
    if (!p) return;
    state.layer = "gibs";
    syncControls();
    render();
    maps[0].flyTo({ center: p.center, zoom: p.zoom, duration: 2000 });
  });
  $("#find-passes").addEventListener("click", async () => {
    const c = maps[0].getCenter();
    if (state.layer !== "gibs") { state.layer = "gibs"; syncControls(); render(); }
    $("#pass-list").innerHTML = `<p class="hint">Searching the ASF archive...</p>`;
    try {
      const passes = await findPasses(c.lng, c.lat);
      $("#pass-list").innerHTML = passes.length
        ? passes.slice(0, 30).map((p) => `<button class="chip" data-d="${p.date}" title="Track ${p.track}, frame ${p.frame}, ${String(p.dir).toLowerCase()}">${niceDate(p.date)}</button>`).join("")
        : `<p class="hint">No NISAR GCOV passes found at this point yet.</p>`;
    } catch (err) {
      $("#pass-list").innerHTML = `<p class="hint">Could not reach the ASF search service: ${err.message}</p>`;
    }
  });
  $("#pass-list").addEventListener("click", (e) => {
    const d = e.target.dataset.d;
    if (!d) return;
    state.gibsDate = d;
    render();
  });
  $("#zone-select").addEventListener("change", updatePulseZone);
  $("#site-select").addEventListener("change", async (e) => {
    togglePlay(false);
    await loadSite(e.target.value);
    setMode("story");
  });
  $("#share").addEventListener("click", async () => {
    writeHash();
    await new Promise((r) => setTimeout(r, 350));
    try { await navigator.clipboard.writeText(location.href); status("Link to this view copied"); }
    catch { status("Copy this page's address to share the view", 4000); }
  });
  $("#measure").addEventListener("click", () => setMeasuring(!state.measuring));
  $("#csv-zone").addEventListener("click", () => {
    const rows = zoneRows(M, state.zone);
    download(`terrapulse_${state.site}_${state.zone}.csv`, toCSV(rows, Object.keys(rows[0])));
  });
  $("#insp-csv").addEventListener("click", () => {
    if (!lastArea) return;
    const b = lastArea.box;
    const rows = lastArea.rows.map((r) => ({ site: state.site, west: b[0].toFixed(4), south: b[1].toFixed(4), east: b[2].toFixed(4), north: b[3].toFixed(4), box_km2: lastArea.areaKm2, ...r }));
    download(`terrapulse_${state.site}_area.csv`, toCSV(rows, Object.keys(rows[0])));
  });
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#prev-ch").addEventListener("click", () => showChapter(state.chapter - 1));
  $("#next-ch").addEventListener("click", () => (state.chapter === story.length - 1 ? setMode("explore") : showChapter(state.chapter + 1)));
  $("#story-progress").addEventListener("click", (e) => {
    const i = [...e.currentTarget.children].indexOf(e.target);
    if (i >= 0) showChapter(i);
  });
  $("#sheet-toggle").addEventListener("click", () => setSheet($("#panel").classList.contains("collapsed")));
  $("#legend-btn").addEventListener("click", () => {
    const open = !$("#pulse-sub").classList.contains("open");
    $("#pulse-sub").classList.toggle("open", open);
    $("#legend-btn").setAttribute("aria-expanded", String(open));
  });
  const welcome = $("#welcome");
  const remember = () => { try { localStorage.setItem("terrapulse-welcomed", "1"); } catch { /* storage blocked */ } };
  const closeWelcome = () => { welcome.close(); remember(); };
  $("#help").addEventListener("click", () => welcome.showModal());
  $("#welcome-close").addEventListener("click", closeWelcome);
  $("#welcome-story").addEventListener("click", () => { closeWelcome(); state.chapter = 0; setMode("story"); });
  $("#welcome-explore").addEventListener("click", () => { closeWelcome(); setMode("explore"); render(); });
  welcome.addEventListener("cancel", remember);
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, [role=slider], dialog")) return;
    if (e.key === "Escape" && !$("#inspector").hidden) $("#close-inspector").click();
    if (state.mode !== "story" || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); $("#next-ch").click(); }
    if (e.key === "ArrowLeft" && state.chapter > 0) { e.preventDefault(); showChapter(state.chapter - 1); }
  });
  $("#close-inspector").addEventListener("click", () => {
    $("#inspector").hidden = true;
    maps[0].getSource("area")?.setData({ type: "FeatureCollection", features: [] });
  });
  $("#play").addEventListener("click", () => togglePlay());
  $("#listen").addEventListener("click", toggleListen);
  setupSwipe();
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    SITES = (await (await fetch("data/sites.json")).json()).sites;
  } catch {
    SITES = [{ key: "lower-indus", name: "Lower Indus, Sindh", country: "Pakistan" }];
  }
  const SHORT = { "lower-indus": "Lower Indus", "amazon-manaus": "Manaus" };
  $("#site-select").innerHTML = SITES.map((s) => `<option value="${s.key}" title="${s.name}, ${s.country}">${isPhone() ? SHORT[s.key] || s.name.split(",")[0] : `${s.name}, ${s.country}`}</option>`).join("");
  maps = [makeMap("map"), makeMap("map-b")];
  syncMaps(maps[0], maps[1]);
  maps[0].addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  maps[0].on("moveend", writeHash);
  for (const map of maps) map.on("click", (e) => { if (!state.measuring && layerDef(state.layer).scope === "site") inspect(e.lngLat); });
  pulse = new Pulse($("#pulse-svg"), {
    dates: [{ date: "2026-01-01" }], gap: [],
    onSelect: (i) => { state.index = i; state.gibsDate = null; syncControls(); render(); },
  });
  setupStaticControls();
  setupMeasureEvents();

  const hash = new URLSearchParams(location.hash.slice(1));
  try {
    await loadSite(hash.get("site") || SITES[0].key, { keepView: !!hash.get("at") });
  } catch (e) {
    console.error(e);
    status("Data not found. Run the TerraPulse pipeline to create web/data first.", 0);
    return;
  }
  applyHash(hash);
  let welcomed = false;
  try { welcomed = !!localStorage.getItem("terrapulse-welcomed"); } catch { /* storage blocked */ }
  if (!welcomed && !location.hash.includes("mode=") && !navigator.webdriver) $("#welcome").showModal();
  // Hook for automated screenshots and debugging from the console.
  window.terrapulse = { state, render, showChapter, setMode, loadSite, analyseArea, inspect: (lng, lat) => inspect({ lng, lat }), maps, get M() { return M; } };
}

boot();
