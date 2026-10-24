// Word sounds from the CMU Pronouncing Dictionary (dict/sounds.txt, built by tools/make_sounds.py; licence in
// dict/CMUDICT-LICENSE.txt). Turns a word's pronunciations into yes/no questions about how it SOUNDS
// (beats, first sound, last sound, vowel sounds) for Guess What (issue #57) and, later, Category Bingo (#58).
// ARPAbet: vowels carry a stress digit (1 main, 2 secondary, 0 none); consonants have none.

let loading = null;
let table = null; // word -> raw "PH PH|PH PH" text, parsed on demand

export function loadSounds(url = 'dict/sounds.txt') {
  if (!loading) {
    loading = fetch(url)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
      .then((text) => {
        table = new Map();
        for (const line of text.split('\n')) {
          if (!line || line[0] === '#') continue;
          const sp = line.indexOf(' ');
          if (sp > 0) table.set(line.slice(0, sp), line.slice(sp + 1).trim());
        }
        return table;
      });
  }
  return loading;
}

export const knowsSound = (word) => !!table && table.has(word);

// All pronunciations of a word, each an array like ['D', 'R', 'AY1', 'Z']; null if the word isn't in the table.
export function pronunciations(word) {
  const raw = table && table.get(word);
  return raw ? raw.split('|').map((p) => p.split(' ')) : null;
}

const base = (ph) => ph.replace(/\d$/, '');
const isVowel = (ph) => /\d$/.test(ph);
// Unstressed short vowels are reduced to an "uh" (the a in about, the i in because): nobody hears them as
// the vowel of cat or pig, so they don't count. Unstressed long vowels are still heard (the y in puppy).
const HEARD_UNSTRESSED = new Set(['IY', 'OW', 'ER', 'AY', 'EY', 'UW', 'AW', 'OY']);
const heard = (ph) => isVowel(ph) && (!ph.endsWith('0') || HEARD_UNSTRESSED.has(base(ph)));

// The vowel sounds a child would say she hears. AA and AO are one sound for many Americans (cot/caught), so
// they are merged into O. A vowel before R is its own sound (car, corn, hair, hear), not the plain vowel;
// carry/marry/merry sound alike for most Americans, so AE/EH/EY + R are all AIR.
function vowelSounds(phones) {
  const out = new Set();
  phones.forEach((ph, i) => {
    if (!heard(ph)) return;
    const v = base(ph);
    if (phones[i + 1] === 'R') {
      const r = { AA: 'AR', AO: 'OR', OW: 'OR', EH: 'AIR', EY: 'AIR', AE: 'AIR', IH: 'EAR', IY: 'EAR' }[v];
      if (r) return out.add(r);
    }
    out.add(v === 'AO' ? 'AA' : v);
  });
  return out;
}

// Shown as an example word with the matching part marked: 'pre|mark|post'.
export const VOWELS = {
  EY: 'c|a|ke', IY: 'tr|ee|', AY: 'b|i|ke', OW: 'b|oa|t', UW: 'm|oo|n',
  AE: 'c|a|t', EH: 'b|e|d', IH: 'p|i|g', AA: 'h|o|t', AH: 'b|u|g', UH: 'b|oo|k',
  ER: 'h|er|', AW: 'c|ow|', OY: 'b|oy|', AR: 'c|ar|', OR: 'c|or|n', AIR: 'h|air|', EAR: 'h|ear|',
};
export const STARTS = {
  B: '|b|at', CH: '|ch|ip', D: '|d|og', DH: '|th|is', TH: '|th|umb', F: '|f|ish', G: '|g|oat', HH: '|h|at',
  JH: '|j|am', K: '|k|ite', L: '|l|ip', M: '|m|op', N: '|n|est', P: '|p|ig', R: '|r|ug', S: '|s|un',
  SH: '|sh|ip', T: '|t|op', V: '|v|an', W: '|w|eb', Y: '|y|es', Z: '|z|oo',
};
export const ENDS = {
  B: 'tu|b|', CH: 'lun|ch|', D: 'be|d|', F: 'lea|f|', G: 'do|g|', JH: 'pa|ge|', K: 'boo|k|', L: 'bal|l|',
  M: 'dru|m|', N: 'su|n|', NG: 'ri|ng|', P: 'cu|p|', R: 'ca|r|', S: 'bu|s|', SH: 'fi|sh|', T: 'ca|t|',
  TH: 'ba|th|', V: 'fi|ve|', Z: 'bu|zz|', EY: 'd|ay|', IY: 'tr|ee|', AY: 'p|ie|', OW: 'sn|ow|', UW: 'z|oo|',
  ER: 'h|er|', AW: 'c|ow|', OY: 'b|oy|',
};
export const exampleWord = (spec) => spec.replace(/\|/g, '');

