// Vocabulary list (vocab.txt) + its own hidden progress. Shared by the vocabulary games.
// vocab.txt: one word per line, "word | part of speech | definition | sentence | sentence ..."; all extra parts are
// optional (leave one empty to skip it: "predict | | to say what will happen | I predict rain."). Any number of
// example sentences; Fill the Blanks picks one each time.
// With only two parts, the second is a part of speech if it looks like one ("noun", "adj."), else a definition.
// Lines starting with # are comments; the FIRST one becomes the list title (like words.txt).
import { shuffle, award } from './util.js';

// The four the quiz offers, plus the rest she might meet. Abbreviations map to the full name.
export const POS = ['noun', 'verb', 'adjective', 'adverb'];
const POS_NAMES = {
  n: 'noun', noun: 'noun', v: 'verb', verb: 'verb', adj: 'adjective', adjective: 'adjective', adv: 'adverb', adverb: 'adverb',
  pron: 'pronoun', pronoun: 'pronoun', prep: 'preposition', preposition: 'preposition', conj: 'conjunction', conjunction: 'conjunction',
  interj: 'interjection', interjection: 'interjection',
};
export const posName = (s) => POS_NAMES[String(s || '').trim().toLowerCase().replace(/\.$/, '')] || '';

export function parseVocab(text) {
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
    const [w, ...rest] = line.split('|').map((s) => s.trim());
    const word = w.toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    let pos = '', def = '', sentences = [];
    if (rest.length >= 2) { pos = posName(rest[0]) || rest[0].toLowerCase(); def = rest[1]; sentences = rest.slice(2).filter(Boolean); }
    else if (rest.length === 1) { if (posName(rest[0])) pos = posName(rest[0]); else def = rest[0]; }
    words.push({ word, pos, def, sentences });
  }
  return { title, words };
}

// A missing vocab.txt is not an error: the vocabulary games just say to add words.
export async function loadVocab(url = 'vocab.txt') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? parseVocab(await res.text()) : { title: '', words: [] };
  } catch {
    return { title: '', words: [] };
  }
}

// One example sentence split around the vocab word: {before, token, after}, or null if the word isn't in it.
// token = the form used ("gathered" for gather, "studies" for study): starts with the word, or with the word minus
// a final y/e ("stud", "smil"), as a whole word.
export function cloze(e, sentence) {
  if (!sentence) return null;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const stem of [e.word, e.word.replace(/[ye]$/, '')]) {
    if (stem.length < 3 && stem !== e.word) continue;
    const m = new RegExp(`\\b${esc(stem)}[a-z']*`, 'i').exec(sentence);
    if (m) return { before: sentence.slice(0, m.index), token: m[0], after: sentence.slice(m.index + m[0].length) };
  }
  return null;
}
// Every usable sentence of a word, split (sentences without the word are left out).
export const clozes = (e) => (e.sentences || []).map((s) => cloze(e, s)).filter(Boolean);
// Fill the Blanks can ask it: a usable sentence, or a meaning for the "___ means" clue.
export const canBlank = (e) => !!e.def || clozes(e).length > 0;

// Up to n other values of `key` ('word' or 'def') for wrong choices: same part of speech first (harder to guess).
export function distractors(e, entries, key, n = 3) {
  const pool = shuffle(entries.filter((x) => x !== e && x[key] && x[key] !== e[key]));
  const seen = new Set([e[key]]);
  const out = [];
  for (const x of [...pool.filter((x) => x.pos && x.pos === e.pos), ...pool]) {
    if (out.length >= n) break;
    if (!seen.has(x[key])) { seen.add(x[key]); out.push(x[key]); }
  }
  return out;
}

/* ---------- hidden progress (kept apart from spelling's, shown only in the parent panel) ---------- */
const KEY = 'spelling-games.vocab.progress.v1';
export function vocabProgress() {
  try { const p = JSON.parse(localStorage.getItem(KEY)); return p && p.words ? p : { words: {} }; } catch { return { words: {} }; }
}
export function clearVocabProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
// One call per question/pair. Also +1 garden point, right or not (like logRound).
export function logVocab(word, firstTry) {
  const p = vocabProgress();
  const w = p.words[word] || (p.words[word] = { c: 0, m: 0 });
  if (firstTry) w.c++; else w.m++;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
  award();
}

// Like chooseWords: quietly favour words she has needed help with.
export function chooseVocab(entries, n) {
  const stats = vocabProgress().words;
  return shuffle(entries.map((e) => {
    const s = stats[e.word] || { c: 0, m: 0 };
    return { e, key: Math.pow(Math.random(), 1 / (1 + 2 * Math.max(0, Math.min(3, s.m - s.c)))) };
  }).sort((a, b) => b.key - a.key).slice(0, n).map((k) => k.e));
}
