// localStorage persistence. Everything lives on-device.

const KEY_SESSIONS = 'tacho.sessions.v1'; // [{type:'count'|'tap', date, score, detail}]
const KEY_SCAN = 'tacho.bodyscan.v1';     // {completedDays: {1: isoDate, ...}}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (_) { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

export function addSession(entry) {
  const all = load(KEY_SESSIONS, []);
  all.push({ ...entry, date: new Date().toISOString() });
  save(KEY_SESSIONS, all);
}

export function getSessions(type = null) {
  const all = load(KEY_SESSIONS, []);
  return type ? all.filter(s => s.type === type) : all;
}

export function markScanDay(day) {
  const s = load(KEY_SCAN, { completedDays: {} });
  s.completedDays[day] = new Date().toISOString();
  save(KEY_SCAN, s);
}

export function getScanState() {
  return load(KEY_SCAN, { completedDays: {} });
}

// next uncompleted day (1-14); days unlock sequentially
export function nextScanDay() {
  const { completedDays } = getScanState();
  for (let d = 1; d <= 14; d++) if (!completedDays[d]) return d;
  return null; // program complete
}
