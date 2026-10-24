// One place a game asks for a question by subject and difficulty (issue #61; first used by Crystal Cave).
// A player has a source per subject:
//   spell: 'list' (the weekly words.txt), 'starter' (Dolch sight words), 'grownup' (Baffle's dictionary)
//   math:  a math.js level id (add | t5 | t10 | div)
// tier 1..3 = easier..harder inside that source. Stricter math later = another math source here; games
// only ever ask for (subject, tier), so they don't change.
import { chooseWords, shuffle } from './util.js';
import { makeQuestion } from './math.js';
import { dictionaryReady, dictionaryWords } from './dictionary.js';

export const SPELL_SOURCES = [
  { id: 'list', name: 'Our word list' },
  { id: 'starter', name: 'Starter words' },
  { id: 'grownup', name: 'Grown-up words' },
];

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Dolch sight words (220 "service words", 1936/1948; treated as public domain), by the grade Dolch gave them.
// Words that sound like another word (to/too/two, their/there, ...) are left out: these are spoken with no
// sentence, so she couldn't know which spelling is meant. So are "I" (one letter) and "don't" (apostrophe).
const DOLCH = {
  preprimer: 'a and away big blue can come down find for funny go help here in is it jump little look make me my not one play red run said see the three to two up we where yellow you',
  primer: 'all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran ride saw say she so soon that there they this too under want was well went what white who will with yes',
  first: 'after again an any as ask by could every fly from give going had has her him his how just know let live may of old once open over put round some stop take thank them then think walk were when',
  second: 'always around because been before best both buy call cold does fast first five found gave goes green its made many off or pull read right sing sit sleep tell their these those upon us use very wash which why wish work would write your',
  third: 'about better bring carry clean cut done draw drink eight fall far full got grow hold hot hurt if keep kind laugh light long much myself never only own pick seven shall show six small start ten today together try warm',
};
const SOUND_ALIKE = new Set('a ate eight be blue buy by for four its know no new one our read red right write see so their there to too two which would'.split(' '));
const dolch = (...grades) => grades.flatMap((g) => DOLCH[g].split(' ')).filter((w) => w.length > 1 && !SOUND_ALIKE.has(w));
export const STARTER = { 1: dolch('preprimer', 'primer'), 2: dolch('first', 'second'), 3: dolch('third') };

// Grown-up words: Baffle's dictionary (ENABLE) by length. ENABLE has no word frequencies, so some words are
// rare (a frequency-graded list is issue #62). This skips the oddest-looking ones: q without u, two of j/q/x/z,
// a letter three times running, four consonants in a row, no vowel.
const ODD = /q(?!u)|[jqxz].*[jqxz]|(.)\1\1|[^aeiouy]{4}|^[^aeiouy]*$/;
const GROWN_LEN = { 1: [6, 6], 2: [7, 7], 3: [8, 9] };
let grown = null;
export function grownupWords(tier) {
  if (!dictionaryReady()) return [];
  if (!grown) {
    grown = { 1: [], 2: [], 3: [] };
    for (const w of dictionaryWords()) {
      if (ODD.test(w)) continue;
      for (const t of [1, 2, 3]) if (w.length >= GROWN_LEN[t][0] && w.length <= GROWN_LEN[t][1]) grown[t].push(w);
    }
  }
  return grown[tier] || [];
}

// Her list split by length into three parts (short words = tier 1). A short list just uses all of it.
export function listTier(entries, tier) {
  if (entries.length < 6) return entries;
  const byLen = [...entries].sort((a, b) => a.word.length - b.word.length);
  const third = Math.ceil(byLen.length / 3);
  return byLen.slice((tier - 1) * third, tier * third);
}

// Math by tier inside a level. Each returns {text, answer, hints} like math.js makeQuestion.
const times = (as, b = rnd(2, 10)) => {
  const a = pick(as);
  return Math.random() < 0.5 ? { text: `${a} × ${b}`, answer: a * b, hints: [] } : { text: `${b} × ${a}`, answer: a * b, hints: [] };
};
const divide = (as) => {
  const a = pick(as), b = rnd(2, 10);
  return { text: `${a * b} ÷ ${a}`, answer: b, hints: [] };
};
export function mathQuestion(level, tier = 2) {
  const t = Math.max(1, Math.min(3, tier));
  if (level === 'add') {
    if (t === 1) {
      if (Math.random() < 0.5) { const a = rnd(2, 12), b = rnd(2, 20 - a); return { text: `${a} + ${b}`, answer: a + b, hints: [] }; }
      const a = rnd(11, 20), b = rnd(2, 9);
      return { text: `${a} − ${b}`, answer: a - b, hints: [] };
    }
    if (t === 2) {
      // two digits and one digit, or tens
      if (Math.random() < 0.5) { const a = rnd(20, 89), b = rnd(2, 9); return { text: `${a} + ${b}`, answer: a + b, hints: [] }; }
      const a = rnd(3, 9) * 10, b = rnd(1, a / 10 - 1) * 10;
      return Math.random() < 0.5 ? { text: `${a} − ${b}`, answer: a - b, hints: [] } : { text: `${b} + ${a - b}`, answer: a, hints: [] };
    }
    return makeQuestion('add');
  }
  if (level === 't5') return t === 1 ? times([2, 5]) : t === 2 ? times([3, 4]) : times([2, 3, 4, 5], rnd(6, 10));
  if (level === 'div') return t === 1 ? times([2, 5, 10]) : t === 2 ? divide([2, 3, 4, 5, 10]) : divide([6, 7, 8, 9]);
  return t === 1 ? times([2, 5, 10]) : t === 2 ? times([3, 4, 6]) : times([7, 8, 9]); // t10 and anything unknown
}

// questioner({spell, math, entries}) -> next(subject, tier) -> a problem for challenge.js ask():
//   {kind:'spell', entry, source} | {kind:'math', text, answer, level}
// subject: 'math' | 'spell' | 'either'. Spelling falls back to Starter words when the chosen source is empty
// (no list, or the dictionary not loaded yet), and to math when there is no spelling at all.
export function questioner({ spell = 'list', math = 't10', entries = [] }) {
  const bags = {};
  const spellEntry = (tier) => {
    for (const src of [spell, 'starter']) {
      const key = `${src}:${tier}`;
      if (!bags[key] || !bags[key].length) {
        if (src === 'list') bags[key] = chooseWords(listTier(entries, tier), 10);
        else if (src === 'grownup') bags[key] = shuffle(grownupWords(tier)).slice(0, 10).map((word) => ({ word, sentence: '' }));
        else bags[key] = shuffle(STARTER[tier]).slice(0, 10).map((word) => ({ word, sentence: '' }));
      }
      if (bags[key].length) return { entry: bags[key].pop(), source: src };
    }
    return null;
  };
  return (subject, tier = 2) => {
    const t = Math.max(1, Math.min(3, tier));
    const want = subject === 'either' ? (Math.random() < 0.5 ? 'spell' : 'math') : subject;
    if (want === 'spell') {
      const s = spellEntry(t);
      if (s) return { kind: 'spell', entry: s.entry, source: s.source, tier: t };
    }
    const q = mathQuestion(math, t);
    return { kind: 'math', text: q.text, answer: q.answer, level: math, tier: t };
  };
}
