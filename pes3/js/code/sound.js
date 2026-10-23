// Little beeps for the coding games (Web Audio). The first call must come from a tap (iOS).
let ctx = null;

export function tone(freq, ms = 120, { type = 'sine', gain = 0.12, at = 0 } = {}) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + at / 1000;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g); g.connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch { /* no audio: still playable */ }
}

// [[freq, ms], ...] played one after another.
export function tune(notes, opts) {
  let at = 0;
  for (const [f, ms] of notes) { tone(f, ms, { ...opts, at }); at += ms; }
}
