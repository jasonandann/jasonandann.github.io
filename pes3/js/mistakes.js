// Believable mistakes, for wrong answers that look like a real child's slip (never random gibberish).
// misspellings(): the wrong pads in Lily Pad River. spellingSlip() / mathSlip(): the computer player's
// mistakes in Battle Buddies. Real words (dictionary) and other list words are never offered as misspellings.
import { shuffle } from './util.js';
import { inDictionary } from './dictionary.js';

const VOWELS = 'aeiou';
const VOWEL_SWAPS = { a: 'e', e: 'ia', i: 'ey', o: 'u', u: 'o' };

// Plausible misspellings of `word`: y/ie/ies mix-ups, doubled or undoubled letters,
// a swapped vowel, two letters swapped, silent e. Never a real word or another list word.
export function misspellings(word, avoid = new Set()) {
  const near = new Set(); // the classic traps, shown first
  const far = new Set();
  const add = (set, w) => {
    if (w && w !== word && w.length > 1 && !avoid.has(w) && !inDictionary(w)) set.add(w);
  };
  if (word.endsWith('ies')) {
    const st = word.slice(0, -3);
    ['ys', 'yes', 'eys', 'ees'].forEach((end) => add(near, st + end));
  } else if (word.endsWith('ied')) {
    const st = word.slice(0, -3);
    ['yed', 'eid', 'ide'].forEach((end) => add(near, st + end));
  } else if (word.endsWith('y')) {
    const st = word.slice(0, -1);
    ['ie', 'ey', 'ee'].forEach((end) => add(near, st + end));
  }
  for (let i = 1; i < word.length; i++) {
    const c = word[i];
    if (word[i - 1] === c) add(near, word.slice(0, i) + word.slice(i + 1)); // puppy -> pupy
    else if (/[bcdfglmnprst]/.test(c) && word[i + 1] !== c && i < word.length - 1) add(far, word.slice(0, i + 1) + c + word.slice(i + 1)); // lady -> laddy
  }
  for (let i = 0; i < word.length; i++) {
    for (const v of VOWEL_SWAPS[word[i]] || '') add(far, word.slice(0, i) + v + word.slice(i + 1));
    // two vowels swapped (friend -> freind, because -> becuase); other swaps look like typos, not spelling
    const pair = word.slice(i, i + 2);
    if (/^[aeiou]{2}$/.test(pair) && pair[0] !== pair[1]) add(far, word.slice(0, i) + pair[1] + pair[0] + word.slice(i + 2));
  }
  if (word.endsWith('e')) add(far, word.slice(0, -1));
  else if (!(VOWELS + 'ys').includes(word.at(-1))) add(far, word + 'e');
  // Up to two classic traps first, then the rest, so the pads aren't all the same kind of slip.
  const nearAll = shuffle([...near]);
  const rest = shuffle([...far].filter((w) => !near.has(w)));
  return [...nearAll.slice(0, 2), ...rest, ...nearAll.slice(2)];
}

// Spelling it the way it sounds: the commonest kind of mistake in young children's spelling
// (phonetically plausible, wrong spelling pattern). [pattern, replacement]; each match is tried on its own.
const SOUNDS_LIKE = [
  [/ph/, 'f'], [/ck/, 'k'], [/c(?=[aou])/, 'k'], [/[ts]ion$/, 'shun'], [/ture$/, 'cher'],
  [/ight/, 'ite'], [/igh/, 'i'], [/ough/, 'uff'], [/augh/, 'af'], [/ould/, 'ood'], [/cause$/, 'cuz'], [/se$/, 'z'],
  [/^kn/, 'n'], [/^wr/, 'r'], [/^wh/, 'w'], [/mb$/, 'm'], [/dge/, 'ge'], [/tch/, 'ch'], [/qu/, 'kw'],
  [/ou/, 'ow'], [/ow/, 'ou'], [/ea/, 'ee'], [/ee/, 'ea'], [/ai/, 'ay'], [/ay/, 'ai'], [/oa/, 'o'], [/oo/, 'u'],
  [/au/, 'aw'], [/aw/, 'au'], [/aid/, 'ed'], [/ain$/, 'en'], [/eo/, 'ee'], [/ir/, 'ur'], [/er/, 'ur'], [/ur/, 'er'],
  [/le$/, 'el'], [/al$/, 'le'], [/ce$/, 'se'], [/a([^aeiou])e$/, 'ai$1'], [/o([^aeiou])e$/, 'oa$1'],
];

