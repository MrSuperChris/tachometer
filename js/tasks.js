// The two heartbeat-detection tasks.
// Count Trial: Schandry heartbeat-counting task — silently count felt beats, compare to measured.
// Tap Practice: tap along with felt beats — matched-tap ratio + timing consistency.

import { addSession } from './store.js';

function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

function beep(freq = 880, ms = 180) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
    setTimeout(() => ctx.close(), ms + 200);
  } catch (_) {}
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

let wakeLock = null;
async function lockScreen() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) {}
}
function unlockScreen() {
  try { wakeLock?.release(); } catch (_) {}
  wakeLock = null;
}

function scoreClass(pct) { return pct >= 80 ? 'good' : pct >= 55 ? 'mid' : 'low'; }

// ---------------- Count Trial ----------------
export function startCountTrial(engine, stage, onExit) {
  let duration = 45;

  function renderIntro() {
    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>Count your heartbeats</h2>
        <p>Sit still and comfortable. When the timer starts, <strong>silently count every heartbeat you feel</strong> until it ends.</p>
        <p>Don't touch your pulse or guess from rhythm — attend to your chest and body. Keep the fingertip resting lightly on the camera.</p>
        <div class="duration-row">
          <button class="btn" data-d="30">30s</button>
          <button class="btn selected" data-d="45">45s</button>
          <button class="btn" data-d="60">60s</button>
        </div>
        <button class="btn primary" id="ct-start">Start</button>
        <p class="hint" id="ct-gate"></p>
        <button class="btn ghost" id="ct-back">Back</button>
      </div>`);
    stage.appendChild(card);

    card.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      card.querySelectorAll('[data-d]').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      duration = +b.dataset.d;
    }));

    const startBtn = card.querySelector('#ct-start');
    const gate = card.querySelector('#ct-gate');
    const gateTimer = setInterval(() => {
      const ok = engine.running && engine.quality > 0.5;
      startBtn.disabled = !ok;
      gate.textContent = ok ? 'Signal locked — ready.' :
        engine.running ? 'Waiting for a steady pulse signal…' : 'Camera is off — start it on the Gauge tab first.';
    }, 400);

    startBtn.addEventListener('click', () => { clearInterval(gateTimer); renderRunning(); });
    card.querySelector('#ct-back').addEventListener('click', () => { clearInterval(gateTimer); onExit(); });
  }

  function renderRunning() {
    lockScreen();
    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>Counting…</h2>
        <p>Eyes closed if it helps. Count each felt beat.</p>
        <div class="big-timer" id="ct-timer">${duration}</div>
        <p class="hint" id="ct-quality"></p>
      </div>`);
    stage.appendChild(card);

    beep(660, 120); vibrate(80);
    const t0 = performance.now();
    let qualitySamples = [];

    const tick = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const left = Math.max(0, Math.ceil(duration - elapsed));
      card.querySelector('#ct-timer').textContent = left;
      qualitySamples.push(engine.quality);
      card.querySelector('#ct-quality').textContent = engine.quality > 0.5 ? '' : 'signal weak — keep finger still';
      if (elapsed >= duration) {
        clearInterval(tick);
        const t1 = performance.now();
        beep(880, 200); vibrate([100, 60, 100]);
        unlockScreen();
        const actual = engine.beatsBetween(t0, t1).length;
        const meanQ = qualitySamples.reduce((a, b) => a + b, 0) / qualitySamples.length;
        renderEntry(actual, meanQ);
      }
    }, 250);
  }

  function renderEntry(actual, meanQ) {
    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>How many did you count?</h2>
        <input class="count-input" id="ct-input" type="number" inputmode="numeric" min="0" max="300" placeholder="0">
        <button class="btn primary" id="ct-submit">See result</button>
      </div>`);
    stage.appendChild(card);
    const input = card.querySelector('#ct-input');
    input.focus();
    card.querySelector('#ct-submit').addEventListener('click', () => {
      const counted = parseInt(input.value, 10);
      if (isNaN(counted) || counted < 0) return;
      renderResult(actual, counted, meanQ);
    });
  }

  function renderResult(actual, counted, meanQ) {
    // Schandry accuracy: 1 - |actual - counted| / actual
    const acc = actual > 0 ? Math.max(0, 1 - Math.abs(actual - counted) / actual) : 0;
    const pct = Math.round(acc * 100);
    const unreliable = meanQ < 0.45;

    if (!unreliable) {
      addSession({ type: 'count', score: pct, detail: { actual, counted, duration } });
    }

    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>Interoceptive accuracy</h2>
        <div class="result-score ${scoreClass(pct)}">${pct}%</div>
        <p class="result-detail">You counted <strong>${counted}</strong> — the camera measured <strong>${actual}</strong> beats in ${duration}s.</p>
        ${unreliable ? '<p class="hint">Signal was too weak for a reliable measure — this one wasn\'t saved.</p>' : ''}
        <button class="btn primary" id="ct-again">Run another</button>
        <button class="btn ghost" id="ct-done">Done</button>
      </div>`);
    stage.appendChild(card);
    card.querySelector('#ct-again').addEventListener('click', renderIntro);
    card.querySelector('#ct-done').addEventListener('click', onExit);
  }

  renderIntro();
}

