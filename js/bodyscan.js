// 14-day guided body scan. Narrated with speechSynthesis — no audio files, works offline.
// Program arc follows the research: somatosensory scanning first (skin, muscle, contact),
// visceral scanning later (heartbeat, breath, gut), then integration.

// Phrasing templates for attending to a body area — cycled for variety.
const ATTEND = [
  (a) => `Bring your attention to your ${a}. Not picturing it — feeling it, from the inside.`,
  (a) => `Now move to your ${a}. Whatever is there — warmth, pressure, tingling, nothing at all — just notice it.`,
  (a) => `Let your attention settle into your ${a}. There's nothing to change. Only sensing.`,
  (a) => `Shift to your ${a}. If the mind wanders off, that's the engine slipping out of gear — gently put it back.`,
  (a) => `Rest your attention on your ${a}. Stay with the raw sensation, before any words about it.`,
];

const RELEASE = [
  (a) => `Now let your ${a} fade from attention.`,
  (a) => `Release your ${a}, and let the attention move on.`,
];

function seq(areas, pause = 40) {
  const out = [];
  areas.forEach((a, i) => {
    out.push({ text: ATTEND[i % ATTEND.length](a), pause });
    if (i === areas.length - 1) out.push({ text: RELEASE[i % RELEASE.length](a), pause: 4 });
  });
  return out;
}

const SETTLE = [
  { text: 'Find a comfortable position, lying down or seated. Let your eyes close.', pause: 10 },
  { text: 'Take three slower, deeper breaths. With each exhale, let the body get a little heavier.', pause: 22 },
];

const CLOSE = [
  { text: 'Let go of any focus now. For a few breaths, just rest in the whole body at once.', pause: 20 },
  { text: 'When you are ready, open your eyes. The session is complete.', pause: 3 },
];

