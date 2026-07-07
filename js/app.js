import { PPGEngine, CameraSource, SimSource } from './ppg.js';
import { Gauge } from './gauge.js';
import { startCountTrial, startTapPractice } from './tasks.js';
import { DAYS, estimateMinutes, ScanPlayer } from './bodyscan.js';
import { getSessions, getScanState, markScanDay, nextScanDay } from './store.js';

const $ = (sel) => document.querySelector(sel);
const SIM = new URLSearchParams(location.search).has('sim');

// ---------------- engine + gauge ----------------
const engine = new PPGEngine();
const gauge = new Gauge($('#gauge-wrap'));
window.__tacho = { engine, gauge }; // debug handle — also handy on-device

engine.addEventListener('bpm', (e) => gauge.setBpm(e.detail.bpm));
engine.addEventListener('beat', () => gauge.flashBeat());

// live waveform: the last ~4s of the detrended pulse signal, so finger
// placement problems are visible instead of guessed at
const waveEl = $('#wave');
const waveCtx = waveEl.getContext('2d');
const waveBuf = [];
let lastWaveDraw = 0;

function drawWave() {
  const W = waveEl.width, H = waveEl.height;
  waveCtx.clearRect(0, 0, W, H);
  if (waveBuf.length < 10) return;
  let min = Infinity, max = -Infinity;
  for (const d of waveBuf) { if (d < min) min = d; if (d > max) max = d; }
  const span = Math.max(max - min, 1e-3);
  waveCtx.beginPath();
  waveBuf.forEach((d, i) => {
    const x = (i / (waveBuf.length - 1)) * W;
    const y = H - 6 - ((d - min) / span) * (H - 12);
    i === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
  });
  waveCtx.strokeStyle = '#ff4d4d';
  waveCtx.lineWidth = 2;
  waveCtx.stroke();
}

// draw from sample events, not requestAnimationFrame — rAF stops entirely in
// hidden tabs, and event-driven drawing costs nothing extra at ~10fps
let lastReadout = 0;
engine.addEventListener('sample', (e) => {
  waveBuf.push(e.detail.d);
  if (waveBuf.length > 120) waveBuf.shift(); // ~4s at 30Hz
  const now = performance.now();
  if (now - lastWaveDraw > 100 && !waveEl.classList.contains('hidden')) {
    lastWaveDraw = now;
    drawWave();
  }
  if (now - lastReadout > 200 && !$('#cam-diag').classList.contains('hidden')) {
    lastReadout = now;
    updateReadout();
  }
});

// live diagnostic readout — turns "am I doing it wrong?" into something visible
function updateReadout() {
  const m = engine.lastMeta || {};
  const finger = $('#ro-finger'), light = $('#ro-bright'), channel = $('#ro-channel');
  const st = m.state || '—';
  const good = st === 'good';
  const onLens = engine.lastFingerOk || (st !== 'not on lens' && st !== '—');
  finger.textContent = onLens ? (good ? 'on lens ✓' : 'on lens') : 'not on lens';
  finger.className = onLens ? (good ? 'ok' : '') : 'bad';
  // the actionable line: what to fix (too dark / too bright / good)
  light.textContent = st === '—' ? '—' : st === 'good' ? 'good ✓' : st;
  light.className = good ? 'ok' : (st === '—' ? '' : 'bad');
  channel.textContent = m.channel || '—';
}
window.__tacho.updateReadout = updateReadout; // exposed for testing
engine.addEventListener('signal', (e) => {
  const { quality, label } = e.detail;
  const fill = $('#sig-fill');
  fill.style.width = `${Math.round(quality * 100)}%`;
  fill.classList.toggle('good', quality > 0.6);
  $('#sig-status').textContent = label;
  $('#task-launch').classList.toggle('hidden', !(quality > 0.5));
});

// camera state, so torch/switch controls can act on the live source
let camSource = null;
let rearCams = [];
let camIndex = 0;
let torchOn = true;

const CAM_HINT = 'Find the glowing flash on the camera bar and cover it AND the lens next to it with one flat finger. Read the "light" line: "too dark" = the flash isn\'t landing on your finger, slide toward the glow; "not on lens" = cover more of the bar. If it never responds, tap Switch lens — the browser may be using a lens far from the flash. Goal: preview glows solid red, light says good.';

