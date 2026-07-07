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
    this.REFRACTORY_MS = 400; // max 150 bpm; also rejects dicrotic-notch double counts
    this.lastMeta = {};
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
    await source.start((t, v, fingerOk, meta) => this._onSample(t, v, fingerOk, meta));
  }

  stop() {
    if (this.source) { this.source.stop(); this.source = null; }
  }

  get running() { return !!this.source; }

  _onSample(t, v, fingerOk, meta = {}) {
    this.lastMeta = meta;
    this.lastFingerOk = fingerOk;
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
      this._setQuality(0, meta.state || 'no finger');
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
    // cv < 0.12 excellent (resting HRV + 30fps sampling jitter is easily 10%), > 0.45 junk
    const q = Math.max(0, Math.min(1, 1 - (cv - 0.12) / 0.33));
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
  constructor(opts = {}) {
    this.deviceId = opts.deviceId || null; // pick a specific lens; else facingMode
    this.torchOn = opts.torch !== false;   // default on, but user can disable
    this.stream = null;
    this.track = null;
    this.video = null;      // live element — attach to DOM for the preview
    this.hasTorch = false;
    this.timer = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  // Enumerate rear cameras so the user can switch if the browser grabbed the
  // wrong lens (labels are only populated after a getUserMedia grant).
  static async listRearCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter(d => d.kind === 'videoinput');
    const rear = cams.filter(d => /back|rear|environment/i.test(d.label));
    return (rear.length ? rear : cams).map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }));
  }

  async start(onSample) {
    const video = this.deviceId
      ? { deviceId: { exact: this.deviceId }, width: { ideal: 320 }, height: { ideal: 240 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 } };
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = this.stream.getVideoTracks()[0];
    this.track = track;

    // Best-effort camera tuning, applied one by one so a failure doesn't kill the rest.
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    this.hasTorch = !!caps.torch;
    const tries = [];
    if (caps.torch && this.torchOn) tries.push({ torch: true });
    // Lock focus so autofocus doesn't hunt against the pressed finger.
    if (caps.focusMode?.includes('manual') && caps.focusDistance) {
      tries.push({ focusMode: 'manual', focusDistance: caps.focusDistance.min });
    } else if (caps.focusMode?.includes('fixed')) {
      tries.push({ focusMode: 'fixed' });
    }
    // Exposure stays on AUTO deliberately. When a finger covers the lens and the
    // flash barely reaches it (wide camera bars), auto-gain brightens the dark
    // tissue and surfaces the faint pulse. An earlier build pinned exposure to
    // minimum to stop dark scenes gain-cranking into fake "gray room" readings —
    // uniformity detection now handles that, so forcing minimum exposure only hurt
    // the common too-dark case.
    for (const c of tries) {
      try { await track.applyConstraints({ advanced: [c] }); } catch (_) {}
    }

    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();

    this.useGreen = false;
    this._fingerHold = 0;
    this.timer = setInterval(() => {
      const { ctx, canvas, video } = this;
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sr = 0, sg = 0, sb = 0, sL = 0, sL2 = 0;
      const n = px.length / 4;
      for (let i = 0; i < px.length; i += 4) {
        const R = px[i], G = px[i + 1], B = px[i + 2];
        sr += R; sg += G; sb += B;
        const L = (R + G + B) / 3;
        sL += L; sL2 += L * L;
      }
      const r = sr / n, g = sg / n, b = sb / n;
      const meanL = sL / n;
      const sd = Math.sqrt(Math.max(sL2 / n - meanL * meanL, 0));
      const cov = sd / (meanL + 1); // spatial coefficient of variation across the frame

      // Torch usually clips the red channel at 255, flattening the pulse wave.
      // Green rarely clips and carries a cleaner PPG signal — switch with hysteresis.
      if (r >= 245) this.useGreen = true;
      else if (r <= 235) this.useGreen = false;
      const blown = r >= 250 && g >= 235;
      const v = this.useGreen ? g : r;

      // Finger detection by spatial UNIFORMITY, not just redness: a covered lens
      // shows one flat colour (low cov) whether it's bright-red-lit or dark; a room
      // is full of edges (high cov). This catches the dark-finger case that pure
      // red-dominance misses (finger down, flash not reaching it → gain-cranked gray).
      const uniform = cov < 0.22;
      const redDom = r > g * 1.10 && r >= b;
      const dark = meanL < 55;
      const rawFinger = !blown && uniform && (redDom || dark);
      // debounce: hold detection ~500ms so brief valid moments don't flicker away
      if (rawFinger) this._fingerHold = performance.now();
      const fingerOk = performance.now() - this._fingerHold < 500;

      // actionable state for the readout — "too dark" and "not on lens" are
      // different problems (flash placement vs. finger placement)
      let state;
      if (blown) state = 'too bright';
      else if (!uniform) state = 'not on lens';
      else if (dark && !redDom) state = 'too dark — flash not on finger';
      else state = 'good';

      onSample(performance.now(), v, fingerOk, {
        blown, r: Math.round(r), g: Math.round(g), b: Math.round(b),
        channel: this.useGreen ? 'green' : 'red', cov: +cov.toFixed(2), state,
      });
    }, 33);
  }

  async setTorch(on) {
    this.torchOn = on;
    if (this.track && this.hasTorch) {
      try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); } catch (_) {}
    }
  }

  stop() {
    clearInterval(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.track = null;
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
