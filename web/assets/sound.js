// "Listen to the year": each NISAR pass becomes a note.
//   open water   -> pitch of a soft sine on a pentatonic scale (more water, higher note)
//   flooded veg  -> a fifth above, louder when more vegetation stands in water
//   rainfall     -> a short filtered-noise "rain" burst, louder after wetter days
// Pure Web Audio, no files. Starts only after a click (browser autoplay rules).

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

export class Sonifier {
  constructor() { this.ctx = null; }

  async start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  stop() { if (this.ctx && this.ctx.state === "running") this.ctx.suspend(); }

  // v: { water, flood, rain } already scaled 0..1; dur in seconds.
  note(v, dur = 0.9) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const step = SCALE[Math.round(Math.max(0, Math.min(1, v.water)) * (SCALE.length - 1))];
    const f = 196 * 2 ** (step / 12);
    this._tone(f, "sine", 0.32, t, dur);
    if (v.flood > 0.02) this._tone(f * 1.5, "triangle", 0.05 + 0.22 * Math.min(1, v.flood), t + 0.08, dur * 0.8);
    if (v.rain > 0.02) this._rain(Math.min(1, v.rain), t, dur * 0.6);
  }

  _tone(freq, type, peak, t, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _rain(level, t, dur) {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    f.type = "bandpass";
    f.frequency.value = 2500;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
