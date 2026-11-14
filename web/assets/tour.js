// Guided spotlight tour: dims the page, cuts a spotlight around the real control and explains it.
// Steps whose target is hidden at the current screen size are skipped automatically.

const $ = (s) => document.querySelector(s);
const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
};

export function createTour(app) {
  const steps = [
    { title: "Welcome aboard", text: "A one-minute tour of TerraPulse. Use <b>Next</b> and <b>Back</b>, or the arrow keys. <b>Skip</b> or Escape ends it any time.", icon: "i-satellite" },
    { target: ".brand", title: "NISAR, the radar satellite", text: "Every 12 days the NASA-ISRO NISAR satellite maps the ground with its own microwaves, day or night, through cloud. Everything here comes from its L-band radar." },
    { target: ".modes", title: "Three ways in", text: "<b>Story</b> walks you through what the radar saw. <b>Explore</b> lets you work with the data yourself. <b>How it works</b> explains the science and the sources." },
    { target: ".site-pick", title: "Choose a place", text: "Switch between the lower Indus in Sindh, Pakistan and the Amazon at Manaus, Brazil." },
    { target: "#panel", mode: "story", title: "The story panel", text: "Each chapter moves the map to the right place and date and explains what changed. The numbers are computed from the radar data as the page loads." },
    { target: "#next-ch", mode: "story", title: "Next chapter", text: "Tap <b>Next</b> to move on, <b>Back</b> to return. The bar at the top shows where you are; tap any segment to jump." },
    { target: ".stage", title: "The map", text: "Drag to move, pinch or scroll to zoom. Tap or click any spot to see its radar history over the whole year." },
    { target: "#pulse-svg", title: "The pulse of the year", text: "Open water (blue line), water under crops and reeds (dashed purple) and daily rain (bars) for every pass. Tap any date to show that pass on the map." },
    { target: "#play", title: "Play the year", text: "Press play to watch the land change pass by pass, like a time-lapse." },
    { target: "#listen", title: "Listen to it", text: "Hear the year as sound: higher notes mean more open water, a second voice follows flooded vegetation, and a soft hiss marks rain." },
    { target: "#legend-btn", title: "What the lines mean", text: "Open the legend for the chart at any time." },
    { target: "#zone-select", title: "Focus on one place", text: "Show the pulse for the whole area or for one lake, farm zone or floodplain." },
    { target: "#layer-list", mode: "explore", title: "Map layers", text: "In <b>Explore</b>, choose what the map shows: radar colour, water, what changed, how often a place was under water, and more." },
    { target: "#compare-block", mode: "explore", title: "Compare side by side", text: "Put two dates side by side, or radar next to the optical photo of the same day, then drag the divider." },
    { target: "#measure", mode: "explore", title: "Measure and download", text: "Drag a box on the map to measure its water on every pass, and download any series as CSV." },
    { target: "#help", title: "Help and sharing", text: "The help button reopens this tour any time. The link button next to it copies a link that opens exactly this view: site, layer, date and place." },
    { title: "You are ready", text: "Start with the story, or dive straight into the map.", final: true, icon: "i-activity" },
  ];

  let i = 0, active = false, live = [], raf = 0;
  const root = document.createElement("div");
  root.className = "tour";
  root.hidden = true;
  root.innerHTML = `
    <svg class="tour-shade" aria-hidden="true"><defs><mask id="tour-mask"><rect width="100%" height="100%" fill="#fff"/><rect class="tour-hole" rx="12" fill="#000"/></mask></defs>
      <rect width="100%" height="100%" fill="rgba(4,7,20,.66)" mask="url(#tour-mask)"/></svg>
    <div class="tour-ring" aria-hidden="true"></div>
    <section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1">
      <div class="tour-top"><span class="tour-step" id="tour-step"></span><button class="tour-skip" id="tour-skip">Skip tour</button></div>
      <div class="tour-icon" id="tour-icon" hidden><svg class="i"><use href="#i-satellite"/></svg></div>
      <h3 id="tour-title"></h3>
      <p id="tour-text"></p>
      <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
      <div class="tour-actions">
        <button class="btn ghost" id="tour-back"><svg class="i"><use href="#i-left"/></svg><span>Back</span></button>
        <button class="btn" id="tour-next"><span class="lbl">Next</span><svg class="i"><use href="#i-right"/></svg></button>
      </div>
      <div class="tour-final" id="tour-final" hidden>
        <button class="btn" id="tour-story"><svg class="i"><use href="#i-book"/></svg><span>Start the story</span></button>
        <button class="btn ghost" id="tour-explore"><svg class="i"><use href="#i-map"/></svg><span>Explore the map</span></button>
      </div>
    </section>`;
  document.body.appendChild(root);
  const card = root.querySelector(".tour-card"), hole = root.querySelector(".tour-hole"), ring = root.querySelector(".tour-ring");

  function prepare(step) {
    if (step.mode && app.mode() !== step.mode) app.setMode(step.mode);
    if (step.target && (step.target === "#panel" || step.mode)) app.openSheet();
    const el = step.target && $(step.target);
    if (el && el.closest("#panel")) el.scrollIntoView({ block: "nearest" });
  }

  function place() {
    const step = live[i];
    const el = step.target && $(step.target);
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 14;
    let r = null;
    if (el && visible(el)) {
      const b = el.getBoundingClientRect();
      r = { x: Math.max(4, b.left - pad), y: Math.max(4, b.top - pad), w: Math.min(vw - 8, b.width + pad * 2), h: Math.min(vh - 8, b.height + pad * 2) };
    }
    if (r) {
      Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h }).forEach(([k, v]) => hole.setAttribute(k, v));
      Object.assign(ring.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
      ring.hidden = false;
    } else {
      ["x", "y", "width", "height"].forEach((k) => hole.setAttribute(k, 0));
      ring.hidden = true;
    }
    // Card: below, above, right or left of the target, whichever fits; centred when there is no target.
    const cw = Math.min(360, vw - 24), ch = card.offsetHeight;
    card.style.width = cw + "px";
    let x, y;
    if (!r) { x = (vw - cw) / 2; y = (vh - ch) / 2; }
    else if (r.y + r.h + gap + ch < vh - 8) { x = r.x + r.w / 2 - cw / 2; y = r.y + r.h + gap; }
    else if (r.y - gap - ch > 8) { x = r.x + r.w / 2 - cw / 2; y = r.y - gap - ch; }
    else if (r.x + r.w + gap + cw < vw - 8) { x = r.x + r.w + gap; y = r.y + r.h / 2 - ch / 2; }
    else if (r.x - gap - cw > 8) { x = r.x - gap - cw; y = r.y + r.h / 2 - ch / 2; }
    else { x = (vw - cw) / 2; y = vh - ch - 12; } // large targets on phones: card at the bottom
    card.style.left = Math.max(12, Math.min(vw - cw - 12, x)) + "px";
    card.style.top = Math.max(12, Math.min(vh - ch - 12, y)) + "px";
  }

  function show(k) {
    i = Math.max(0, Math.min(live.length - 1, k));
    const step = live[i];
    prepare(step);
    root.querySelector("#tour-title").textContent = step.title;
    root.querySelector("#tour-text").innerHTML = step.text;
    root.querySelector("#tour-step").textContent = `Step ${i + 1} of ${live.length}`;
    root.querySelector("#tour-dots").innerHTML = live.map((_, n) => `<i class="${n === i ? "on" : n < i ? "seen" : ""}"></i>`).join("");
    const icon = root.querySelector("#tour-icon");
    icon.hidden = !step.icon;
    if (step.icon) icon.querySelector("use").setAttribute("href", "#" + step.icon);
    root.querySelector("#tour-back").disabled = i === 0;
    root.querySelector("#tour-next .lbl").textContent = i === 0 ? "Start the tour" : "Next";
    root.querySelector(".tour-actions").hidden = !!step.final;
    root.querySelector("#tour-final").hidden = !step.final;
    root.querySelector("#tour-skip").hidden = !!step.final;
    card.classList.remove("in");
    void card.offsetWidth;
    card.classList.add("in");
    // Let a mode switch or sheet animation settle before measuring.
    place();
    setTimeout(place, 260);
    card.focus({ preventScroll: true });
  }

  function end(then) {
    active = false;
    root.hidden = true;
    document.body.classList.remove("touring");
    window.removeEventListener("resize", onResize);
    app.remember();
    if (then) then();
  }
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  root.querySelector("#tour-next").addEventListener("click", () => (i < live.length - 1 ? show(i + 1) : end()));
  root.querySelector("#tour-back").addEventListener("click", () => show(i - 1));
  root.querySelector("#tour-skip").addEventListener("click", () => end());
  root.querySelector("#tour-story").addEventListener("click", () => end(() => app.startStory()));
  root.querySelector("#tour-explore").addEventListener("click", () => end(() => app.startExplore()));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight" && !live[i].final) { e.preventDefault(); show(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
    else if (e.key === "Tab") { // keep focus inside the card
      const f = [...card.querySelectorAll("button:not([disabled])")].filter((b) => b.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  root.querySelector(".tour-shade").addEventListener("click", () => card.focus());

  return {
    start() {
      if (active) return;
      active = true;
      live = steps.filter((s) => !s.target || s.mode || visible($(s.target)));
      root.hidden = false;
      document.body.classList.add("touring");
      window.addEventListener("resize", onResize);
      show(0);
    },
    get active() { return active; },
  };
}
