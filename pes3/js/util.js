// Shared helpers: DOM, word-list parsing, speech, hidden progress tracking,
// on-screen keyboard, and the "one word at a time" round runner.

/* ---------- DOM ---------- */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/* ---------- word list ---------- */
export const isLetters = (w) => /^[a-z]+$/.test(w);
export const extraChars = (entries) =>
  [...new Set(entries.flatMap((e) => [...e.word]).filter((c) => !/[a-z]/.test(c)))];

// words.txt: one word per line. "word | example sentence" is optional.
// Lines starting with # are comments; the FIRST comment line becomes the list title.
export function parseWords(text) {
  let title = '';
  const seen = new Set();
  const words = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (!title) title = line.replace(/^#+\s*/, '');
      continue;
    }
    const [w, ...rest] = line.split('|');
    const word = w.trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push({ word, sentence: rest.join('|').trim() });
  }
  return { title, words };
}

export async function loadWords(url = 'words.txt') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return parseWords(await res.text());
}

/* ---------- hidden progress (only ever shown in the parent panel) ---------- */
const KEY = 'spelling-games.progress.v1';
const blank = () => ({ words: {}, days: {} });

export function getProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p && p.words && p.days ? p : blank();
  } catch {
    return blank();
  }
}
function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: ignore */ }
}
export function clearProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// One call per word per round. firstTry=true means no misses / no hints needed.
export function logRound(word, firstTry) {
  const p = getProgress();
  const w = p.words[word] || (p.words[word] = { c: 0, m: 0 });
  const day = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const d = p.days[day] || (p.days[day] = { c: 0, m: 0 });
  if (firstTry) { w.c++; d.c++; } else { w.m++; d.m++; }
  saveProgress(p);
  award();
}

/* ---------- My Garden (visible, positive-only; separate from the hidden progress) ---------- */
// One point per finished question in any game, right first time or not. Never decreases.
// "Erase history" in the parent panel deliberately leaves the garden alone.
const GARDEN_KEY = 'spelling-games.garden.v1';
export function gardenPoints() {
  try { return Math.max(0, parseInt(JSON.parse(localStorage.getItem(GARDEN_KEY)).pts, 10) || 0); } catch { return 0; }
}
export function award(n = 1) {
  try { localStorage.setItem(GARDEN_KEY, JSON.stringify({ pts: gardenPoints() + n })); } catch { /* ignore */ }
}

