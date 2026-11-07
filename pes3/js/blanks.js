// Fill the Blanks engine: one question with something missing. Shared by the three Fill the Blanks cards
// (Spelling, Vocabulary, Math) and Bridge Builder.
//   spell: some letters of a list word are missing; tap them on the keyboard (3 slips on a letter shows it).
//   vocab: the vocab word is missing from one of its example sentences (or from "___ means <meaning>" when it has none);
//          tap one of 4 word tiles (2 slips -> the right tile glows), or with input 'type', type it (2 misses -> shown).
//   math:  one part of "a op b = c" is missing: a number (numpad; 2 misses -> shown) or the sign (2 slips -> glow).
// blank({kind, entry, entries, level|puzzle, input, later, onLeave, done}) -> element. Build it inside a tap (spelling
// and vocab read aloud at once). done({ok, firstTry}) runs once, as soon as it is finished; the caller shows Next.
// Logs itself: spelling logRound, vocab logVocab (both also award()), math award().
import { el, shuffle, hearBar, speak, speakWord, cheer, retry, opKind, logRound, award, keyboard, listenKeys, extraChars } from './util.js';
import { numpad } from './challenge.js';
import { makeQuestion } from './math.js';
import { clozes, distractors, logVocab } from './vocab.js';

export function blank(o) {
  return o.kind === 'spell' ? spellBlank(o) : o.kind === 'vocab' ? vocabBlank(o) : mathBlank(o);
}

function shake(node, later) {
  node.classList.remove('shake');
  void node.offsetWidth; // restart the animation
  node.classList.add('shake');
  later(() => node.classList.remove('shake'), 450);
}

/* ---------- spelling: missing letters ---------- */
function spellBlank({ entry, entries = [], later, onLeave, done }) {
  const word = entry.word;
  const chars = [...word];
  const letterIdx = chars.map((c, i) => (/[a-z]/.test(c) ? i : -1)).filter((i) => i >= 0);
  const count = Math.max(1, Math.min(Math.max(1, letterIdx.length - 1), Math.round(letterIdx.length * 0.4)));
  const blanks = new Set(shuffle(letterIdx).slice(0, count));
  const state = chars.map((c, i) => (blanks.has(i) ? '' : c));
  const blankMiss = {};
  const hinted = new Set();
  let misses = 0;
  let finished = false;

  const nextBlank = () => {
    const i = chars.findIndex((_, k) => blanks.has(k) && state[k] === '');
    return i < 0 ? null : i;
  };
  let sel = nextBlank();
  const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
  const row = el('div', { class: 'slots' });

  function draw() {
    row.replaceChildren(
      ...chars.map((c, i) => {
        if (!blanks.has(i)) return el('div', { class: 'tile fixed' }, c);
        const cls = 'tile slot' + (state[i] ? ' filled' : '') + (i === sel ? ' sel' : '') + (hinted.has(i) ? ' hint' : '');
        return el('button', { class: cls, type: 'button', onclick: () => { if (!finished && !state[i]) { sel = i; draw(); } } }, state[i]);
      }),
    );
  }
  function complete() {
    finished = true;
    logRound(word, misses === 0);
    row.classList.add('good');
    msg.textContent = cheer('spell');
    done({ ok: true, firstTry: misses === 0 });
  }
  function press(ch) {
    if (finished || sel == null) return;
    if (ch === chars[sel]) {
      state[sel] = ch;
      sel = nextBlank();
      msg.textContent = '';
      draw();
      if (sel == null) complete();
      return;
    }
    misses++;
    blankMiss[sel] = (blankMiss[sel] || 0) + 1;
    shake(row, later);
    if (blankMiss[sel] >= 3) {
      state[sel] = chars[sel];
      hinted.add(sel);
      msg.textContent = `That one is “${chars[sel]}”.`;
      sel = nextBlank();
      draw();
      if (sel == null) complete();
    } else {
      msg.textContent = 'Try a different letter.';
    }
  }

  const extras = extraChars(entries);
  onLeave(listenKeys({ onKey: press, extras }));
  draw();
  speakWord(entry);
  return el('div', { class: 'fb-q', 'data-kind': 'spell' },
    el('p', { class: 'prompt' }, 'Which letters are missing?'),
    hearBar(entry), row, msg, keyboard({ onKey: press, extras }));
}

