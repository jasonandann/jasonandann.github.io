// Shared math helpers for the Math games: question generator, level picker, quiz loop.
import { el, shuffle, scope, finish, award } from './util.js';

export const LEVELS = [
  { id: 'add', name: 'Add & subtract', blurb: 'within 100' },
  { id: 't5', name: 'Times tables 2–5', blurb: 'multiplication' },
  { id: 't10', name: 'Times tables 2–10', blurb: 'multiplication' },
  { id: 'div', name: 'Times & division', blurb: 'multiply and divide' },
];
const LEVEL_KEY = 'spelling-games.mathlevel';
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// {text:'7 × 8', answer:56, hints:[numbers that make plausible wrong answers]}
export function makeQuestion(level) {
  if (level === 'add') {
    if (Math.random() < 0.5) {
      const a = rnd(10, 80), b = rnd(5, 99 - a);
      return { text: `${a} + ${b}`, answer: a + b, hints: [a + b + 10, a + b - 10, a - b > 0 ? a - b : a + b + 1] };
    }
    const a = rnd(20, 99), b = rnd(5, a - 1);
    return { text: `${a} − ${b}`, answer: a - b, hints: [a - b + 10, a - b - 10, a + b > 99 ? a - b + 1 : a + b] };
  }
  const max = level === 't5' ? 5 : 10;
  const a = rnd(2, max), b = rnd(2, 10);
  const hints = [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1)];
  if (level === 'div' && Math.random() < 0.5) {
    return { text: `${a * b} ÷ ${a}`, answer: b, hints: [b + 1, b - 1, a, b + 2] };
  }
  return { text: `${a} × ${b}`, answer: a * b, hints };
}

export function makeQuestions(level, n) {
  const seen = new Set();
  const out = [];
  for (let guard = 0; out.length < n && guard < 400; guard++) {
    const q = makeQuestion(level);
    if (!seen.has(q.text)) { seen.add(q.text); out.push(q); }
  }
  return out;
}

// answer + (n-1) plausible wrong numbers, shuffled
export function choices(q, n = 4) {
  const set = new Set();
  const pool = shuffle([...q.hints, q.answer + 1, q.answer - 1, q.answer + 2, q.answer - 2, q.answer + 10, q.answer - 10]);
  for (const c of pool) if (c >= 0 && c !== q.answer) set.add(c);
  for (let guard = 0; set.size < n - 1 && guard < 100; guard++) {
    const c = q.answer + rnd(-12, 12);
    if (c >= 0 && c !== q.answer) set.add(c);
  }
  return shuffle([q.answer, ...[...set].slice(0, n - 1)]);
}

export const NUDGES = ['Try again!', 'Keep trying!', 'Nearly there!', 'Have another go!'];
export const nudge = () => pick(NUDGES);

export function savedLevel() {
  try { const v = localStorage.getItem(LEVEL_KEY); if (LEVELS.some((l) => l.id === v)) return v; } catch { /* ignore */ }
  return 't10';
}

// Level chooser shown at the start of each math game; remembers the last choice.
export function pickLevel(root, title, onPick) {
  const cur = savedLevel();
  root.replaceChildren(
    el('div', { class: 'setup' },
      el('h2', {}, title),
      el('p', { class: 'prompt' }, 'What would you like to practice?'),
      el('div', { class: 'levels' },
        LEVELS.map((l) =>
          el('button', {
            class: 'btn big' + (l.id === cur ? ' primary' : ''), type: 'button',
            onclick: () => {
              try { localStorage.setItem(LEVEL_KEY, l.id); } catch { /* ignore */ }
              onPick(l.id);
            },
          }, l.name),
        ),
      ),
    ),
  );
}

// Runs `count` questions. drawQ({q, i, count, choices, later, onLeave, done}) renders one question
// into `root`; it calls done() once the answer is right (after any animation it wants to show).
export function quiz(root, api, title, count, drawQ) {
  let sc = scope();
  let alive = true;
  function start(level) {
    const qs = makeQuestions(level, count);
    let i = 0;
    const show = () => {
      sc.dispose();
      sc = scope();
      if (!alive) return;
      if (i >= qs.length) return finish(root, api, () => start(level));
      const q = qs[i];
      root.replaceChildren();
      drawQ({
        q, i, count: qs.length, choices: choices(q), later: sc.later, onLeave: sc.onLeave,
        done: () => { award(); i++; show(); },
      });
    };
    show();
  }
  pickLevel(root, title, start);
  return () => { alive = false; sc.dispose(); };
}