export const DAYS = [
  { day: 1, title: 'Arrival', focus: 'breath and points of contact', segments: [
    ...SETTLE,
    { text: 'This first session is about arriving in the body at all. Notice every place your body touches something: the floor, the chair, your clothes.', pause: 20 },
    ...seq(['points of contact with the ground', 'weight, pressing down', 'breath, wherever you feel it most clearly']),
    { text: 'Each time thoughts pull you away, notice that it happened — that noticing is the whole skill — and come back to contact and breath.', pause: 50 },
    ...CLOSE,
  ]},
  { day: 2, title: 'Feet & lower legs', focus: 'toes, soles, ankles, calves', segments: [
    ...SETTLE,
    { text: 'Today the scan begins where it is easiest to feel: the feet.', pause: 6 },
    ...seq(['toes of your left foot', 'sole and heel of your left foot', 'left ankle and calf', 'toes of your right foot', 'sole and heel of your right foot', 'right ankle and calf']),
    { text: 'Hold both feet and lower legs in attention together, as one field of sensation.', pause: 25 },
    ...CLOSE,
  ]},
  { day: 3, title: 'Legs & hips', focus: 'knees, thighs, hips, seat', segments: [
    ...SETTLE,
    ...seq(['left knee', 'left thigh, front and back', 'right knee', 'right thigh, front and back', 'hips and pelvis', 'seat, and its pressure against the surface beneath you']),
    { text: 'Feel the whole lower body at once — everything from the waist down, alive with small signals.', pause: 25 },
    ...CLOSE,
  ]},
  { day: 4, title: 'Belly & back', focus: 'abdomen, lower back, spine', segments: [
    ...SETTLE,
    ...seq(['belly, rising and falling with the breath', 'sides of the torso, expanding and settling', 'lower back', 'the length of the spine, vertebra by vertebra', 'upper back and shoulder blades']),
    { text: 'The torso is where most emotion shows up physically. If anything is tight or restless there, you do not need to fix it. Sensing it is the practice.', pause: 28 },
    ...CLOSE,
  ]},
  { day: 5, title: 'Hands & forearms', focus: 'fingers, palms, wrists', segments: [
    ...SETTLE,
    { text: 'Hands are dense with nerve endings — they may buzz or tingle the moment you attend to them. Let them.', pause: 8 },
    ...seq(['fingertips of your left hand', 'palm and back of your left hand', 'left wrist and forearm', 'fingertips of your right hand', 'palm and back of your right hand', 'right wrist and forearm']),
    ...CLOSE,
  ]},
  { day: 6, title: 'Arms, shoulders & neck', focus: 'upper arms, shoulders, neck', segments: [
    ...SETTLE,
    ...seq(['left upper arm and elbow', 'right upper arm and elbow', 'both shoulders — and any weight they are carrying', 'the base of the neck', 'throat, and the front of the neck']),
    { text: 'Shoulders and neck hold the day\'s tension. Notice exactly where. Precision of sensing matters more than relaxation.', pause: 28 },
    ...CLOSE,
  ]},
  { day: 7, title: 'Face & head', focus: 'jaw, eyes, scalp', segments: [
    ...SETTLE,
    ...seq(['jaw — teeth slightly apart', 'lips and tongue', 'cheeks and nose, and the touch of air at the nostrils', 'eyes, resting behind closed lids', 'forehead', 'scalp, and the crown of the head']),
    { text: 'One week in. The whole map has now been visited piece by piece.', pause: 20 },
    ...CLOSE,
  ]},
  { day: 8, title: 'Full sweep', focus: 'feet to head, continuous', segments: [
    ...SETTLE,
    { text: 'Today, one continuous sweep. Attention will move slowly upward like a scanner, without stopping long anywhere.', pause: 8 },
    ...seq(['feet', 'lower legs', 'thighs and hips', 'belly and lower back', 'chest and upper back', 'hands and arms', 'shoulders and neck', 'face and head'], 24),
    { text: 'Now sweep back down, head to feet, in one slow pass of about a minute.', pause: 60 },
    ...CLOSE,
  ]},
  { day: 9, title: 'Breath as anchor', focus: 'interoceptive breathing', segments: [
    ...SETTLE,
    { text: 'This week turns inward, from the surface of the body to its interior. Today: the breath, felt rather than controlled.', pause: 10 },
    ...seq(['the cool touch of air entering the nostrils', 'the breath moving down the throat', 'the chest expanding and releasing', 'the belly swelling and softening', 'the brief still point between exhale and inhale'], 35),
    { text: 'Let the breath breathe itself, and simply ride it, for a while.', pause: 45 },
    ...CLOSE,
  ]},
  { day: 10, title: 'The heartbeat', focus: 'visceral — finding the pulse without touching', segments: [
    ...SETTLE,
    { text: 'Today\'s object is the one you train with on the gauge: your heartbeat, felt from the inside. Do not touch your pulse.', pause: 8 },
    ...seq(['the center of your chest — wait patiently for any rhythm', 'the throat and the sides of the neck', 'the belly — the pulse is sometimes felt there', 'fingertips and palms, resting still'], 45),
    { text: 'If you find the beat anywhere, stay with it. If you find nothing, stay with the searching itself — the attention is training either way.', pause: 90 },
    ...CLOSE,
  ]},
  { day: 11, title: 'Gut & inner torso', focus: 'visceral — stomach, gut, inner space', segments: [
    ...SETTLE,
    ...seq(['the stomach — hunger, fullness, warmth, movement', 'the space behind the navel', 'the whole inner volume of the torso, as a three dimensional space', 'any place inside that feels tense, hollow, or warm'], 45),
    { text: 'Interior signals are quieter and vaguer than skin. Vague is fine. You are teaching the dial to read a fainter signal.', pause: 40 },
    ...CLOSE,
  ]},
  { day: 12, title: 'Sweep & heartbeat', focus: 'full sweep ending at the heart', segments: [
    ...SETTLE,
    ...seq(['feet and legs', 'hips and belly', 'hands and arms', 'shoulders, neck and head'], 24),
    { text: 'Now let everything converge on the chest, and listen for the heartbeat, as long as it takes.', pause: 90 },
    { text: 'Whether or not the beat appeared, notice how the body feels different than when you lay down.', pause: 20 },
    ...CLOSE,
  ]},
  { day: 13, title: 'Strongest sensation', focus: 'open scanning — attention goes where the signal is', segments: [
    ...SETTLE,
    { text: 'No route today. Let attention move on its own to whatever sensation is strongest, anywhere in the body.', pause: 10 },
    { text: 'Find the strongest sensation present right now. Go to it. Examine it: size, temperature, texture, movement.', pause: 70 },
    { text: 'When it fades or something stronger appears, follow the new signal. Keep tracking the loudest instrument in the body.', pause: 80 },
    { text: 'Once more: find what is strongest now, and give it your full attention.', pause: 70 },
    ...CLOSE,
  ]},
  { day: 14, title: 'The whole engine', focus: 'integration — body as one field', segments: [
    ...SETTLE,
    { text: 'Final day. Everything at once: skin, muscle, breath, heartbeat — the whole engine, in gear.', pause: 10 },
    ...seq(['the whole body as a single field of sensation', 'the breath moving through that field', 'the heartbeat somewhere inside it'], 30),
    { text: 'This is the state the program has been building: attention resting in the body, engaged, not revving in neutral. It is available any time, in about three breaths.', pause: 40 },
    { text: 'Two weeks complete.', pause: 5 },
    ...CLOSE,
  ]},
];