/* ---------- vocabulary: the missing word ---------- */
// What the blank line says, with the word left out: one of its example sentences (at random, never the one
// it had last time if it has more), else the meaning.
const lastLine = new Map(); // word -> sentence index used last
export function vocabLine(entry, rnd = Math.random) {
  const cs = clozes(entry);
  let i = Math.floor(rnd() * cs.length);
  if (cs.length > 1 && i === lastLine.get(entry.word)) i = (i + 1 + Math.floor(rnd() * (cs.length - 1))) % cs.length;
  lastLine.set(entry.word, i);
  const c = cs[i];
  return c ? { ...c, sentence: true, fill: c.token, say: `${c.before} blank ${c.after}` }
    : { before: '', after: ` means “${entry.def}”.`, fill: entry.word, say: `Blank means ${entry.def}` };
}

function vocabBlank({ entry, entries, input = 'tiles', later, onLeave, done }) {
  const line = vocabLine(entry);
  const gap = el('span', { class: 'fb-gap' });
  const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
  const sentence = el('p', { class: 'fb-sentence' }, line.before, gap, line.after);
  let misses = 0;
  let finished = false;
  const sayLine = () => speak(finished ? `${line.before} ${line.fill} ${line.after}` : line.say);

  function finish(ok) {
    finished = true;
    gap.textContent = line.fill;
    gap.classList.add('filled');
    if (ok) sentence.classList.add('good');
    logVocab(entry.word, ok && misses === 0);
    sayLine(); // inside the tap that finished it
    done({ ok, firstTry: ok && misses === 0 });
  }

  let answerBox;
  if (input === 'type') {
    let typed = '';
    const draw = () => { gap.textContent = typed || ' '; };
    const extras = extraChars(entries);
    const onKey = (ch) => { if (!finished && typed.length < line.fill.length + 3) { typed += ch; draw(); } };
    const onBack = () => { if (!finished) { typed = typed.slice(0, -1); draw(); } };
    const check = () => {
      if (finished || !typed) return;
      if (typed === entry.word || typed === line.fill.toLowerCase()) {
        msg.textContent = cheer();
        kb.remove(); checkBtn.remove();
        return finish(true);
      }
      misses++;
      typed = '';
      draw();
      shake(sentence, later);
      if (misses < 2) { msg.textContent = `${retry()} It starts with “${entry.word[0]}”.`; return; }
      msg.textContent = `The word is “${entry.word}”.`;
      kb.remove(); checkBtn.remove();
      finish(false);
    };
    const kb = keyboard({ onKey, onBack, extras });
    const checkBtn = el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓');
    onLeave(listenKeys({ onKey, onBack, onEnter: check, extras }));
    draw();
    answerBox = [kb, checkBtn];
  } else {
    const words = shuffle([entry.word, ...distractors(entry, entries, 'word', 3)]);
    const tiles = words.map((w) => el('button', { class: 'btn fb-tile', type: 'button', 'data-w': w, onclick: (e) => pick(w, e.currentTarget) }, w));
    function pick(w, b) {
      if (finished) return;
      if (w === entry.word) {
        b.classList.remove('glow');
        b.classList.add('right');
        tiles.forEach((t) => { t.disabled = t !== b; });
        msg.textContent = cheer();
        return finish(true);
      }
      misses++;
      b.disabled = true;
      speakWord(w);
      msg.textContent = retry();
      if (misses >= 2) tiles.find((t) => t.dataset.w === entry.word).classList.add('glow');
    }
    gap.textContent = ' ';
    answerBox = [el('div', { class: 'fb-tiles' }, tiles)];
  }

  sayLine();
  return el('div', { class: 'fb-q', 'data-kind': 'vocab' },
    el('p', { class: 'prompt' }, line.sentence ? 'Which word fits?' : 'Which word is it?'),
    el('div', { class: 'fb-line' }, sentence,
      el('button', { class: 'btn speaker fb-hear', type: 'button', 'aria-label': 'Hear it', onclick: sayLine }, '🔊')),
    msg, ...answerBox);
}

/* ---------- math: a missing number or sign ---------- */
export const SIGNS = ['+', '−', '×', '÷'];
const apply = (a, op, b) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b && a % b === 0 ? a / b : NaN);
// Which part is hidden (Jason 2026-10-28): numbers in the sum (addends, factors) most, then the sign, the answer least.
export const HIDE_WEIGHTS = { num: 0.55, op: 0.3, ans: 0.15 };