// What one pronunciation says for one question family.
function feature(family, phones) {
  if (family === 'beats') return phones.filter(isVowel).length;
  if (family === 'start') return isVowel(phones[0]) ? null : phones[0];
  if (family === 'end') {
    const last = phones[phones.length - 1];
    if (!isVowel(last)) return last;
    return heard(last) ? (base(last) === 'AO' ? 'AA' : base(last)) : null;
  }
  return vowelSounds(phones); // 'vowel'
}
function holds(q, phones) {
  const f = feature(q.family, phones);
  return q.family === 'vowel' ? f.has(q.key) : f === q.key;
}

// true / false, or null when the word's pronunciations disagree (live, read) or it isn't in the table.
export function answer(q, word) {
  const ps = pronunciations(word);
  if (!ps) return null;
  const a = holds(q, ps[0]);
  return ps.every((p) => holds(q, p) === a) ? a : null;
}

export const FAMILIES = [
  { id: 'beats', tab: '👏 Beats', head: 'How many beats? (Clap it!)' },
  { id: 'start', tab: '⬅️ Starts', head: 'Starts with the same sound as…' },
  { id: 'end', tab: '➡️ Ends', head: 'Ends with the same sound as…' },
  { id: 'vowel', tab: '🗣️ Vowel', head: 'Has the vowel sound in…' },
];
const SPECS = { start: STARTS, end: ENDS, vowel: VOWELS };

export function makeQuestion(family, key) {
  if (family === 'beats') {
    const n = key;
    return {
      id: `beats:${n}`, family, key: n, label: '👏'.repeat(n), spec: null,
      ask: (whose) => `Does ${whose} have ${n} ${n === 1 ? 'beat' : 'beats'}?`,
      fits: `have ${n} ${n === 1 ? 'beat' : 'beats'}`,
    };
  }
  const spec = SPECS[family][key];
  const ex = exampleWord(spec);
  const ask = {
    start: (whose) => `Does ${whose} start with the same sound as ${ex}?`,
    end: (whose) => `Does ${whose} end with the same sound as ${ex}?`,
    vowel: (whose) => `Does ${whose} have the vowel sound in ${ex}?`,
  }[family];
  const fits = { start: `start like ${ex}`, end: `end like ${ex}`, vowel: `have the vowel sound in ${ex}` }[family];
  return { id: `${family}:${key}`, family, key, label: ex, spec, ask, fits };
}

// Every question that splits `words` (some yes, some no) and that every one of them answers for sure.
export function splitting(words) {
  const keys = { beats: new Set(), start: new Set(), end: new Set(), vowel: new Set() };
  for (const w of words) {
    for (const p of pronunciations(w) || []) {
      keys.beats.add(feature('beats', p));
      for (const fam of ['start', 'end']) { const k = feature(fam, p); if (k && SPECS[fam][k]) keys[fam].add(k); }
      for (const k of feature('vowel', p)) keys.vowel.add(k);
    }
  }
  const out = [];
  for (const fam of FAMILIES) {
    const ks = fam.id === 'beats' ? [...keys.beats].sort((a, b) => a - b) : Object.keys(SPECS[fam.id]).filter((k) => keys[fam.id].has(k));
    for (const k of ks) {
      const q = makeQuestion(fam.id, k);
      const as = words.map((w) => answer(q, w));
      if (as.every((a) => a !== null) && as.includes(true) && as.includes(false)) out.push(q);
    }
  }
  return out;
}
