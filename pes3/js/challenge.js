// One question with an answer box, shared by Battle Buddies and Study Quest.
// Spelling: hear the word, type it on the on-screen keyboard. Math: type the number on a number pad.
// Build it inside a tap: a spelling question speaks its word straight away (iOS only allows that in a tap).
import { el, chooseWords, hearBar, speakSentence, cheer, retry, logRound, award, keyboard, listenKeys, extraChars, opKind } from './util.js';
import { makeQuestion } from './math.js';

const DIGITS = [...'0123456789'];

// Returns next(kind?) -> {kind:'spell', entry} | {kind:'math', text, answer}. mode: spelling | math | both.
// Spelling words come from a bag refilled by chooseWords (which quietly favours missed words).
export function problems(entries, mode, level) {
  const bag = [];
  const word = () => {
    if (!bag.length) bag.push(...chooseWords(entries, Math.min(10, entries.length)));
    return bag.pop();
  };
  return (kind) => {
    const k = kind || (mode === 'spelling' ? 'spell' : mode === 'math' || !entries.length ? 'math' : Math.random() < 0.5 ? 'spell' : 'math');
    if (k === 'spell' && entries.length) return { kind: 'spell', entry: word() };
    const q = makeQuestion(level);
    return { kind: 'math', text: q.text, answer: q.answer };
  };
}

export function numpad(onKey, onBack) {
  const kb = el('div', { class: 'kb numpad' });
  [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '⌫']].forEach((row) => {
    const r = el('div', { class: 'kb-row' });
    row.forEach((k) =>
      r.append(el('button', { class: 'key' + (k === '⌫' ? ' wide' : ''), type: 'button', 'aria-label': k === '⌫' ? 'Delete' : k, onclick: () => (k === '⌫' ? onBack() : onKey(k)) }, k)),
    );
    kb.append(r);
  });
  return kb;
}

// ask({problem, entries, later, onLeave, done, prompt?, second?, okText?, record?}) -> element.
// problem.prompt (optional) replaces the default line above the question (a word problem's story; the
// sum itself is then hidden and the box shows "? <problem.unit>").
// done({ok, firstTry}) runs once: ~0.9 s after a right answer, or from the OK tap after the answer is shown.
// Logs like the other games: logRound for a spelling word (which also awards a garden point), award() for math.
// record: 'all' (that logging), 'garden' (a garden point only: a word that isn't from her list), 'none' (someone
// else is answering, e.g. a pass-and-play player in Crystal Cave).
export function ask({ problem, entries = [], later, onLeave, done, prompt, second = true, okText = 'OK ➜', record = 'all' }) {
  const isMath = problem.kind === 'math';
  const answer = isMath ? String(problem.answer) : problem.entry.word;
  const extras = isMath ? DIGITS : extraChars(entries);
  let typed = '';
  let misses = 0;
  let finished = false;
  let called = false;
  const finishOnce = (r) => { if (!called) { called = true; done(r); } };
  const log = (firstTry) => {
    if (record === 'none') return;
    if (isMath || record === 'garden') award(); else logRound(answer, firstTry);
  };

  const shown = el('div', { class: 'typed' });
  const note = el('div', { class: 'msg', 'aria-live': 'polite' });
  const draw = () => { shown.textContent = typed || ' '; };
  let offKeys = null;
  const stop = () => {
    finished = true;
    if (offKeys) { offKeys(); offKeys = null; }
    kb.remove();
    checkBtn.remove();
  };
  const onKey = (ch) => {
    if (finished) return;
    if (isMath && !/\d/.test(ch)) return;
    if (typed.length < answer.length + 2) { typed += ch; draw(); }
  };
  const onBack = () => { if (!finished) { typed = typed.slice(0, -1); draw(); } };

  function check() {
    if (finished || !typed) return;
    if (typed === answer) {
      stop();
      log(misses === 0);
      shown.classList.add('good');
      note.textContent = cheer(isMath ? opKind(problem.text) : 'spell');
      later(() => finishOnce({ ok: true, firstTry: misses === 0 }), 900);
      return;
    }
    misses++;
    typed = '';
    draw();
    if (second && misses === 1) { note.textContent = retry(); return; }
    stop();
    log(false);
    note.textContent = isMath ? `The answer is ${answer}.` : `It's spelled ${answer}.`;
    box.append(el('button', { class: 'btn primary big', type: 'button', onclick: () => finishOnce({ ok: false, firstTry: false }) }, okText));
  }

  const kb = isMath ? numpad(onKey, onBack) : keyboard({ onKey, onBack, extras });
  const checkBtn = el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓');
  const line = prompt || problem.prompt || (isMath ? null : 'Listen, then spell the word.');
  const box = el('div', { class: 'ch-q' },
    line ? el('p', { class: 'prompt' }, line) : null,
    isMath ? el('div', { class: 'bigword' }, problem.prompt ? `? ${problem.unit || ''}`.trim() : `${problem.text} = ?`) : hearBar(problem.entry),
    shown, note, kb, checkBtn,
  );
  offKeys = listenKeys({ onKey, onBack, onEnter: check, extras });
  onLeave(() => { if (offKeys) { offKeys(); offKeys = null; } });
  draw();
  if (!isMath) speakSentence(problem.entry);
  return box;
}
