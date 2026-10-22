// Lily Pad River: lily pads float down the river, each carrying an answer.
// Tap the pad with the right answer and the frog hops on. Questions: spelling, math, or both.
// Pads loop forever and wrong pads just sink a little, so nothing is ever lost or missed.
import { el, shuffle, chooseWords, hearBar, speakWord, cheer, logRound, award, celebrate, scope, finish } from '../util.js';
import { LEVELS, savedLevel, saveLevel, makeQuestion, choices as mathChoices, nudge } from '../math.js';
import { loadDictionary, inDictionary } from '../dictionary.js';

const COUNT = 10;
const MODE_KEY = 'spelling-games.river.mode';
const LANE_SPEED = [40, 30]; // px per second; the lower lane drifts a little slower
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

function wordChoices(entry, entries) {
  const list = new Set(entries.map((e) => e.word));
  const wrong = misspellings(entry.word, list).slice(0, 3);
  // Very short words may not have 3 good misspellings: top up with other list words.
  for (const e of shuffle(entries)) if (wrong.length < 3 && e.word !== entry.word) wrong.push(e.word);
  return shuffle([entry.word, ...wrong]);
}

const readMode = () => {
  try { const m = localStorage.getItem(MODE_KEY); if (['spelling', 'math', 'both'].includes(m)) return m; } catch { /* ignore */ }
  return 'both';
};

export function mount(root, entries, api) {
  loadDictionary(); // used to keep real words out of the misspellings; harmless if it is still loading
  const canSpell = entries.length > 0;
  const settings = { mode: canSpell ? readMode() : 'math', level: savedLevel() };
  let sc = scope();
  let alive = true;

  function setup() {
    const seg = (label, key, opts, onPick) =>
      el('div', { class: 'seg' },
        el('p', { class: 'label' }, label),
        el('div', { class: 'row' },
          opts.map(([val, text]) =>
            el('button', {
              class: 'btn' + (settings[key] === val ? ' primary' : ''), type: 'button',
              'aria-pressed': String(settings[key] === val),
              onclick: () => { settings[key] = val; onPick(val); setup(); },
            }, text),
          ),
        ),
      );
    root.replaceChildren(
      el('div', { class: 'zt-setup' },
        el('h2', {}, '🐸 Lily Pad River'),
        el('p', { class: 'prompt' }, 'Lily pads float down the river. Help the frog hop onto the one with the right answer!'),
        canSpell ? seg('Questions', 'mode', [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']],
          (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } }) : null,
        settings.mode !== 'spelling' ? seg('Math', 'level', LEVELS.map((l) => [l.id, l.name]), saveLevel) : null,
        el('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Start!'),
      ),
    );
  }

  // Build the 10 questions up front so the round knows whether the next one needs a tap to speak.
  function makeRound() {
    const words = canSpell ? chooseWords(entries, Math.min(COUNT, entries.length)) : [];
    const seen = new Set();
    const qs = [];
    for (let i = 0, guard = 0; qs.length < COUNT && guard < 400; guard++) {
      const kind = settings.mode === 'both' ? (Math.random() < 0.5 ? 'spell' : 'math') : settings.mode === 'spelling' ? 'spell' : 'math';
      if (kind === 'spell') {
        const entry = words[i++ % words.length];
        qs.push({ kind, entry, answer: entry.word, choices: wordChoices(entry, entries) });
      } else {
        const q = makeQuestion(settings.level);
        if (seen.has(q.text)) continue;
        seen.add(q.text);
        qs.push({ kind, text: q.text, answer: q.answer, choices: mathChoices(q) });
      }
    }
    return qs;
  }

  function start() {
    const qs = makeRound();
    let n = 0;
    const show = () => {
      sc.dispose();
      sc = scope();
      if (!alive) return;
      if (n >= qs.length) return finish(root, api, start);
      root.replaceChildren();
      drawQ(qs[n], n, qs.length, () => { n++; show(); }, qs[n + 1]);
    };
    show();
  }

  function drawQ(q, i, count, done, upcoming) {
    const { later, onLeave } = sc;
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const frog = el('div', { class: 'lp-frog' }, '🐸');
    const river = el('div', { class: 'lp-river' });
    const lanes = [el('div', { class: 'lp-lane' }), el('div', { class: 'lp-lane' })];
    // Speech needs a tap on iPad, so a spelling question that comes next waits for "Next".
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: () => done() }, 'Next ➜');
    const anims = [];
    let misses = 0;
    let locked = false;

    function tap(pad) {
      if (locked || pad.disabled) return;
      if (String(q.answer) === pad.dataset.v) {
        locked = true;
        anims.forEach((a) => a.pause());
        pad.classList.add('right');
        pad.append(frog);
        frog.classList.add('hop');
        msg.textContent = cheer();
        if (q.kind === 'spell') logRound(q.entry.word, misses === 0);
        else award();
        if (i === count - 1) celebrate(root);
        if (upcoming && upcoming.kind === 'spell') later(() => { nextBtn.hidden = false; }, 700);
        else later(done, 1300);
      } else {
        misses++;
        river.querySelectorAll(`.lp-pad[data-v="${CSS.escape(pad.dataset.v)}"]`).forEach((b) => { b.classList.add('sunk'); b.disabled = true; });
        msg.textContent = nudge();
        if (misses >= 2) river.querySelectorAll(`.lp-pad[data-v="${CSS.escape(String(q.answer))}"]`).forEach((b) => b.classList.add('glow'));
      }
    }

    lanes.forEach((lane) =>
      shuffle(q.choices).forEach((c) =>
        lane.append(el('button', { class: 'lp-pad' + (q.kind === 'spell' ? ' word' : ''), type: 'button', 'data-v': String(c), onclick: (e) => tap(e.currentTarget) },
          el('span', {}, String(c)))),
      ),
    );
    river.append(el('div', { class: 'lp-bank' }, el('span', { class: 'lp-home' }, frog), '🌾 🌿 🌾'), ...lanes, el('div', { class: 'lp-bank low' }, '🌿 🪨 🌾 🌿'));

    const header = q.kind === 'spell'
      ? [el('p', { class: 'prompt' }, `Question ${i + 1} of ${count} · Which one is spelled right?`), hearBar(q.entry)]
      : [el('p', { class: 'prompt' }, `Question ${i + 1} of ${count}`), el('div', { class: 'mq' }, `${q.text} = ?`)];
    root.append(...header, river, msg, nextBtn);
    if (q.kind === 'spell') speakWord(q.entry);
    float(lanes, anims);
    onLeave(() => anims.forEach((a) => a.cancel()));
  }

  setup();
  return () => { alive = false; sc.dispose(); };
}

// Each lane: every pad gets the same width and an even share of one loop, so pads never overlap.
// Uses the Web Animations API (no CSS variables inside keyframes, which older Safari handles badly).
function float(lanes, anims) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; // pads sit still, wrapped
  lanes.forEach((lane, li) => {
    const pads = [...lane.children];
    const w = Math.max(...pads.map((p) => p.offsetWidth));
    const riverW = lane.clientWidth;
    const travel = Math.max(riverW + w, pads.length * (w + 18));
    const dur = (travel / LANE_SPEED[li]) * 1000;
    const offset = Math.random();
    lane.classList.add('moving');
    pads.forEach((p, k) => {
      p.style.width = `${w}px`;
      p.style.left = `${-w}px`;
      const a = p.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${travel}px)` }], { duration: dur, iterations: Infinity });
      a.currentTime = ((k / pads.length + offset) % 1) * dur;
      anims.push(a);
    });
  });
}
