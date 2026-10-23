// testing step 6 PR #18
// Simon Says: watch the colours, then repeat them. A slip just replays the same pattern.
import { el, scope, celebrate, award } from '../util.js';

const PADS = [
  { name: 'red', freq: 261.63 },
  { name: 'green', freq: 329.63 },
  { name: 'blue', freq: 392.0 },
  { name: 'yellow', freq: 523.25 },
];
const GOAL = 8;

export function mount(root, _e, api) {
  const sc = scope();
  let ctx = null;
  let seq = [];
  let input = 0;
  let accepting = false;

  function tone(freq, ms) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + ms / 1000);
    } catch { /* no audio: still playable visually */ }
  }

  const msg = el('div', { class: 'msg', 'aria-live': 'polite' }, 'Press Start, then watch the colours.');
  const pads = PADS.map((p, i) => el('button', { class: `simon-pad ${p.name}`, type: 'button', 'aria-label': p.name, onclick: () => press(i) }));
  const board = el('div', { class: 'simon' }, pads);
  const startBtn = el('button', { class: 'btn primary big', type: 'button', onclick: begin }, 'Start');

  function flash(i, ms = 400) {
    pads[i].classList.add('lit');
    tone(PADS[i].freq, ms);
    sc.later(() => pads[i].classList.remove('lit'), ms);
  }

  function show() {
    accepting = false;
    input = 0;
    msg.textContent = 'Watch…';
    const gap = Math.max(300, 600 - seq.length * 25);
    seq.forEach((p, k) => sc.later(() => flash(p, gap - 100), 700 + k * gap));
    sc.later(() => { accepting = true; msg.textContent = 'Your turn!'; }, 700 + seq.length * gap);
  }

  function begin() {
    startBtn.hidden = true;
    if (!ctx) tone(1, 1); // unlock audio inside the tap
    seq = [Math.floor(Math.random() * 4)];
    show();
  }

  function press(i) {
    if (!accepting) return;
    flash(i, 200);
    if (i !== seq[input]) {
      accepting = false;
      msg.textContent = 'Oops — watch again!';
      sc.later(show, 1000);
      return;
    }
    input++;
    if (input === seq.length) {
      accepting = false;
      award();
      if (seq.length >= GOAL) {
        msg.textContent = 'Amazing memory!';
        celebrate(root);
        startBtn.textContent = 'Play again';
        startBtn.hidden = false;
        return;
      }
      msg.textContent = 'Great! Here comes a longer one…';
      seq.push(Math.floor(Math.random() * 4));
      sc.later(show, 1100);
    }
  }

  root.append(el('p', { class: 'prompt' }, 'Copy the pattern!'), board, msg, startBtn);
  return () => sc.dispose();
}
