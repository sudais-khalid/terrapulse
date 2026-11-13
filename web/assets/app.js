import { LAYERS, RAMPS, WORLD_PLACES, LEARN_HTML, buildStory } from "./content.js";
import { radarColour, waterLive, changeMap, ramp, cssGradient, CHANGE_CLASSES, dbOf } from "./raster.js";
import { Pulse } from "./pulse.js";

const SITE = "lower-indus";
const DATA = `data/${SITE}/`;
const GIBS = (date) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NISAR_L2_Geocoded_Polarimetric_Covariance/default/${date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;
const COLOURS = { water: [74, 157, 248, 235], flood: [196, 90, 216, 225] };
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const $ = (s) => document.querySelector(s);
const state = { mode: "story", layer: "radar", index: 0, compare: false, compareIndex: null, thr: null, opacity: 0.9, chapter: 0, playing: null };
let M, maps, pulse, story, stackData, renderToken = 0;

// ------------------------------------------------------------------ helpers
function status(msg, ms = 2200) {
  const s = $("#status");
  s.textContent = msg;
  s.classList.add("show");
  clearTimeout(status.t);
  if (ms) status.t = setTimeout(() => s.classList.remove("show"), ms);
}
const fileFor = (date, kind) => `${DATA}dates/${date}_${kind}.png`;
const dateOf = (i) => M.dates[i].date;
const niceDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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

function makeMap(container, interactive = true) {
  const map = new maplibregl.Map({
    container, style: baseStyle(), bounds: [[M.site.bbox[0], M.site.bbox[1]], [M.site.bbox[2], M.site.bbox[3]]],
    fitBoundsOptions: { padding: 40 }, attributionControl: { compact: true }, interactive, maxZoom: 15,
  });
  let ready;
  map.ready = new Promise((ok) => (ready = ok));
  map.on("load", () => {
    map.addSource("site", { type: "image", url: BLANK, coordinates: M.image.corners });
    map.addLayer({ id: "site", type: "raster", source: "site", paint: { "raster-opacity": state.opacity, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, "labels");
    map.addSource("gibs", { type: "raster", tiles: [GIBS(dateOf(0))], tileSize: 256, maxzoom: 13, attribution: "NISAR mosaics: NASA GIBS" });
    map.addLayer({ id: "gibs", type: "raster", source: "gibs", layout: { visibility: "none" }, paint: { "raster-opacity": state.opacity } }, "labels");
    ready();
  });
  return map;
}

// Resolves once the style and our sources exist; does not wait for basemap tiles (slow links).
const whenLoaded = (map) => map.ready;

// ------------------------------------------------------------------ rendering
async function urlFor(layer, i, iB) {
  const q = M.db_quant;
  const d = dateOf(i);
  const thrHH = state.thr ?? M.params.water_hh_db;
  switch (layer) {
    case "radar": return radarColour(fileFor(d, "hh"), fileFor(d, "hv"), q);
    case "water":
      if (state.thr == null) return fileFor(d, "class");
      return waterLive(fileFor(d, "hh"), fileFor(d, "hv"), fileFor(d, "class"), q, thrHH, M.params.water_hv_db, COLOURS);
    case "change": {
      const a = dateOf(iB ?? Math.max(0, i - 1));
      const res = await changeMap({ hh: fileFor(a, "hh"), hv: fileFor(a, "hv") }, { hh: fileFor(d, "hh"), hv: fileFor(d, "hv") }, q, thrHH, M.params.water_hv_db);
      showChangeStats(res.counts, a, d);
      return res.url;
    }
    case "occurrence": return ramp(`${DATA}products/water_occurrence.png`, RAMPS.occurrence, { from: 1, to: 101, hideBelow: 2 });
    case "crops": return ramp(`${DATA}products/hv_range.png`, RAMPS.crops, { from: 1, to: 255 });
    case "rhythm": return `${DATA}products/rhythm.png`;
  }
  return null;
}

// Show a layer: ready-made PNGs go in by URL; computed layers (ImageData) are encoded once.
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

async function render() {
  const token = ++renderToken;
  const L = LAYERS.find((l) => l.id === state.layer);
  const world = L.scope === "world";
  for (const map of maps) {
    await whenLoaded(map);
    map.setLayoutProperty("gibs", "visibility", world ? "visible" : "none");
    map.setLayoutProperty("site", "visibility", world ? "none" : "visible");
    map.setPaintProperty("site", "raster-opacity", state.opacity);
    map.setPaintProperty("gibs", "raster-opacity", state.opacity);
  }
  const comparing = state.compare && state.layer !== "change" && L.dated;
  $(".stage").classList.toggle("comparing", comparing);
  $("#swipe").hidden = !comparing;
  const iB = state.compareIndex ?? Math.max(0, state.index - 1);

  try {
    // When comparing, the left (full) map shows the earlier compare date and the right (clipped) map the selected pass.
    const leftIndex = comparing ? iB : state.index;
    if (world) {
      maps[0].getSource("gibs").setTiles([GIBS(dateOf(leftIndex))]);
      if (comparing) maps[1].getSource("gibs").setTiles([GIBS(dateOf(state.index))]);
    } else {
      status("Drawing layer…", 0);
      const url = await urlFor(state.layer, leftIndex, state.layer === "change" ? iB : undefined);
      if (token !== renderToken) return;
      await setSite(maps[0], url);
      if (comparing) {
        const urlB = await urlFor(state.layer, state.index);
        if (token !== renderToken) return;
        await setSite(maps[1], urlB);
      }
      $("#status").classList.remove("show");
    }
  } catch (e) {
    console.error(e);
    status(`Could not draw this layer: ${e.message}`, 6000);
  }
  updateChrome();
}

function updateChrome() {
  const L = LAYERS.find((l) => l.id === state.layer);
  const d = M.dates[state.index];
  const iB = state.compareIndex ?? Math.max(0, state.index - 1);
  const showsDate = L.dated;
  $("#date-chip").hidden = !showsDate;
  if (showsDate) {
    const extra = d.maturity === "VALIDATED" ? " · validated" : "";
    $("#date-chip").innerHTML = state.layer === "change"
      ? `${niceDate(dateOf(iB))} <b>→</b> ${niceDate(d.date)}`
      : `<b>${niceDate(d.date)}</b> · pass ${state.index + 1} of ${M.dates.length}${extra}`;
  }
  $("#swipe-tag-a").textContent = niceDate(dateOf(iB));
  $("#swipe-tag-b").textContent = niceDate(dateOf(state.index));
  pulse.setIndex(state.index, state.layer === "change" || state.compare ? iB : null);
  $("#threshold-block").hidden = !L.threshold;
  renderLegend();
}

function renderLegend() {
  const box = $("#layer-legend");
  const p = M.params;
  const sw = (c, label, extra = "") => `<div class="sw"><i style="background:${Array.isArray(c) ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : c}"></i>${label}${extra}</div>`;
  switch (state.layer) {
    case "radar":
      box.innerHTML = `<div class="swatches">${sw("#3fbf4f", "Vegetation (strong HV)")}${sw("#e8c8e8", "Towns, trunks (strong HH and HV)")}${sw("#b03aa8", "Double bounce, wet stems (strong HH)")}${sw("#111", "Calm water, smooth soil")}</div>`;
      break;
    case "water":
      box.innerHTML = `<div class="swatches">${sw(COLOURS.water, "Open water")}${sw(COLOURS.flood, "Flooded vegetation (likely)")}</div>`;
      break;
    case "change":
      box.innerHTML = `<div class="swatches">${CHANGE_CLASSES.map((c) => sw(c.color, c.label, `<em id="chg-${c.key}"></em>`)).join("")}</div>`;
      break;
    case "occurrence":
      box.innerHTML = `<div class="ramp" style="background:${cssGradient(RAMPS.occurrence)}"></div><div class="ramp-labels"><span>never</span><span>half the year</span><span>always</span></div>`;
      break;
    case "crops":
      box.innerHTML = `<div class="ramp" style="background:${cssGradient(RAMPS.crops)}"></div><div class="ramp-labels"><span>steady</span><span>7 dB</span><span>15 dB swing</span></div>`;
      break;
    case "rhythm":
      box.innerHTML = `<div class="swatches">${M.rhythm_classes.map((c) => sw(c.color, c.label, `<em>${c.dance}</em>`)).join("")}</div>`;
      break;
    case "gibs":
      box.innerHTML = `<p>NASA's false colour: <span style="color:#3fbf4f">green</span> vegetation, <span style="color:#f0b04a">orange and yellow</span> towns and sparse land, <span style="color:#4a9df8">blue</span> calm water and dry sand. Each day shows only that day's passes; NISAR revisits every 12 days.</p>
        <div class="compare-dates"><label>Day <input type="date" id="gibs-date" min="2025-10-29" value="${dateOf(state.index)}"></label></div>`;
      $("#gibs-date").addEventListener("change", (e) => {
        for (const map of maps) map.getSource("gibs").setTiles([GIBS(e.target.value)]);
        $("#date-chip").innerHTML = `<b>${niceDate(e.target.value)}</b> · NASA GIBS`;
      });
      break;
  }
}

function showChangeStats(counts, a, b) {
  const cell = (M.image.res_m / 1000) ** 2;
  requestAnimationFrame(() => {
    for (const c of CHANGE_CLASSES) {
      const e = document.getElementById(`chg-${c.key}`);
      if (e) e.textContent = `${Math.round(counts[c.key] * cell * 1.0).toLocaleString("en-GB")} km²`;
    }
  });
}

// ------------------------------------------------------------------ pixel history
async function loadStack() {
  if (!stackData) {
    const res = await fetch(DATA + M.stack.file);
    stackData = new Uint8Array(await res.arrayBuffer());
  }
  return stackData;
}

function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)); }

