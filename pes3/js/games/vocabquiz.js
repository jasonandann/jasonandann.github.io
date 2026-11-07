// Word Wise (vocabulary multiple choice), 10 questions of three kinds:
//   def  = a word is shown; pick its meaning (other meanings of the same part of speech first)
//   pos  = a word is shown; pick its part of speech (noun, verb, adjective, adverb)
//   word = a meaning is shown; pick the word
// ⚙️ Options: Mix (default) or one kind. A miss greys that choice; after 2 misses the answer glows.
// The answer stays up with the whole entry and a Next tap (so the next question can be read aloud on iOS).
import { el, shuffle, speak, speakWord, cheer, retry, scope, finish } from '../util.js';
import { POS, posName, chooseVocab, logVocab, distractors } from '../vocab.js';
import { choice, openOptions, cornerGear } from '../options.js';

const COUNT = 10;
const CHOICES = 4;
const OPT_KEY = 'spelling-games.vquiz.options';
const KINDS = [['mix', 'Mix'], ['def', 'Meanings'], ['pos', 'Parts of speech'], ['word', 'Words']];
function loadOpts() {
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY)); return { kind: KINDS.some(([v]) => v === o?.kind) ? o.kind : 'mix' }; } catch { return { kind: 'mix' }; }
}
function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* ignore */ } }

// Kinds this entry can be asked as, given the whole list.
export function kindsFor(e, entries) {
  const k = [];
  if (e.def && entries.filter((x) => x.def && x.def !== e.def).length) k.push('def', 'word');
  if (posName(e.pos)) k.push('pos');
  return k;
}

// {kind, e, prompt, shown, answer, choices}
export function makeQuestion(e, kind, entries) {
  if (kind === 'pos') {
    const answer = posName(e.pos);
    const wrong = shuffle(POS.filter((p) => p !== answer)).slice(0, CHOICES - 1);
    return { kind, e, prompt: 'What part of speech is this word?', shown: e.word, answer, choices: shuffle([answer, ...wrong]) };
  }
  const key = kind === 'def' ? 'def' : 'word';
  return {
    kind, e, prompt: kind === 'def' ? 'What does this word mean?' : 'Which word has this meaning?',
    shown: kind === 'def' ? e.word : e.def, answer: e[key], choices: shuffle([e[key], ...distractors(e, entries.filter((x) => x.def), key, CHOICES - 1)]),
  };
}

// COUNT questions (fewer for a short list), no word twice. Mix: each question takes the kind used least so far.
export function makeQuestions(entries, kind, n = COUNT) {
  const able = entries.filter((e) => kindsFor(e, entries).some((k) => kind === 'mix' || k === kind));
  const used = { def: 0, pos: 0, word: 0 };
  return chooseVocab(able, Math.min(n, able.length)).map((e) => {
    let k = kind;
    if (kind === 'mix') {
      const ks = shuffle(kindsFor(e, entries));
      k = ks.reduce((a, b) => (used[b] < used[a] ? b : a));
    }
    used[k]++;
    return makeQuestion(e, k, entries);
  });
}

export function mount(root, entries, api) {
  let sc = scope();
  let opts = loadOpts();
  let current = null; // the question on screen

  function play() {
    current = null;
    const qs = makeQuestions(entries, opts.kind);
    if (!qs.length) {
      root.replaceChildren(gear(), el('p', { class: 'note' }, opts.kind === 'pos'
        ? 'Add parts of speech to vocab.txt (word | noun | meaning) to play this one.'
        : 'Word Wise needs at least 2 words with meanings in vocab.txt.'));
      return;
    }
    let i = 0;
    const next = () => (i < qs.length ? show(qs[i], i++, qs.length, next) : finish(root, api, play));
    next();
    if (current) sayShown(current); // play() always runs inside a tap (menu, Play again, Options Done): speech is allowed on iOS
  }

  // Reads the shown text: the word, or (for 'word' questions) the meaning.
  const sayShown = (q) => (q.kind === 'word' ? speak(q.shown) : speakWord(q.e.word));

  function show(q, i, count, next) {
    sc.dispose();
    sc = scope();
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const after = el('div', { class: 'vq-after' });
    let misses = 0;
    let locked = false;
    const btns = q.choices.map((c) => el('button', {
      class: `btn vq-choice${q.kind === 'def' ? ' long' : ''}`, type: 'button', 'data-c': c,
      onclick: (ev) => pick(c, ev.currentTarget),
    }, c));
    function pick(c, b) {
      if (locked) return;
      if (c !== q.answer) {
        b.disabled = true;
        misses++;
        msg.textContent = retry();
        if (misses >= 2) btns.find((x) => x.dataset.c === q.answer).classList.add('glow');
        return;
      }
      locked = true;
      b.classList.remove('glow');
      b.classList.add('right');
      btns.forEach((x) => { if (x !== b) x.disabled = true; });
      logVocab(q.e.word, misses === 0);
      msg.textContent = cheer();
      const { word, pos, def } = q.e;
      after.replaceChildren(
        el('p', { class: 'vq-entry' }, el('b', {}, word), pos ? el('i', {}, ` (${pos})`) : null, def ? `: ${def}` : null),
        el('button', { class: 'btn primary big vq-next', type: 'button', onclick: () => {
          next();
          if (current !== q) sayShown(current); // read the new question inside this tap (iOS)
        } }, i + 1 < count ? 'Next ➜' : 'Finish'),
      );
    }
    root.replaceChildren(
      gear(),
      el('p', { class: 'prompt v-prompt' }, q.prompt),
      el('div', { class: `vq-shown vq-${q.kind}` },
        el('span', {}, q.shown),
        el('button', { class: 'btn speaker vq-hear', type: 'button', 'aria-label': 'Hear it', onclick: () => sayShown(q) }, '🔊')),
      el('div', { class: 'vq-choices' }, btns),
      msg,
      after,
      el('p', { class: 'label' }, `${i + 1} of ${count}`),
    );
    current = q;
  }

  function gear() {
    return cornerGear(() => {
      const before = opts.kind;
      const pop = openOptions({
        title: '⚙️ Word Wise',
        body: (redraw) => [choice('Questions', opts.kind, KINDS, (v) => { opts = { ...opts, kind: v }; saveOpts(opts); redraw(); })],
        onClose: () => { if (opts.kind !== before) play(); },
      });
      sc.onLeave(pop.dispose);
    });
  }

  play();
  return () => sc.dispose();
}
