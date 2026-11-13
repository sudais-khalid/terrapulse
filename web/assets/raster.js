// Decode TerraPulse 8-bit layers in the browser and colourise them.
// Gray PNGs hold quantised dB: value 0 = no data, else dB = min + (v - 1) * step.

const cache = new Map();

export function loadGray(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const v = new Uint8Array(bmp.width * bmp.height);
      for (let i = 0, j = 0; i < v.length; i++, j += 4) v[i] = rgba[j];
      return { w: bmp.width, h: bmp.height, v };
    })());
  }
  return cache.get(url);
}

export function loadRGBA(url) {
  const key = "rgba:" + url;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, rgba: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
    })());
  }
  return cache.get(key);
}

export const dbOf = (q, quant) => quant.min + (q - 1) * quant.step;
export const qOf = (db, quant) => Math.max(1, Math.min(255, Math.round((db - quant.min) / quant.step) + 1));

// Layers are returned as ImageData (or ImageBitmap for ready-made palette PNGs) and painted
// straight into the map's canvas source, so nothing is re-encoded.
function toUrl(w, h, rgba) {
  return new ImageData(rgba, w, h);
}

export function loadBitmap(url) {
  const key = "bmp:" + url;
  if (!cache.has(key)) {
    cache.set(key, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
      return r.blob();
    }).then((b) => createImageBitmap(b, { colorSpaceConversion: "none", premultiplyAlpha: "none" })));
  }
  return cache.get(key);
}

function stretch(q, quant, lo, hi, gamma = 1) {
  const t = (dbOf(q, quant) - lo) / (hi - lo);
  return 255 * Math.pow(Math.min(1, Math.max(0, t)), gamma);
}

// Dual-pol false colour in the NASA GIBS convention: HH in red and blue, HV in green.
export async function radarColour(hhUrl, hvUrl, quant) {
  const [hh, hv] = await Promise.all([loadGray(hhUrl), loadGray(hvUrl)]);
  const out = new Uint8ClampedArray(hh.w * hh.h * 4);
  for (let i = 0, j = 0; i < hh.v.length; i++, j += 4) {
    const a = hh.v[i], b = hv.v[i];
    if (!a || !b) continue;
    const r = stretch(a, quant, -24, 0, 0.9);
    out[j] = r; out[j + 1] = stretch(b, quant, -31, -9, 0.9); out[j + 2] = r; out[j + 3] = 255;
  }
  return toUrl(hh.w, hh.h, out);
}

// Open water from a live HH threshold (HV threshold fixed from the pipeline), plus flooded vegetation from the class map.
export async function waterLive(hhUrl, hvUrl, classUrl, quant, thrHH, thrHV, colours) {
  const [hh, hv, cls] = await Promise.all([loadGray(hhUrl), loadGray(hvUrl), loadRGBA(classUrl)]);
  const qh = qOf(thrHH, quant), qv = qOf(thrHV, quant);
  const out = new Uint8ClampedArray(hh.w * hh.h * 4);
  for (let i = 0, j = 0; i < hh.v.length; i++, j += 4) {
    const a = hh.v[i], b = hv.v[i];
    if (!a || !b) continue;
    if (a < qh && b < qv) { out.set(colours.water, j); continue; }
    const r = cls.rgba[j], g = cls.rgba[j + 1], bl = cls.rgba[j + 2], al = cls.rgba[j + 3];
    if (al > 0 && r > 140 && bl > 140 && g < 120) out.set(colours.flood, j);
  }
  return toUrl(hh.w, hh.h, out);
}

// Change from date A to date B, classified by what the radar physics suggests.
export const CHANGE_CLASSES = [
  { key: "newwater", label: "Became open water", color: [74, 157, 248, 235] },
  { key: "drained", label: "Water receded", color: [240, 176, 74, 235] },
  { key: "wetter", label: "Brighter in HH: flooded vegetation or wetter ground", color: [196, 90, 216, 220] },
  { key: "greener", label: "More vegetation (HV up)", color: [140, 194, 101, 210] },
  { key: "cleared", label: "Less vegetation (HV down): harvest or clearing", color: [208, 86, 63, 220] },
];

export async function changeMap(a, b, quant, thrHH, thrHV, minDb = 3) {
  const [ha, va, hb, vb] = await Promise.all([loadGray(a.hh), loadGray(a.hv), loadGray(b.hh), loadGray(b.hv)]);
  const qh = qOf(thrHH, quant), qv = qOf(thrHV, quant);
  const step = quant.step;
  const out = new Uint8ClampedArray(ha.w * ha.h * 4);
  const counts = { newwater: 0, drained: 0, wetter: 0, greener: 0, cleared: 0, valid: 0 };
  const C = Object.fromEntries(CHANGE_CLASSES.map((c) => [c.key, c.color]));
  for (let i = 0, j = 0; i < ha.v.length; i++, j += 4) {
    const h1 = ha.v[i], v1 = va.v[i], h2 = hb.v[i], v2 = vb.v[i];
    if (!h1 || !v1 || !h2 || !v2) continue;
    counts.valid++;
    const w1 = h1 < qh && v1 < qv, w2 = h2 < qh && v2 < qv;
    let k = null;
    if (!w1 && w2) k = "newwater";
    else if (w1 && !w2) k = "drained";
    else if (!w1 && !w2) {
      const dh = (h2 - h1) * step, dv = (v2 - v1) * step;
      if (dh >= minDb && dh - dv >= 2) k = "wetter";
      else if (dv >= minDb) k = "greener";
      else if (dv <= -minDb) k = "cleared";
    }
    if (k) { out.set(C[k], j); counts[k]++; }
  }
  return { url: toUrl(ha.w, ha.h, out), counts };
}

// Single-band colour ramps for products (value 0 = no data).
export async function ramp(url, stops, { from = 1, to = 255, hideBelow = 0 } = {}) {
  const g = await loadGray(url);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let v = 1; v < 256; v++) {
    if (v <= hideBelow) continue;
    const t = Math.min(1, Math.max(0, (v - from) / (to - from)));
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const u = (t - t0) / Math.max(t1 - t0, 1e-6);
    for (let ch = 0; ch < 4; ch++) lut[v * 4 + ch] = c0[ch] + (c1[ch] - c0[ch]) * u;
  }
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, j = 0; i < g.v.length; i++, j += 4) {
    const v = g.v[i];
    if (!v) continue;
    out[j] = lut[v * 4]; out[j + 1] = lut[v * 4 + 1]; out[j + 2] = lut[v * 4 + 2]; out[j + 3] = lut[v * 4 + 3];
  }
  return toUrl(g.w, g.h, out);
}

export function cssGradient(stops) {
  return "linear-gradient(90deg," + stops.map(([t, c]) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)}) ${Math.round(t * 100)}%`).join(",") + ")";
}