export function soundsLike(word, avoid = new Set()) {
  const out = new Set();
  for (const [re, rep] of SOUNDS_LIKE) {
    const g = new RegExp(re.source, 'g');
    for (const m of word.matchAll(g)) {
      const w = word.slice(0, m.index) + word.slice(m.index).replace(re, rep); // the first match from here is this one
      if (w !== word && w.length > 1 && !avoid.has(w) && !inDictionary(w)) out.add(w);
    }
  }
  return [...out];
}

// One believable misspelling: usually a sounds-like one, else a classic trap, else a dropped letter.
export function spellingSlip(word, avoid = new Set(), rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const sounds = soundsLike(word, avoid);
  const traps = misspellings(word, avoid).slice(0, 4);
  if (sounds.length && (!traps.length || rnd() < 0.6)) return pick(sounds);
  if (traps.length) return pick(traps);
  for (let i = 1; i < word.length - 1; i++) {
    const w = word.slice(0, i) + word.slice(i + 1);
    if (!inDictionary(w) && !avoid.has(w)) return w;
  }
  return word + word.at(-1);
}

// A believable wrong answer to 'a op b' (the text from math.js makeQuestion): forgetting to carry,
// borrowing slips, a times-table neighbour, the wrong operation, counting one off. These are the
// well-known "buggy" procedures (Brown & Burton 1978) and table-neighbour errors (Campbell & Graham 1985).
// Returns {value, why}; `why` is a kind sentence about what went wrong, shown after the computer's turn.
export function mathSlip(text, answer, rnd = Math.random) {
  const [, sa, op, sb] = String(text).match(/(\d+)\s*([+−×÷-])\s*(\d+)/) || [];
  const a = +sa, b = +sb;
  const t = (n) => Math.floor(n / 10), o = (n) => n % 10;
  const opts = []; // [weight, value, why]
  const add = (w, value, why) => { if (Number.isInteger(value) && value >= 0 && value !== answer) opts.push([w, value, why]); };
  if (op === '+') {
    if (o(a) + o(b) >= 10) {
      add(5, (t(a) + t(b)) * 10 + o(o(a) + o(b)), 'it forgot to carry the 1');
      add(1, +`${t(a) + t(b)}${o(a) + o(b)}`, `it wrote all of ${o(a) + o(b)} in the ones place instead of carrying`);
    }
    add(2, a > b ? a - b : -1, 'it took away instead of adding');
    add(2, answer + 10, 'it carried one ten too many');
    add(2, answer + 1, 'it counted on one too many');
    add(2, answer - 1, 'it counted on one too few');
  } else if (op === '−' || op === '-') {
    if (o(a) < o(b)) {
      add(4, (t(a) - t(b)) * 10 + (o(b) - o(a)), 'it took the smaller number from the bigger one in the ones place');
      add(3, (t(a) - t(b)) * 10 + (o(a) + 10 - o(b)), 'it borrowed a ten but forgot to take it away from the tens');
    }
    add(1, a + b, 'it added instead of taking away');
    add(2, answer + 1, 'it counted back one too few');
    add(2, answer - 1, 'it counted back one too many');
  } else if (op === '×') {
    add(3, a * (b + 1), `it mixed it up with ${a} × ${b + 1}`);
    add(3, a * (b - 1), `it mixed it up with ${a} × ${b - 1}`);
    add(2, (a + 1) * b, `it mixed it up with ${a + 1} × ${b}`);
    add(2, (a - 1) * b, `it mixed it up with ${a - 1} × ${b}`);
    add(1, a + b, 'it added instead of multiplying');
  } else if (op === '÷') {
    add(3, answer + 1, `${b} × ${answer + 1} is ${b * (answer + 1)}, a bit too big`);
    add(3, answer - 1, `${b} × ${answer - 1} is ${b * (answer - 1)}, a bit too small`);
    if (b !== answer) add(1, b, `it wrote the number it was sharing by`);
    add(1, a - b, 'it took away instead of dividing');
  }
  if (!opts.length) return { value: answer + 1, why: 'it counted one too many' };
  let r = rnd() * opts.reduce((s, x) => s + x[0], 0);
  for (const [w, value, why] of opts) if ((r -= w) < 0) return { value, why };
  const [, value, why] = opts[opts.length - 1];
  return { value, why };
}