// {a, op, b, ans, hide: 'a'|'b'|'op'|'ans', signs}
export function mathPuzzle(level, rnd = Math.random) {
  const q = makeQuestion(level);
  const [, a, op, b] = q.text.match(/(\d+)\s*([+−×÷])\s*(\d+)/);
  const r = rnd();
  const hide = r < HIDE_WEIGHTS.num ? (rnd() < 0.5 ? 'a' : 'b') : r < HIDE_WEIGHTS.num + HIDE_WEIGHTS.op ? 'op' : 'ans';
  return { a: +a, op, b: +b, ans: q.answer, hide, signs: level === 'add' ? ['+', '−'] : SIGNS };
}

function mathBlank({ level, puzzle, later, onLeave, done }) {
  const p = puzzle || mathPuzzle(level);
  const want = p.hide === 'op' ? p.op : String(p[p.hide]);
  const text = `${p.a} ${p.op} ${p.b}`;
  const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
  const gap = el('div', { class: 'tile slot sel fb-num' + (p.hide === 'op' ? ' fb-op' : '') }, ' ');
  const part = (k) => (k === p.hide ? gap : el('div', { class: 'tile fixed fb-num' }, k === 'op' ? p.op : String(p[k])));
  const eq = el('div', { class: 'slots fb-eq' }, part('a'), part('op'), part('b'), el('div', { class: 'tile fixed' }, '='), part('ans'));
  let misses = 0;
  let finished = false;
  let offKeys = null;

  const stopKeys = () => { if (offKeys) { offKeys(); offKeys = null; } };
  onLeave(stopKeys);
  function finish(ok, shown = want) {
    finished = true;
    stopKeys();
    gap.textContent = shown;
    gap.classList.remove('sel');
    gap.classList.add('filled');
    if (ok) eq.classList.add('good');
    award();
    done({ ok, firstTry: ok && misses === 0 });
  }

  let answerBox;
  if (p.hide === 'op') {
    // Any sign that makes it true is right (2 + 2 = 4 and 2 × 2 = 4).
    const btns = p.signs.map((s) => el('button', { class: 'btn ans fb-sign', type: 'button', 'data-s': s, onclick: (e) => pick(s, e.currentTarget) }, s));
    function pick(s, b) {
      if (finished) return;
      if (apply(p.a, s, p.b) === p.ans) {
        b.classList.add('right');
        btns.forEach((x) => { x.disabled = x !== b; });
        msg.textContent = cheer(opKind(`1 ${s} 1`));
        return finish(true, s);
      }
      misses++;
      b.disabled = true;
      shake(eq, later);
      msg.textContent = retry();
      if (misses >= 2) btns.find((x) => x.dataset.s === p.op).classList.add('glow');
    }
    offKeys = listenKeys({ extras: ['+', '-', '*', '/'], onKey: (ch) => {
      const s = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷' }[ch];
      const b = s && btns.find((x) => x.dataset.s === s && !x.disabled);
      if (b) pick(s, b);
    } });
    answerBox = [el('div', { class: 'answers fb-signs' }, btns)];
  } else {
    let typed = '';
    const draw = () => { gap.textContent = typed || ' '; };
    const onKey = (ch) => { if (!finished && /\d/.test(ch) && typed.length < want.length + 1) { typed += ch; draw(); } };
    const onBack = () => { if (!finished) { typed = typed.slice(0, -1); draw(); } };
    const check = () => {
      if (finished || !typed) return;
      if (typed === want) {
        msg.textContent = cheer(opKind(text));
        pad.remove(); checkBtn.remove();
        return finish(true);
      }
      misses++;
      typed = '';
      draw();
      shake(eq, later);
      if (misses < 2) { msg.textContent = retry(); return; }
      msg.textContent = `It's ${want}.`;
      pad.remove(); checkBtn.remove();
      finish(false);
    };
    const pad = numpad(onKey, onBack);
    const checkBtn = el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓');
    offKeys = listenKeys({ onKey, onBack, onEnter: check, extras: [...'0123456789'] });
    answerBox = [pad, checkBtn];
  }
  return el('div', { class: 'fb-q', 'data-kind': 'math', 'data-hide': p.hide },
    el('p', { class: 'prompt' }, p.hide === 'op' ? 'Which sign is missing?' : 'Which number is missing?'),
    eq, msg, ...answerBox);
}