function stopCamera() {
  engine.stop();
  camSource = null;
  gauge.setBpm(0);
  $('#btn-camera').textContent = 'Start camera';
  $('#sig-status').textContent = 'camera off';
  $('#sig-fill').style.width = '0%';
  $('#task-launch').classList.add('hidden');
  $('#wave').classList.add('hidden');
  $('#cam-diag').classList.add('hidden');
  $('#cam-preview').innerHTML = '';
}

async function startCamera(deviceId) {
  const btn = $('#btn-camera');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  waveBuf.length = 0;
  $('#wave').classList.remove('hidden');
  try {
    if (SIM) throw new Error('sim mode requested');
    camSource = new CameraSource({ deviceId, torch: torchOn });
    await engine.start(camSource);
    // show the live preview so the user can aim their finger
    $('#cam-preview').innerHTML = '';
    $('#cam-preview').appendChild(camSource.video);
    $('#cam-diag').classList.remove('hidden');
    $('#btn-torch').classList.toggle('hidden', !camSource.hasTorch);
    $('#btn-torch').textContent = `Flash: ${camSource.torchOn ? 'on' : 'off'}`;
    // populate the lens list once we have a grant (labels need permission)
    if (!rearCams.length) {
      rearCams = await CameraSource.listRearCameras();
      const i = rearCams.findIndex(c => c.deviceId === camSource.track?.getSettings?.().deviceId);
      if (i >= 0) camIndex = i;
    }
    $('#btn-switch').classList.toggle('hidden', rearCams.length < 2);
    $('#measure-hint').textContent = CAM_HINT;
    btn.textContent = 'Stop camera';
  } catch (err) {
    // no camera (desktop) or permission denied → simulated pulse so the app is still usable
    camSource = null;
    await engine.start(new SimSource());
    $('#cam-diag').classList.add('hidden');
    $('#measure-hint').textContent = SIM
      ? 'SIMULATED PULSE — synthetic ~62 bpm signal for testing.'
      : 'Camera unavailable — running a SIMULATED pulse so you can explore. On your phone, allow camera access for real measurement.';
    btn.textContent = 'Stop';
  }
  btn.disabled = false;
}

$('#btn-camera').addEventListener('click', () => {
  if (engine.running) stopCamera();
  else startCamera(rearCams[camIndex]?.deviceId);
});

$('#btn-torch').addEventListener('click', async () => {
  if (!camSource) return;
  torchOn = !camSource.torchOn;
  await camSource.setTorch(torchOn);
  $('#btn-torch').textContent = `Flash: ${torchOn ? 'on' : 'off'}`;
});

$('#btn-switch').addEventListener('click', async () => {
  if (!rearCams.length) return;
  camIndex = (camIndex + 1) % rearCams.length;
  engine.stop();
  await startCamera(rearCams[camIndex].deviceId);
  $('#sig-status').textContent = `lens ${camIndex + 1}/${rearCams.length}`;
});

// ---------------- view switching ----------------
const scanPlayer = new ScanPlayer();
window.__tacho.scanPlayer = scanPlayer;
let scanWakeLock = null;

function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  document.querySelectorAll('#tabbar .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view));
  if (view !== 'scan' && scanPlayer.day) endScanSession(false);
  if (view === 'scan') renderScanList();
  if (view === 'progress') renderProgress();
}

document.querySelectorAll('#tabbar .tab').forEach(t =>
  t.addEventListener('click', () => show(t.dataset.view)));

// ---------------- tasks ----------------
$('#btn-count').addEventListener('click', () => {
  show('count');
  startCountTrial(engine, $('#count-stage'), () => show('measure'));
});
$('#btn-tap').addEventListener('click', () => {
  show('tap');
  startTapPractice(engine, $('#tap-stage'), () => show('measure'));
});

// ---------------- body scan ----------------
function renderScanList() {
  const listEl = $('#scan-list');
  $('#scan-player').classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';
  const { completedDays } = getScanState();
  const next = nextScanDay();

  DAYS.forEach(d => {
    const done = !!completedDays[d.day];
    const unlocked = done || d.day === next;
    const row = document.createElement('div');
    row.className = `scan-day${done ? ' done' : ''}${unlocked ? '' : ' locked'}`;
    row.innerHTML = `
      <div class="day-num">${done ? '✓' : d.day}</div>
      <div class="day-info">
        <div class="day-title">Day ${d.day} — ${d.title}</div>
        <div class="day-focus">${d.focus}</div>
      </div>
      <div class="day-mins">~${estimateMinutes(d)} min</div>`;
    if (unlocked) row.addEventListener('click', () => startScanSession(d));
    listEl.appendChild(row);
  });
}