// Quietly favour words she has needed help with. Never shown to her.
export function chooseWords(entries, n) {
  const stats = getProgress().words;
  const keyed = entries.map((e) => {
    const s = stats[e.word] || { c: 0, m: 0 };
    const trouble = Math.max(0, Math.min(3, s.m - s.c));
    const weight = 1 + 2 * trouble;
    return { e, key: Math.pow(Math.random(), 1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return shuffle(keyed.slice(0, n).map((k) => k.e));
}

/* ---------- speech (browser built-in text-to-speech) ---------- */
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice = null;
function pickVoice() {
  if (!canSpeak) return;
  const en = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
  voice =
    en.find((v) => /samantha|google us english|aria|ava|allison/i.test(v.name)) ||
    en.find((v) => v.localService) ||
    en[0] ||
    null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice; // Chrome loads voices asynchronously
}

// Must be called synchronously from a tap/click handler for iOS to allow it.
export function speak(text, rate = 0.85) {
  if (!canSpeak) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
/* ---------- pre-generated audio (optional; see tools/make_audio.py) ---------- */
// audio/manifest.json: {"words":[slug,...], "sentences":{slug: sentenceText}}.
// If a recording exists it is played; otherwise (or if playback fails) the browser voice is used.
export const slug = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, '_');
let manifest = { words: [], sentences: {} };
const player = typeof Audio !== 'undefined' ? new Audio() : null;
fetch('audio/manifest.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => { if (m) manifest = { words: m.words || [], sentences: m.sentences || {} }; })
  .catch(() => { /* no recordings: browser voice is used */ });

// Plays a file synchronously inside the tap (needed on iOS). Falls back to speech on any failure.
function playFile(src, fallback) {
  if (!player) return fallback();
  try {
    player.pause();
    if (canSpeak) speechSynthesis.cancel();
    player.onerror = () => fallback();
    player.src = src;
    const p = player.play();
    if (p && p.catch) p.catch(() => fallback());
  } catch { fallback(); }
}

// Accepts an entry {word, sentence} or a plain word string.
export function speakWord(entry) {
  const word = typeof entry === 'string' ? entry : entry.word;
  const fallback = () => speak(word);
  if (manifest.words.includes(slug(word))) playFile(`audio/${slug(word)}.m4a`, fallback);
  else fallback();
}
export function speakSentence(entry) {
  if (!entry.sentence) return speakWord(entry);
  const fallback = () => speak(`${entry.word}. ${entry.sentence}. ${entry.word}.`);
  const s = slug(entry.word);
  if (manifest.sentences[s] === entry.sentence) playFile(`audio/${s}.sentence.m4a`, fallback);
  else fallback();
}

export function hearBar(entry) {
  const bar = el('div', { class: 'hear' });
  bar.append(el('button', { class: 'btn speaker', type: 'button', onclick: () => speakWord(entry) }, '🔊 Hear the word'));
  if (entry.sentence) {
    bar.append(el('button', { class: 'btn', type: 'button', onclick: () => speakSentence(entry) }, '💬 In a sentence'));
  }
  return bar;
}

/* ---------- gentle feedback ---------- */
const CHEERS = ['Nice!', 'You got it!', 'Awesome!', 'Well done!', 'Super!', 'Yes!']; // fit any game
// Praise that names the skill: 'spell', or the math operation from opKind().
const KIND_CHEERS = {
  spell: ['Great spelling!', 'Super speller!', 'Spelled just right!'],
  add: ['Great adding!', 'Super addition!', 'Adding pro!'],
  sub: ['Great subtracting!', 'Super subtraction!', 'Taking away like a pro!'],
  mul: ['Great multiplying!', 'Times tables star!', 'Super multiplication!'],
  div: ['Great dividing!', 'Super division!', 'Dividing pro!'],
};
const RETRIES = ['Almost! Try again.', 'So close! Have another go.', 'Not quite — you can do it!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// cheer() = general praise; cheer(kind) names the skill most of the time.
export const cheer = (kind) => (KIND_CHEERS[kind] && Math.random() < 0.7 ? pick(KIND_CHEERS[kind]) : pick(CHEERS));
// '7 × 8' -> 'mul' (also 'add', 'sub', 'div'); undefined if there is no operator.
export const opKind = (text) => ({ '+': 'add', '−': 'sub', '-': 'sub', '×': 'mul', '÷': 'div' })[(String(text).match(/[+−×÷-]/) || [])[0]];
export const retry = () => pick(RETRIES);

export function celebrate(host) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bits = ['⭐', '✨', '🎉', '🌟'];
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 14; i++) {
    layer.append(
      el('span', { style: `left:${Math.random() * 100}%;animation-delay:${(Math.random() * 0.4).toFixed(2)}s` }, bits[i % bits.length]),
    );
  }
  host.append(layer);
  setTimeout(() => layer.remove(), 2200);
}

export function noWords(root, why = 'This game needs words made only of letters.') {
  root.replaceChildren(el('p', { class: 'note' }, why));
}

/* ---------- keyboards ---------- */
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ABC = 'abcdefghijklmnopqrstuvwxyz';
const VOWELS = 'aeiou';
// ABC layout: a grown-up allows it in the parent panel; then she picks ABC or QWERTY on the keyboard itself.
const ABC_ALLOWED_KEY = 'spelling-games.keyboard.abc'; // 'on' = she may choose
const LAYOUT_KEY = 'spelling-games.keyboard.layout'; // her choice: 'abc' | 'qwerty'
export function abcAllowed() {
  try { return localStorage.getItem(ABC_ALLOWED_KEY) === 'on'; } catch { return false; }
}
export function setAbcAllowed(on) {
  try { localStorage.setItem(ABC_ALLOWED_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}
// QWERTY unless allowed. If allowed and she hasn't picked yet: ABC on a phone (its keys are big enough there,
// QWERTY's aren't), QWERTY on bigger screens.
export function keyboardLayout() {
  if (!abcAllowed()) return 'qwerty';
  let v = null;
  try { v = localStorage.getItem(LAYOUT_KEY); } catch { /* ignore */ }
  if (v === 'abc' || v === 'qwerty') return v;
  return typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches ? 'abc' : 'qwerty';
}
function setKeyboardLayout(v) {
  try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* ignore */ }
}

// On-screen keyboard for spelling answers: no autocorrect, no predictive text, big touch targets.
// QWERTY rows, or (if allowed and chosen) a-z in a grid with lightly tinted vowels. Switching layout
// keeps per-key marks (Wordal's data-s colours).
export function keyboard({ onKey, onBack, extras = [] }) {
  const kb = el('div', { class: 'kb' });
  function build() {
    const layout = keyboardLayout();
    const marks = {};
    kb.querySelectorAll('.key[data-s]').forEach((k) => { marks[k.textContent] = k.dataset.s; });
    const key = (ch) => {
      const b = el('button', { class: `key${layout === 'abc' && VOWELS.includes(ch) ? ' vow' : ''}`, type: 'button', onclick: () => onKey(ch) }, ch);
      if (marks[ch]) b.dataset.s = marks[ch];
      return b;
    };
    const back = onBack ? el('button', { class: 'key wide', type: 'button', 'aria-label': 'Delete', onclick: onBack }, '⌫') : null;
    const parts = [];
    if (abcAllowed()) {
      const pick = (v, label) => el('button', { class: 'kb-pick', type: 'button', 'data-layout': v, 'aria-pressed': String(layout === v),
        onclick: () => { if (keyboardLayout() !== v) { setKeyboardLayout(v); build(); } } }, label);
      parts.push(el('div', { class: 'kb-switch', role: 'group', 'aria-label': 'Keyboard letters' }, pick('abc', 'ABC'), pick('qwerty', 'QWERTY')));
    }
    if (layout === 'abc') {
      parts.push(el('div', { class: 'kb-grid' }, [...ABC].map(key), extras.map(key), back));
    } else {
      ROWS.forEach((row, i) => parts.push(el('div', { class: 'kb-row' }, [...row].map(key), i === 2 ? [...extras.map(key), back] : null)));
    }
    kb.className = `kb kb-${layout}`;
    kb.replaceChildren(...parts);
  }
  build();
  return kb;
}

// Free text that isn't a spelling answer (a robot's name, what a sprite says): the device's own
// keyboard, which is big enough on a phone. Autocorrect is off. Spelling answers must keep the
// on-screen keyboard above (autocorrect would fix the word for her). Font >= 16px so iOS doesn't zoom.
export function textInput({ value = '', max = 16, placeholder = '', label, capitalize = 'sentences' } = {}) {
  return el('input', { class: 'text-in', type: 'text', maxlength: String(max), value, placeholder, 'aria-label': label,
    autocomplete: 'off', autocorrect: 'off', autocapitalize: capitalize, spellcheck: 'false', enterkeyhint: 'done' });
}

// Physical keyboard (Chromebook / iPad keyboard). Returns an unsubscribe function.
export function listenKeys({ onKey, onBack, onEnter, extras = [] }) {
  const h = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { if (onBack) { onBack(); e.preventDefault(); } }
    else if (e.key === 'Enter') { if (onEnter) { onEnter(); e.preventDefault(); } }
    else if (e.key.length === 1) {
      const ch = e.key.toLowerCase();
      if (/[a-z]/.test(ch) || extras.includes(ch)) onKey(ch);
    }
  };
  document.addEventListener('keydown', h);
  return () => document.removeEventListener('keydown', h);
}

/* ---------- timers + cleanup scope ---------- */
export function scope() {
  const timers = [];
  const fns = [];
  let alive = true;
  return {
    later(fn, ms) {
      const t = setTimeout(() => { if (alive) fn(); }, ms);
      timers.push(t);
      return t;
    },
    onLeave(fn) { fns.push(fn); },
    dispose() {
      alive = false;
      timers.forEach(clearTimeout);
      fns.splice(0).forEach((f) => f());
    },
  };
}

export function finish(root, api, again) {
  root.replaceChildren(
    el('div', { class: 'finish' },
      el('div', { class: 'big-emoji' }, '🎉'),
      el('h2', {}, 'All done — great work!'),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary big', type: 'button', onclick: again }, 'Play again'),
        el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
      ),
    ),
  );
  celebrate(root);
}

// Runs a game one word at a time. renderRound({entry,next,later,onLeave,root}) draws a round.
// `next` must be called straight from a click handler so speech is allowed on iOS.
export function rounds(root, entries, api, renderRound, { perRound = 10 } = {}) {
  let sc = scope();
  let alive = true;
  function play() {
    const queue = chooseWords(entries, perRound);
    let i = 0;
    const next = () => {
      sc.dispose();
      sc = scope();
      if (!alive) return;
      if (i >= queue.length) return finish(root, api, play);
      const entry = queue[i++];
      root.replaceChildren();
      renderRound({ entry, next, root, later: sc.later, onLeave: sc.onLeave });
    };
    next();
  }
  play();
  return () => { alive = false; sc.dispose(); };
}
