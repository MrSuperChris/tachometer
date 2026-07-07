// RPM-style tachometer gauge. Sweep 40–180 bpm over a 240° arc.
// Every visual element encodes data: needle = current BPM, dot flash = detected beat,
// green band = typical resting range (50–90).

const MIN = 40, MAX = 180;
const START = 150, END = -90; // degrees, CCW sweep of 240°

function bpmToAngle(bpm) {
  const f = Math.max(0, Math.min(1, (bpm - MIN) / (MAX - MIN)));
  return START - f * (START - END);
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a0 - a1) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export class Gauge {
  constructor(container) {
    const cx = 150, cy = 150, r = 120;
    this.cx = cx; this.cy = cy;

    let ticks = '';
    for (let bpm = MIN; bpm <= MAX; bpm += 10) {
      const major = bpm % 20 === 0;
      const a = bpmToAngle(bpm);
      const [x0, y0] = polar(cx, cy, r - (major ? 14 : 8), a);
      const [x1, y1] = polar(cx, cy, r, a);
      ticks += `<line class="gauge-tick${major ? ' major' : ''}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
      if (major && bpm !== 180) { // 180's label would land on the BPM readout
        const [lx, ly] = polar(cx, cy, r - 26, a);
        ticks += `<text class="gauge-label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${bpm}</text>`;
      }
    }

    container.innerHTML = `
      <svg viewBox="0 0 300 252" xmlns="http://www.w3.org/2000/svg">
        <path class="gauge-arc-bg" d="${arcPath(cx, cy, r, START, END)}" stroke-width="3"/>
        <path d="${arcPath(cx, cy, r, bpmToAngle(50), bpmToAngle(90))}" stroke="#1f6f34" stroke-width="6" fill="none"/>
        ${ticks}
        <g id="g-needle-rot" transform="rotate(0 ${cx} ${cy})">
          <line id="g-needle" class="gauge-needle" x1="${cx}" y1="${cy}" x2="${cx + 96}" y2="${cy}"/>
        </g>
        <circle class="gauge-hub" cx="${cx}" cy="${cy}" r="7"/>
        <circle id="g-beat" class="gauge-beat-dot" cx="${cx}" cy="${cy + 34}" r="6"/>
        <text id="g-bpm" class="gauge-bpm" x="${cx}" y="${cy + 76}" text-anchor="middle">--</text>
        <text class="gauge-bpm-unit" x="${cx}" y="${cy + 94}" text-anchor="middle">BPM</text>
      </svg>`;

    this.needleRot = container.querySelector('#g-needle-rot');
    this.bpmText = container.querySelector('#g-bpm');
    this.beatDot = container.querySelector('#g-beat');
    this.setBpm(0);
  }

  setBpm(bpm) {
    if (!bpm) {
      this.bpmText.textContent = '--';
      this.needleRot.setAttribute('transform', `rotate(${-bpmToAngle(MIN)} ${this.cx} ${this.cy})`);
      return;
    }
    this.bpmText.textContent = bpm;
    // SVG rotate is clockwise-positive; our angles are math-convention
    this.needleRot.setAttribute('transform', `rotate(${-bpmToAngle(bpm)} ${this.cx} ${this.cy})`);
  }

  flashBeat() {
    this.beatDot.classList.remove('flash');
    // retrigger animation
    void this.beatDot.getBoundingClientRect();
    this.beatDot.classList.add('flash');
  }
}