// ---------------- Tap Practice ----------------
export function startTapPractice(engine, stage, onExit) {
  let duration = 45;

  function renderIntro() {
    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>Tap with your heart</h2>
        <p><strong>Tap the pad each time you feel a beat.</strong> Don't touch your pulse — sense it in your chest, throat, or wherever it shows up.</p>
        <p>The meter shows how many of your recent taps landed on real beats.</p>
        <div class="duration-row">
          <button class="btn" data-d="30">30s</button>
          <button class="btn selected" data-d="45">45s</button>
          <button class="btn" data-d="60">60s</button>
        </div>
        <button class="btn primary" id="tp-start">Start</button>
        <p class="hint" id="tp-gate"></p>
        <button class="btn ghost" id="tp-back">Back</button>
      </div>`);
    stage.appendChild(card);

    card.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      card.querySelectorAll('[data-d]').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      duration = +b.dataset.d;
    }));

    const startBtn = card.querySelector('#tp-start');
    const gate = card.querySelector('#tp-gate');
    const gateTimer = setInterval(() => {
      const ok = engine.running && engine.quality > 0.5;
      startBtn.disabled = !ok;
      gate.textContent = ok ? 'Signal locked — ready.' :
        engine.running ? 'Waiting for a steady pulse signal…' : 'Camera is off — start it on the Gauge tab first.';
    }, 400);

    startBtn.addEventListener('click', () => { clearInterval(gateTimer); renderRunning(); });
    card.querySelector('#tp-back').addEventListener('click', () => { clearInterval(gateTimer); onExit(); });
  }

  const MATCH_WINDOW = 400; // ms tolerance tap↔beat

  function renderRunning() {
    lockScreen();
    stage.innerHTML = '';
    const wrap = el(`
      <div>
        <div class="big-timer" id="tp-timer" style="text-align:center">${duration}</div>
        <div id="tap-pad">
          <div class="pad-label">tap on each felt beat</div>
          <div class="pad-count" id="tp-count">0</div>
        </div>
        <div id="sync-meter">
          <span class="sm-label">SYNC</span>
          <div class="sm-bar"><div class="sm-fill" id="tp-sync"></div></div>
        </div>
      </div>`);
    stage.appendChild(wrap);

    beep(660, 120); vibrate(80);
    const t0 = performance.now();
    const taps = [];
    const pad = wrap.querySelector('#tap-pad');
    const countEl = wrap.querySelector('#tp-count');
    const syncEl = wrap.querySelector('#tp-sync');

    function onTap(e) {
      e.preventDefault();
      taps.push(performance.now());
      countEl.textContent = taps.length;
      pad.classList.add('hit');
      setTimeout(() => pad.classList.remove('hit'), 120);
      // live sync: of last 8 taps, how many land within window of a beat
      const recent = taps.slice(-8);
      const beats = engine.beats;
      let hit = 0;
      for (const tp of recent) {
        if (beats.some(b => Math.abs(b - tp) <= MATCH_WINDOW)) hit++;
      }
      syncEl.style.width = `${Math.round((hit / recent.length) * 100)}%`;
    }
    pad.addEventListener('pointerdown', onTap);

    const tick = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      wrap.querySelector('#tp-timer').textContent = Math.max(0, Math.ceil(duration - elapsed));
      if (elapsed >= duration) {
        clearInterval(tick);
        pad.removeEventListener('pointerdown', onTap);
        beep(880, 200); vibrate([100, 60, 100]);
        unlockScreen();
        finish(t0, performance.now(), taps);
      }
    }, 250);
  }

  function finish(t0, t1, taps) {
    const beats = engine.beatsBetween(t0, t1);
    // greedy two-pointer matching: each beat pairs with at most one tap
    let bi = 0, matched = 0;
    const offsets = [];
    const sortedTaps = [...taps].sort((a, b) => a - b);
    for (const tp of sortedTaps) {
      while (bi < beats.length && beats[bi] < tp - MATCH_WINDOW) bi++;
      if (bi < beats.length && Math.abs(beats[bi] - tp) <= MATCH_WINDOW) {
        offsets.push(tp - beats[bi]);
        matched++; bi++;
      }
    }
    const denom = Math.max(beats.length, taps.length, 1);
    const pct = Math.round((matched / denom) * 100);
    const meanAbs = offsets.length
      ? Math.round(offsets.reduce((a, b) => a + Math.abs(b), 0) / offsets.length)
      : null;

    if (beats.length >= 10) {
      addSession({ type: 'tap', score: pct, detail: { taps: taps.length, beats: beats.length, matched, meanAbsOffset: meanAbs, duration } });
    }

    stage.innerHTML = '';
    const card = el(`
      <div class="stage-card">
        <h2>Sync score</h2>
        <div class="result-score ${scoreClass(pct)}">${pct}%</div>
        <p class="result-detail"><strong>${matched}</strong> of your <strong>${taps.length}</strong> taps landed on the <strong>${beats.length}</strong> measured beats${meanAbs !== null ? ` — average miss <strong>${meanAbs}ms</strong>` : ''}.</p>
        ${beats.length < 10 ? '<p class="hint">Too few beats measured for a reliable score — not saved.</p>' : ''}
        <button class="btn primary" id="tp-again">Run another</button>
        <button class="btn ghost" id="tp-done">Done</button>
      </div>`);
    stage.appendChild(card);
    card.querySelector('#tp-again').addEventListener('click', renderIntro);
    card.querySelector('#tp-done').addEventListener('click', onExit);
  }

  renderIntro();
}