async function inspect(lngLat) {
  const [[w, n], [e], , [, s]] = [M.image.corners[0], M.image.corners[1], M.image.corners[2], M.image.corners[3]];
  const fx = (lngLat.lng - w) / (e - w);
  const fy = (mercY(n) - mercY(lngLat.lat)) / (mercY(n) - mercY(s));
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return;
  const { width: sw, height: sh, factor } = M.stack;
  const col = Math.floor((fx * M.image.width) / factor), row = Math.floor((fy * M.image.height) / factor);
  if (col >= sw || row >= sh) return;
  const st = await loadStack();
  const T = M.dates.length;
  const hh = [], hv = [];
  for (let t = 0; t < T; t++) {
    const a = st[((t * 2 + 0) * sh + row) * sw + col], b = st[((t * 2 + 1) * sh + row) * sw + col];
    hh.push(a ? dbOf(a, M.db_quant) : null);
    hv.push(b ? dbOf(b, M.db_quant) : null);
  }
  drawInspector(lngLat, hh, hv);
}

function drawInspector(lngLat, hh, hv) {
  const box = $("#inspector");
  box.hidden = false;
  $("#insp-coords").textContent = `${lngLat.lat.toFixed(4)}° N, ${lngLat.lng.toFixed(4)}° E · about ${M.image.res_m * M.stack.factor} m cell`;
  const svg = $("#insp-chart");
  const W = svg.clientWidth || 330, H = 170, pad = { l: 46, r: 8, t: 10, b: 20 };
  const vals = [...hh, ...hv].filter((v) => v != null);
  if (!vals.length) { svg.innerHTML = ""; $("#insp-read").textContent = "No radar data at this spot."; return; }
  const lo = Math.floor(Math.min(...vals, M.params.water_hh_db) - 2), hi = Math.ceil(Math.max(...vals) + 2);
  const times = M.dates.map((d) => Date.parse(d.date));
  const x = (t) => pad.l + ((t - times[0]) / (times[times.length - 1] - times[0])) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (arr) => arr.map((v, i) => (v == null ? null : `${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" L");
  let g = `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(M.params.water_hh_db)}" y2="${y(M.params.water_hh_db)}" stroke="#4a9df8" stroke-dasharray="3 3" opacity=".7"/>`;
  g += `<text x="${W - pad.r}" y="${y(M.params.water_hh_db) - 4}" text-anchor="end" class="axis" fill="#4a9df8" font-family="Martian Mono" font-size="9">water threshold</text>`;
  for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) g += `<text x="2" y="${y(v) + 3}" fill="#6f7697" font-family="Martian Mono" font-size="9">${v} dB</text><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#1c2650"/>`;
  g += `<line x1="${x(times[state.index])}" x2="${x(times[state.index])}" y1="${pad.t}" y2="${H - pad.b}" stroke="#d0563f"/>`;
  g += `<path d="M${line(hv)}" fill="none" stroke="#8cc265" stroke-width="1.8"/><path d="M${line(hh)}" fill="none" stroke="#ece6d6" stroke-width="1.8"/>`;
  hh.forEach((v, i) => { if (v != null && v < M.params.water_hh_db && hv[i] != null && hv[i] < M.params.water_hv_db) g += `<circle cx="${x(times[i])}" cy="${y(v)}" r="3.5" fill="#4a9df8"/>`; });
  g += `<text x="${pad.l}" y="${H - 5}" fill="#6f7697" font-family="Martian Mono" font-size="9">${niceDate(M.dates[0].date)}</text><text x="${W - pad.r}" y="${H - 5}" text-anchor="end" fill="#6f7697" font-family="Martian Mono" font-size="9">${niceDate(M.dates[M.dates.length - 1].date)}</text>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = g;
  const wet = hh.filter((v, i) => v != null && v < M.params.water_hh_db && hv[i] != null && hv[i] < M.params.water_hv_db).length;
  const n = hh.filter((v) => v != null).length;
  const hvv = hv.filter((v) => v != null);
  const swing = hvv.length ? Math.max(...hvv) - Math.min(...hvv) : 0;
  const read = [];
  read.push(`<span style="color:#ece6d6">HH</span> and <span style="color:#8cc265">HV</span> over ${n} passes.`);
  read.push(wet === 0 ? "Never open water." : wet >= n * 0.8 ? `Open water on ${wet} of ${n} passes: a permanent water body.` : `Open water on ${wet} of ${n} passes.`);
  if (swing >= 7) read.push(`HV swung ${swing.toFixed(0)} dB, a strong growth and harvest cycle.`);
  $("#insp-read").innerHTML = read.join(" ");
}

// ------------------------------------------------------------------ modes, story, controls
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.dataset.pane !== mode));
  if (mode === "story") showChapter(state.chapter);
}

function flyTo(view) {
  if (view.bbox) maps[0].fitBounds([[view.bbox[0], view.bbox[1]], [view.bbox[2], view.bbox[3]]], { padding: { top: 30, bottom: 30, left: window.innerWidth > 760 ? 380 : 30, right: 30 }, duration: 1600 });
  else maps[0].flyTo({ center: view.center, zoom: view.zoom, duration: 1600 });
}

function showChapter(i) {
  state.chapter = Math.max(0, Math.min(story.length - 1, i));
  const c = story[state.chapter];
  $("#chapter").innerHTML = `<div class="kicker">${c.kicker}</div><h2>${c.title}</h2>${c.body}`;
  document.querySelectorAll("#story-progress button").forEach((b, k) => {
    b.toggleAttribute("aria-current", k === state.chapter);
    if (k === state.chapter) b.setAttribute("aria-current", "step");
    b.classList.toggle("seen", k < state.chapter);
  });
  $("#prev-ch").disabled = state.chapter === 0;
  $("#next-ch").textContent = state.chapter === story.length - 1 ? "Explore the map" : "Next";
  state.layer = c.layer;
  if (c.date) state.index = Math.max(0, M.dates.findIndex((d) => d.date === c.date));
  state.compareIndex = c.compare ? M.dates.findIndex((d) => d.date === c.compare) : null;
  state.compare = !!c.compare;
  syncLayerRadios();
  flyTo(c.view);
  render();
}

function syncLayerRadios() {
  const r = document.querySelector(`input[name="layer"][value="${state.layer}"]`);
  if (r) r.checked = true;
  $("#compare-toggle").checked = state.compare;
  $("#compare-dates").hidden = !state.compare;
  if (state.compareIndex != null) $("#date-a").value = String(state.compareIndex);
  $("#date-b").value = String(state.index);
}

function buildControls() {
  $("#layer-list").innerHTML += LAYERS.map((l) => `<label class="layer-opt"><input type="radio" name="layer" value="${l.id}"${l.id === state.layer ? " checked" : ""}><span><b>${l.name}</b><small>${l.desc}</small></span></label>`).join("");
  $("#layer-list").addEventListener("change", (e) => {
    state.layer = e.target.value;
    if (state.layer === "gibs") maps[0].flyTo({ zoom: Math.min(maps[0].getZoom(), 8) });
    render();
  });
  const opts = M.dates.map((d, i) => `<option value="${i}">${d.date}${d.maturity === "VALIDATED" ? " (validated)" : ""}</option>`).join("");
  $("#date-a").innerHTML = opts;
  $("#date-b").innerHTML = opts;
  $("#compare-toggle").addEventListener("change", (e) => {
    state.compare = e.target.checked;
    $("#compare-dates").hidden = !state.compare;
    if (state.compare && state.compareIndex == null) state.compareIndex = Math.max(0, state.index - 1);
    syncLayerRadios();
    render();
  });
  $("#date-a").addEventListener("change", (e) => { state.compareIndex = +e.target.value; render(); });
  $("#date-b").addEventListener("change", (e) => { state.index = +e.target.value; render(); });
  const thr = $("#thr");
  thr.value = M.params.water_hh_db;
  $("#thr-out").textContent = `${M.params.water_hh_db} dB`;
  let thrTimer;
  thr.addEventListener("input", () => {
    state.thr = +thr.value;
    $("#thr-out").textContent = `${thr.value} dB`;
    clearTimeout(thrTimer);
    thrTimer = setTimeout(render, 120);
  });
  $("#opacity").addEventListener("input", (e) => { state.opacity = +e.target.value; render(); });

  const zoneChip = (key, z) => `<button class="chip" data-zone="${key}">${z.name}</button>`;
  $("#places").innerHTML = Object.entries(M.zone_boxes).map(([k, z]) => zoneChip(k, z)).join("");
  $("#places").addEventListener("click", (e) => {
    const k = e.target.dataset.zone;
    if (!k) return;
    flyTo({ bbox: M.zone_boxes[k].bbox });
    $("#zone-select").value = k;
    updatePulseZone();
  });
  $("#world-places").innerHTML = WORLD_PLACES.map((p, i) => `<button class="chip" data-i="${i}">${p.name}</button>`).join("");
  $("#world-places").addEventListener("click", (e) => {
    const p = WORLD_PLACES[e.target.dataset.i];
    if (!p) return;
    state.layer = "gibs";
    syncLayerRadios();
    render();
    maps[0].flyTo({ center: p.center, zoom: p.zoom, duration: 2000 });
  });

  $("#zone-select").innerHTML = Object.entries(M.zones).map(([k, z]) => `<option value="${k}">${z.name}</option>`).join("");
  $("#zone-select").addEventListener("change", updatePulseZone);

  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#prev-ch").addEventListener("click", () => showChapter(state.chapter - 1));
  $("#next-ch").addEventListener("click", () => (state.chapter === story.length - 1 ? setMode("explore") : showChapter(state.chapter + 1)));
  $("#story-progress").innerHTML = story.map((c, i) => `<button aria-label="Chapter ${i + 1}: ${c.title}"></button>`).join("");
  $("#story-progress").addEventListener("click", (e) => {
    const i = [...e.currentTarget.children].indexOf(e.target);
    if (i >= 0) showChapter(i);
  });
  $("#learn").innerHTML = LEARN_HTML;
  $("#close-inspector").addEventListener("click", () => ($("#inspector").hidden = true));

  $("#play").addEventListener("click", togglePlay);
  setupSwipe();
}

function updatePulseZone() {
  const k = $("#zone-select").value;
  const z = M.zones[k];
  $("#pulse-title").textContent = `Open water, ${z.name.toLowerCase().startsWith("whole") ? "whole study area" : z.name}`;
  const rain = M.rain?.series?.[k] || M.rain?.series?.all || null;
  $("#pulse-sub").textContent = `blue: open water km² · dashed purple: flooded vegetation · bars: daily rain (NASA POWER) · hatched: NISAR data gap`;
  pulse.setData(z.series, rain);
}

function togglePlay() {
  const btn = $("#play");
  if (state.playing) {
    clearInterval(state.playing);
    state.playing = null;
    btn.setAttribute("aria-pressed", "false");
    return;
  }
  if (!LAYERS.find((l) => l.id === state.layer).dated || state.layer === "gibs") { state.layer = "radar"; syncLayerRadios(); }
  btn.setAttribute("aria-pressed", "true");
  const step = async () => {
    state.index = (state.index + 1) % M.dates.length;
    await render();
  };
  state.playing = setInterval(step, 1100);
}

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

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    M = await (await fetch(DATA + "manifest.json")).json();
  } catch (e) {
    status("Data not found. Run the TerraPulse pipeline to create web/data first.", 0);
    return;
  }
  // Map A fills the stage. Map B sits on top, clipped to the right of the divider, and is only shown when comparing.
  maps = [makeMap("map"), makeMap("map-b")];
  syncMaps(maps[0], maps[1]);
  maps[0].addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  maps[0].on("click", (e) => { if (LAYERS.find((l) => l.id === state.layer).scope === "site") inspect(e.lngLat); });
  maps[1].on("click", (e) => { if (LAYERS.find((l) => l.id === state.layer).scope === "site") inspect(e.lngLat); });

  pulse = new Pulse($("#pulse-svg"), {
    dates: M.dates, gap: M.data_gap,
    onSelect: (i) => { state.index = i; syncLayerRadios(); render(); },
  });
  story = buildStory(M);
  buildControls();
  updatePulseZone();
  setMode("story");
  // Small hook for automated screenshots and debugging from the console.
  window.terrapulse = { state, render, showChapter, setMode, inspect: (lng, lat) => inspect({ lng, lat }), maps };
}

boot();
