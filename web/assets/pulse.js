// The pulse strip: open water and flooded vegetation per NISAR pass, against daily rainfall.
// One tick per pass; click, drag or use arrow keys to move through time.

const NS = "http://www.w3.org/2000/svg";
const DAY = 86400000;
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export class Pulse {
  constructor(svg, { dates, gap, onSelect }) {
    this.svg = svg;
    this.dates = dates; // [{date, maturity}]
    this.times = dates.map((d) => Date.parse(d.date + "T00:00:00Z"));
    this.gap = gap.map((g) => Date.parse(g));
    this.onSelect = onSelect;
    this.index = 0;
    this.compareIndex = null;
    this.series = null;
    this.rain = null;
    new ResizeObserver(() => this.draw()).observe(svg);
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      this.pick(e);
      const move = (ev) => this.pick(ev);
      const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
    });
    svg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { this.select(Math.min(this.index + 1, this.dates.length - 1)); e.preventDefault(); }
      if (e.key === "ArrowLeft") { this.select(Math.max(this.index - 1, 0)); e.preventDefault(); }
    });
  }

  setData(series, rain) { this.series = series; this.rain = rain; this.draw(); }

  setIndex(i, compareIndex = null) { this.index = i; this.compareIndex = compareIndex; this.draw(); }

  select(i) {
    if (i === this.index) return;
    this.index = i;
    this.draw();
    this.onSelect(i);
  }

  pick(e) {
    const r = this.svg.getBoundingClientRect();
    const t = this.x2t(e.clientX - r.left);
    let best = 0;
    this.times.forEach((tt, i) => { if (Math.abs(tt - t) < Math.abs(this.times[best] - t)) best = i; });
    this.select(best);
  }

  draw() {
    const svg = this.svg;
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    const pad = { l: 8, r: 8, t: 8, b: 18 };
    const t0 = this.times[0] - 6 * DAY, t1 = this.times[this.times.length - 1] + 6 * DAY;
    this.x2t = (x) => t0 + ((x - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
    const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
    const plotH = H - pad.t - pad.b;
    const base = H - pad.b;

    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: "#151d3b" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#2b3666", "stroke-width": 3 }, pat);

    // Months
    const start = new Date(t0);
    for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); m.getTime() < t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
      const xm = x(m.getTime());
      el("line", { x1: xm, x2: xm, y1: pad.t, y2: base, stroke: "#1c2650" }, svg);
      const lab = el("text", { x: xm + 3, y: H - 5, class: "axis" }, svg);
      lab.textContent = m.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) + (m.getUTCMonth() === 0 ? " " + m.getUTCFullYear() : "");
    }

    // Instrument data gap
    if (this.gap.length === 2) {
      el("rect", { x: x(this.gap[0]), y: pad.t, width: Math.max(2, x(this.gap[1]) - x(this.gap[0])), height: plotH, class: "gap" }, svg);
    }

    // Rain bars (bottom 45%)
    if (this.rain) {
      const vals = Object.values(this.rain);
      const rmax = Math.max(20, ...vals);
      const bw = Math.max(1, (W - pad.l - pad.r) / ((t1 - t0) / DAY) - 0.5);
      for (const [d, mm] of Object.entries(this.rain)) {
        if (mm < 0.5) continue;
        const t = Date.parse(d + "T00:00:00Z");
        if (t < t0 || t > t1) continue;
        const h = (mm / rmax) * plotH * 0.45;
        el("rect", { x: x(t) - bw / 2, y: base - h, width: bw, height: h, class: "rain" }, svg);
      }
    }

    // Water and flooded vegetation lines (top 85%)
    if (this.series) {
      const w = this.series.map((s) => (s ? s.water_km2 : null));
      const f = this.series.map((s) => (s ? s.flooded_veg_km2 : null));
      const vmax = Math.max(1, ...w.filter((v) => v != null), ...f.filter((v) => v != null));
      const y = (v) => base - (v / vmax) * plotH * 0.85;
      const pts = (arr) => arr.map((v, i) => (v == null ? null : [x(this.times[i]), y(v)])).filter(Boolean);
      const wp = pts(w);
      if (wp.length > 1) {
        el("path", { d: `M${wp[0][0]},${base} L` + wp.map((p) => p.join(",")).join(" L") + ` L${wp[wp.length - 1][0]},${base} Z`, class: "water-area" }, svg);
        el("path", { d: "M" + wp.map((p) => p.join(",")).join(" L"), class: "water-line" }, svg);
      }
      const fp = pts(f);
      if (fp.length > 1) el("path", { d: "M" + fp.map((p) => p.join(",")).join(" L"), class: "flood-line" }, svg);
      wp.forEach(([px, py]) => el("circle", { cx: px, cy: py, r: 2.6, class: "dot" }, svg));
    }

    // Pass ticks; wind-roughened passes get a small marker because their water totals read low.
    this.times.forEach((t, i) => {
      el("line", { x1: x(t), x2: x(t), y1: base, y2: base + 5, class: "tick" + (this.dates[i].maturity === "VALIDATED" ? " validated" : "") }, svg);
      if (this.dates[i].wind_roughened) {
        const m = el("text", { x: x(t), y: base - 4, class: "wind-mark", "text-anchor": "middle" }, svg);
        m.textContent = "wind";
        const tip = el("title", {}, m);
        tip.textContent = "Wind-roughened water on this pass: lakes partly looked like land, so open water reads low.";
      }
    });

    // Cursors
    if (this.compareIndex != null) {
      const xb = x(this.times[this.compareIndex]);
      el("line", { x1: xb, x2: xb, y1: pad.t, y2: base, class: "cursor-b" }, svg);
    }
    const xc = x(this.times[this.index]);
    el("line", { x1: xc, x2: xc, y1: pad.t - 4, y2: base + 5, class: "cursor" }, svg);
    const lab = el("text", { x: Math.min(xc + 5, W - 52), y: pad.t + 6, class: "cursor-label" }, svg);
    lab.textContent = fmt(this.times[this.index]);
    this.svg.setAttribute("aria-valuetext", this.dates[this.index].date);
  }
}
