// PPG engine: turns a stream of brightness samples into beats + BPM.
// Sources: CameraSource (fingertip over rear camera) or SimSource (desktop testing).

export class PPGEngine extends EventTarget {
  constructor() {
    super();
    this.samples = [];        // {t, v} raw
    this.beats = [];          // beat timestamps (ms)
    this.bpm = 0;
    this.quality = 0;         // 0..1
    this.source = null;
    this._peakAmpEma = 0;
    this._lastBeatT = 0;
    this._detrended = [];     // parallel to samples
    this.WINDOW_MS = 8000;
    this.BASELINE_MS = 900;   // moving-average detrend window
    this.REFRACTORY_MS = 350; // max ~170 bpm
  }

  async start(source) {
    this.stop();
    this.source = source;
    this.samples = [];
    this.beats = [];
    this._detrended = [];
    this.bpm = 0;
    this.quality = 0;
    this._peakAmpEma = 0;
    this._lastBeatT = 0;
    await source.start((t, v, fingerOk) => this._onSample(t, v, fingerOk));
  }

  stop() {
    if (this.source) { this.source.stop(); this.source = null; }
  }

  get running() { return !!this.source; }

  _onSample(t, v, fingerOk) {
    const S = this.samples;
    S.push({ t, v });
    // trim window
    while (S.length && t - S[0].t > this.WINDOW_MS) { S.shift(); this._detrended.shift(); }

    // detrend: subtract moving average over BASELINE_MS
    let sum = 0, n = 0;
    for (let i = S.length - 1; i >= 0 && t - S[i].t <= this.BASELINE_MS; i--) { sum += S[i].v; n++; }
    const d = v - sum / n;
    this._detrended.push(d);

    this.dispatchEvent(new CustomEvent('sample', { detail: { t, v, d } }));

    if (!fingerOk) {
      this._setQuality(0, 'no finger');
      return;
    }

    // peak detection on the point before last (need a following sample to confirm local max)
    const D = this._detrended;
    const len = D.length;
    if (len < 3) return;
    const i = len - 2;
    const prev = D[i - 1], cur = D[i], next = D[i + 1];
    const tCur = S[i].t;

    if (cur > prev && cur >= next && tCur - this._lastBeatT > this.REFRACTORY_MS) {
      // adaptive amplitude threshold
      const floor = this._noiseFloor();
      const thresh = this._peakAmpEma > 0
        ? Math.max(0.35 * this._peakAmpEma, floor)
        : floor;
      if (cur > thresh) {
        this._registerBeat(tCur, cur);
      }
    }
    this._updateQuality();
  }

  _noiseFloor() {
    // 2x std of detrended signal's lower half as a floor
    const D = this._detrended;
    if (D.length < 20) return Infinity;
    let mean = 0;
    for (const x of D) mean += x;
    mean /= D.length;
    let varsum = 0;
    for (const x of D) varsum += (x - mean) * (x - mean);
    const std = Math.sqrt(varsum / D.length);
    return 0.6 * std;
  }

  _registerBeat(t, amp) {
    this._lastBeatT = t;
    this.beats.push(t);
    if (this.beats.length > 40) this.beats.shift();
    this._peakAmpEma = this._peakAmpEma === 0 ? amp : 0.7 * this._peakAmpEma + 0.3 * amp;

    // BPM from median of last 5 inter-beat intervals
    const B = this.beats;
    if (B.length >= 3) {
      const ibis = [];
      for (let i = Math.max(1, B.length - 5); i < B.length; i++) ibis.push(B[i] - B[i - 1]);
      ibis.sort((a, b) => a - b);
      const med = ibis[Math.floor(ibis.length / 2)];
      const bpm = 60000 / med;
      if (bpm >= 35 && bpm <= 190) {
        this.bpm = Math.round(bpm);
        this.dispatchEvent(new CustomEvent('bpm', { detail: { bpm: this.bpm } }));
      }
    }
    this.dispatchEvent(new CustomEvent('beat', { detail: { t } }));
  }

  _updateQuality() {
    // quality: enough beats recently + consistent IBIs
    const now = this.samples.length ? this.samples[this.samples.length - 1].t : 0;
    const recent = this.beats.filter(b => now - b < 6000);
    if (recent.length < 4) { this._setQuality(Math.min(recent.length / 4, 0.4), 'acquiring…'); return; }
    const ibis = [];
    for (let i = 1; i < recent.length; i++) ibis.push(recent[i] - recent[i - 1]);
    const mean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
    let varsum = 0;
    for (const x of ibis) varsum += (x - mean) * (x - mean);
    const cv = Math.sqrt(varsum / ibis.length) / mean; // coefficient of variation
    // cv < 0.08 excellent, > 0.35 junk
    const q = Math.max(0, Math.min(1, 1 - (cv - 0.08) / 0.27));
    this._setQuality(q, q > 0.6 ? 'locked' : 'unsteady');
  }

  _setQuality(q, label) {
    this.quality = q;
    this.dispatchEvent(new CustomEvent('signal', { detail: { quality: q, label } }));
  }

  // beats within a time range — used by tasks to count actual heartbeats
  beatsBetween(t0, t1) {
    return this.beats.filter(b => b >= t0 && b <= t1);
  }
}

// ---------------- Camera source ----------------
export class CameraSource {
  constructor() {
    this.stream = null;
    this.video = null;
    this.timer = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  async start(onSample) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
    const track = this.stream.getVideoTracks()[0];
    // torch: best effort — many Android phones support it, desktop won't
    try { await track.applyConstraints({ advanced: [{ torch: true }] }); } catch (_) {}

    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();

    this.timer = setInterval(() => {
      const { ctx, canvas, video } = this;
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      const n = px.length / 4;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
      r /= n; g /= n; b /= n;
      // finger over lens (with torch or ambient light through skin): strongly red-dominant
      const fingerOk = r > 80 && r > 1.8 * g && r > 1.8 * b;
      onSample(performance.now(), r, fingerOk);
    }, 33);
  }

  stop() {
    clearInterval(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}

// ---------------- Simulated source (desktop testing / demo) ----------------
// Generates samples on a synthetic 30Hz clock and backfills any timer gap in a
// batch, so it stays correct even when the browser throttles timers.
export class SimSource {
  constructor(bpm = 62) {
    this.baseBpm = bpm;
    this.timer = null;
    this.phase = 0;
    this.t0 = 0;
    this.simT = 0;
  }

  async start(onSample) {
    const STEP = 33; // ms between synthetic samples
    this.t0 = performance.now();
    this.simT = this.t0;
    this.timer = setInterval(() => {
      const now = performance.now();
      while (this.simT <= now) {
        const t = this.simT;
        // slow bpm drift ±4
        const bpm = this.baseBpm + 4 * Math.sin((t - this.t0) / 20000);
        this.phase += (STEP / 1000) * (bpm / 60);
        // pulse waveform: sharp systolic peak + dicrotic bump, plus noise
        const p = this.phase % 1;
        const wave =
          Math.exp(-Math.pow((p - 0.15) / 0.06, 2)) * 10 +
          Math.exp(-Math.pow((p - 0.45) / 0.10, 2)) * 3;
        const noise = (Math.random() - 0.5) * 0.8;
        const baseline = 150 + 3 * Math.sin((t - this.t0) / 5000);
        onSample(t, baseline + wave + noise, true);
        this.simT += STEP;
      }
    }, 33);
  }

  stop() { clearInterval(this.timer); }
}