async function startScanSession(day) {
  $('#scan-list').classList.add('hidden');
  $('#scan-player').classList.remove('hidden');
  $('#scan-day-title').textContent = `Day ${day.day} — ${day.title}`;
  $('#btn-scan-toggle').textContent = 'Pause';
  try { scanWakeLock = await navigator.wakeLock?.request('screen'); } catch (_) {}
  scanPlayer.start(day);
}

function endScanSession(completed) {
  const day = scanPlayer.day;
  scanPlayer.stop();
  try { scanWakeLock?.release(); } catch (_) {}
  scanWakeLock = null;
  if (completed && day) markScanDay(day.day);
  renderScanList();
}

scanPlayer.addEventListener('segment', (e) => {
  const { text, idx, total } = e.detail;
  $('#scan-line').textContent = text;
  $('#scan-progress').style.width = `${Math.round(((idx + 1) / total) * 100)}%`;
});
scanPlayer.addEventListener('complete', () => endScanSession(true));

$('#btn-scan-toggle').addEventListener('click', () => {
  const btn = $('#btn-scan-toggle');
  if (scanPlayer.playing) { scanPlayer.pause(); btn.textContent = 'Resume'; }
  else { scanPlayer.resume(); btn.textContent = 'Pause'; }
});
$('#btn-scan-quit').addEventListener('click', () => endScanSession(false));

// ---------------- progress ----------------
function lineChart(sessions, color) {
  if (sessions.length < 2) {
    return `<div class="chart-empty">${sessions.length === 0 ? 'No sessions yet.' : 'One session logged — run another to see a trend.'}</div>`;
  }
  const W = 460, H = 140, PAD = 26;
  const xs = (i) => PAD + (i / (sessions.length - 1)) * (W - 2 * PAD);
  const ys = (s) => H - PAD - (s / 100) * (H - 2 * PAD);
  const pts = sessions.map((s, i) => `${xs(i).toFixed(1)},${ys(s.score).toFixed(1)}`).join(' ');
  const dots = sessions.map((s, i) =>
    `<circle cx="${xs(i).toFixed(1)}" cy="${ys(s.score).toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
  const grid = [0, 50, 100].map(v =>
    `<line x1="${PAD}" y1="${ys(v)}" x2="${W - PAD}" y2="${ys(v)}" stroke="#30363d" stroke-width="1" stroke-dasharray="3 4"/>
     <text x="${PAD - 6}" y="${ys(v) + 4}" fill="#8b949e" font-size="10" text-anchor="end">${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">
    ${grid}
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

function renderProgress() {
  const counts = getSessions('count');
  const taps = getSessions('tap');
  const { completedDays } = getScanState();
  const scanDone = Object.keys(completedDays).length;

  const latest = (arr) => arr.length ? `${arr[arr.length - 1].score}%` : '—';
  const best = (arr) => arr.length ? `${Math.max(...arr.map(s => s.score))}%` : '—';

  const cells = DAYS.map(d =>
    `<div class="scan-cell${completedDays[d.day] ? ' done' : ''}">${d.day}</div>`).join('');

  $('#progress-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val">${latest(counts)}</div><div class="stat-label">LATEST COUNT ACCURACY</div></div>
      <div class="stat-card"><div class="stat-val">${best(counts)}</div><div class="stat-label">BEST COUNT ACCURACY</div></div>
      <div class="stat-card"><div class="stat-val">${latest(taps)}</div><div class="stat-label">LATEST TAP SYNC</div></div>
      <div class="stat-card"><div class="stat-val">${scanDone}/14</div><div class="stat-label">BODY SCAN DAYS</div></div>
    </div>
    <div class="chart-card"><h3>Count trial accuracy</h3>${lineChart(counts, '#ff4d4d')}</div>
    <div class="chart-card"><h3>Tap sync score</h3>${lineChart(taps, '#58a6ff')}</div>
    <div class="chart-card"><h3>Body scan program</h3><div class="scan-grid">${cells}</div></div>
    <p class="hint">Interoceptive accuracy typically improves within two weeks of daily practice. All data stays on this device.</p>`;
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
