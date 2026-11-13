// Analysis tools that run entirely in the browser: area statistics, CSV export,
// notable-change detection and a NISAR pass finder for anywhere on Earth.
import { loadRGBA } from "./raster.js";

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// Pixel rectangle in the site image for a lon/lat box.
export function pixelBox(M, w, s, e, n) {
  const [[lw, ln], [le], , [, ls]] = M.image.corners;
  const fx = (lon) => ((lon - lw) / (le - lw)) * M.image.width;
  const fy = (lat) => ((mercY(ln) - mercY(lat)) / (mercY(ln) - mercY(ls))) * M.image.height;
  const x0 = Math.max(0, Math.floor(fx(Math.min(w, e)))), x1 = Math.min(M.image.width, Math.ceil(fx(Math.max(w, e))));
  const y0 = Math.max(0, Math.floor(fy(Math.max(s, n)))), y1 = Math.min(M.image.height, Math.ceil(fy(Math.min(s, n))));
  return x1 > x0 && y1 > y0 ? { x0, x1, y0, y1 } : null;
}

// Classify a class-map pixel by its palette colour.
function kind(r, g, b, a) {
  if (a === 0) return 0;                                                   // land (transparent) or outside
  if (Math.abs(r - 138) < 10 && Math.abs(g - 144) < 10 && Math.abs(b - 168) < 10) return 4; // no data
  if (b > 170 && r < 90) return 2;                                         // open water
  if (r > 140 && b > 170 && g < 130) return 3;                             // flooded vegetation
  return 0;
}

// Water and flooded vegetation per pass inside a lon/lat box, scaled for masked swath gaps.
export async function areaSeries(M, fileFor, box, onProgress) {
  const pb = pixelBox(M, ...box);
  if (!pb) return null;
  const latC = (box[1] + box[3]) / 2;
  const pxKm2 = ((M.image.mercator_res_m * Math.cos((latC * Math.PI) / 180)) / 1000) ** 2;
  const total = (pb.x1 - pb.x0) * (pb.y1 - pb.y0);
  const rows = [];
  for (let t = 0; t < M.dates.length; t++) {
    const img = await loadRGBA(fileFor(M.dates[t].date, "class"));
    let water = 0, flood = 0, nodata = 0;
    for (let y = pb.y0; y < pb.y1; y++) {
      for (let x = pb.x0; x < pb.x1; x++) {
        const j = (y * img.w + x) * 4;
        const k = kind(img.rgba[j], img.rgba[j + 1], img.rgba[j + 2], img.rgba[j + 3]);
        if (k === 2) water++; else if (k === 3) flood++; else if (k === 4) nodata++;
      }
    }
    const valid = total - nodata;
    const scale = valid > 0.3 * total ? (total / valid) * pxKm2 : null;
    rows.push({
      date: M.dates[t].date, wind: !!M.dates[t].wind_roughened, rain: !!M.dates[t].rain_affected,
      water_km2: scale == null ? null : +(water * scale).toFixed(2),
      flooded_veg_km2: scale == null ? null : +(flood * scale).toFixed(2),
      valid_frac: +(valid / total).toFixed(3),
    });
    onProgress?.(t + 1, M.dates.length);
  }
  return { rows, areaKm2: +(total * pxKm2).toFixed(1) };
}

export function toCSV(rows, columns) {
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(name, text) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Rows for a zone: one per pass, with rain summed over the 12 days up to the pass.
export function zoneRows(M, key) {
  const z = M.zones[key];
  const rain = M.rain?.series?.[key] || M.rain?.series?.all || {};
  return M.dates.map((d, i) => {
    const s = z.series[i];
    const t = Date.parse(d.date + "T00:00:00Z");
    let r12 = 0;
    for (const [day, mm] of Object.entries(rain)) {
      const dt = (t - Date.parse(day + "T00:00:00Z")) / 86400000;
      if (dt >= 0 && dt < 12) r12 += mm;
    }
    return {
      zone: z.name, date: d.date, maturity: d.maturity, radar_mode: d.mode, wind_roughened: d.wind_roughened, rain_affected: !!d.rain_affected,
      water_km2: s?.water_km2 ?? null, flooded_veg_km2: s?.flooded_veg_km2 ?? null,
      hh_db: s?.hh_db ?? null, hv_db: s?.hv_db ?? null, valid_frac: s?.valid_frac ?? null, rain_12d_mm: +r12.toFixed(1),
    };
  });
}

// Largest changes per zone between consecutive passes in the SAME radar mode (like for like:
// modes differ in noise floor and swath gaps), skipping wind-roughened and rain-affected passes and reference areas.
export function notableChanges(M, n = 6) {
  const skip = new Set(["all", M.site.dry_ref, M.site.water_ref]);
  const events = [];
  for (const [key, z] of Object.entries(M.zones)) {
    if (skip.has(key) || z.kind === "urban") continue;
    const prevByMode = {};
    z.series.forEach((s, i) => {
      const d = M.dates[i];
      if (!s || d.wind_roughened || d.rain_affected || s.valid_frac < 0.6) return;
      const prev = prevByMode[d.mode];
      const days = prev ? (Date.parse(d.date) - Date.parse(M.dates[prev.i].date)) / 864e5 : Infinity;
      if (prev && days <= 40) {
        for (const [field, label] of [["water_km2", "open water"], ["flooded_veg_km2", "flooded vegetation"]]) {
          const delta = s[field] - prev.s[field];
          const rel = Math.abs(delta) / Math.max(z.area_km2, 1);
          if (Math.abs(delta) >= 3 && rel >= 0.02) events.push({ key, zone: z.name, field, label, from: prev.i, to: i, delta, score: Math.abs(delta) * Math.sqrt(rel) });
        }
      }
      prevByMode[d.mode] = { s, i };
    });
  }
  events.sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const e of events) {
    const k = `${e.key}:${e.field}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length === n) break;
  }
  return out;
}

// NISAR GCOV passes over a point, from the ASF Search API (CORS enabled).
export async function findPasses(lon, lat) {
  const url = "https://api.daac.asf.alaska.edu/services/search/param?" + new URLSearchParams({
    dataset: "NISAR", processingLevel: "GCOV", intersectsWith: `POINT(${lon.toFixed(4)} ${lat.toFixed(4)})`,
    maxResults: "500", output: "geojson",
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ASF search failed (${res.status})`);
  const gj = await res.json();
  const byDate = new Map();
  for (const f of gj.features || []) {
    const p = f.properties;
    const col = String(p.collectionName || p.fileID || "");
    if (col.includes("BETA")) continue;
    const d = String(p.startTime).slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, { date: d, track: p.pathNumber, frame: p.frameNumber, dir: p.flightDirection });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