export function estimateMinutes(day) {
  const secs = day.segments.reduce((a, s) => a + s.pause + s.text.split(' ').length / 2.4, 0);
  return Math.round(secs / 60);
}

// ---------------- Player ----------------
export class ScanPlayer extends EventTarget {
  constructor() {
    super();
    this.day = null;
    this.idx = 0;
    this.playing = false;
    this._timer = null;
  }

  start(day) {
    this.stop();
    this.day = day;
    this.idx = 0;
    this.playing = true;
    this._speakCurrent();
  }

  _speakCurrent() {
    if (!this.playing) return;
    const segs = this.day.segments;
    if (this.idx >= segs.length) {
      this.playing = false;
      this.dispatchEvent(new Event('complete'));
      return;
    }
    const seg = segs[this.idx];
    this.dispatchEvent(new CustomEvent('segment', {
      detail: { text: seg.text, idx: this.idx, total: segs.length },
    }));
    const u = new SpeechSynthesisUtterance(seg.text);
    u.rate = 0.85;
    u.pitch = 0.95;
    let advanced = false;
    const advance = () => {
      if (advanced || !this.playing) return;
      advanced = true;
      clearTimeout(this._watchdog);
      this._timer = setTimeout(() => { this.idx++; this._speakCurrent(); }, seg.pause * 1000);
    };
    u.onend = advance;
    u.onerror = advance; // don't stall the session if a segment fails
    // watchdog: if the speech engine never fires onend/onerror (broken TTS,
    // headless browser), advance after a generous estimate of the speech time
    const estMs = (seg.text.split(' ').length / 2.0) * 1000 + 8000;
    this._watchdog = setTimeout(advance, estMs);
    speechSynthesis.speak(u);
  }

  pause() {
    this.playing = false;
    clearTimeout(this._timer);
    clearTimeout(this._watchdog);
    speechSynthesis.cancel();
  }

  resume() {
    if (this.playing) return;
    this.playing = true;
    this._speakCurrent(); // re-speak current segment
  }

  stop() {
    this.playing = false;
    clearTimeout(this._timer);
    clearTimeout(this._watchdog);
    try { speechSynthesis.cancel(); } catch (_) {}
    this.day = null;
    this.idx = 0;
  }
}
