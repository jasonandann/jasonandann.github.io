// Bridge Builder (Adventures): fill-the-blank questions (js/blanks.js) build bridges for a critter.
// Each bridge has PLANKS gaps; a filled blank lays a plank and the critter hops onto it (a blank that had to be
// shown lays nothing: "Let's try another one!"). A full bridge = the critter walks across; the last one reaches
// the castle. Questions: Mix (default; takes turns between spelling, vocabulary and math, whichever have words) or
// one subject. Start screen = pick who crosses (that tap starts) + ⚙️ Options (questions, bridges, math level,
// vocabulary answers). Defaults chosen by Claude, 2026-10-28; not yet confirmed by Jason.
import { el, shuffle, scope, finish, celebrate, chooseWords } from '../util.js';
import { blank, mathPuzzle } from '../blanks.js';
import { chooseVocab, canBlank } from '../vocab.js';
import { savedLevel, levelChoice, saveLevel } from '../math.js';
import { choice, openOptions, optionsButton } from '../options.js';
import { vocabInput, inputChoice } from './fillblank.js';

export const PLANKS = 4;
// Full-body animals with legs, so they walk across. Apple's emoji all face left (checked 2026-10-28, Apple Color
// Emoji; current Noto Color Emoji, used by Android and Chromebooks, too); CSS mirrors them (.br-body). Samsung unchecked.
export const CRITTERS = ['🐕', '🐈', '🐢', '🐘', '🦖', '🐐'];
const STEP_MS = 700, CROSS_MS = 1600; // = the CSS transition times on .br-critter
// One per bridge, in this order.
export const THEMES = [
  { id: 'river', name: 'the river', below: '🌊' },
  { id: 'canyon', name: 'the canyon', below: '🪨' },
  { id: 'lava', name: 'the lava', below: '🔥' },
  { id: 'clouds', name: 'the clouds', below: '☁️' },
];
const OPT_KEY = 'spelling-games.bridge.options';
const MODES = [['mix', 'Mix'], ['spell', 'Spelling'], ['vocab', 'Vocabulary'], ['math', 'Math']];
const BRIDGES = [[2, '2'], [3, '3'], [4, '4']];
function loadOpts() {
  const d = { mode: 'mix', bridges: 3 };
  try {
    const o = JSON.parse(localStorage.getItem(OPT_KEY)) || {};
    return { mode: MODES.some(([v]) => v === o.mode) ? o.mode : d.mode, bridges: BRIDGES.some(([v]) => v === o.bridges) ? o.bridges : d.bridges };
  } catch { return d; }
}
function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* ignore */ } }

// Subjects that can be asked: spelling needs list words, vocabulary 2 words with a meaning or sentence.
export function subjects(mode, words, vocab) {
  const have = { spell: words.length > 0, vocab: vocab.length >= 2, math: true };
  if (mode !== 'mix') return have[mode] ? [mode] : ['math'];
  return ['spell', 'vocab', 'math'].filter((k) => have[k]);
}

export function mount(root, entries, api) {
  const vocabWords = (api.vocab || []).filter(canBlank);
  let sc = scope();
  let opts = loadOpts();
  let st = null; // {critter, bridge, planks, kinds, turn}
  const bags = { spell: [], vocab: [] };
  const draw = (kind) => {
    const bag = bags[kind];
    if (!bag.length) bag.push(...(kind === 'spell' ? chooseWords(entries, Math.min(10, entries.length)) : chooseVocab(vocabWords, Math.min(10, vocabWords.length))));
    return bag.pop();
  };

  function summary() {
    const m = MODES.find(([v]) => v === opts.mode)[1];
    return `Questions: ${m} · ${opts.bridges} bridges`;
  }

  function start() {
    sc.dispose();
    sc = scope();
    const pickers = CRITTERS.map((c) => el('button', { class: 'btn br-pick', type: 'button', 'data-c': c, 'aria-label': `Cross with ${c}`, onclick: () => begin(c) }, el('span', { class: 'br-body' }, c)));
    const optBtn = optionsButton({ summary: summary(), onOpen: () => {
      const pop = openOptions({
        title: '⚙️ Bridge Builder',
        body: (redraw) => [
          choice('Questions', opts.mode, MODES.filter(([v]) => v === 'mix' || subjects(v, entries, vocabWords)[0] === v), (v) => { opts = { ...opts, mode: v }; saveOpts(opts); redraw(); }),
          choice('How many bridges to cross', opts.bridges, BRIDGES, (v) => { opts = { ...opts, bridges: v }; saveOpts(opts); redraw(); }),
          levelChoice(savedLevel(), (v) => { saveLevel(v); redraw(); }),
          vocabWords.length >= 2 ? inputChoice(redraw) : null,
        ],
        onClose: start,
      });
      sc.onLeave(pop.dispose);
    } });
    root.replaceChildren(
      el('div', { class: 'setup br-start' },
        el('h2', {}, '🌉 Bridge Builder'),
        el('p', { class: 'prompt' }, 'Fill in the blanks to build bridges. Who will cross?'),
        el('div', { class: 'row br-picks' }, pickers),
        optBtn,
      ),
    );
  }

  function begin(critter) {
    st = { critter, bridge: 0, planks: 0, kinds: [], turn: 0 };
    question();
  }

  // Mix takes turns in a shuffled order, so each subject comes round equally often.
  function nextKind() {
    if (!st.kinds.length) st.kinds = shuffle(subjects(opts.mode, entries, vocabWords));
    return st.kinds.pop();
  }

  function scene() {
    const theme = THEMES[st.bridge % THEMES.length];
    const last = st.bridge === opts.bridges - 1;
    return el('div', { class: 'br-scene', 'data-theme': theme.id, 'data-planks': st.planks },
      el('div', { class: 'br-cliff br-left' }),
      el('div', { class: 'br-gap' },
        el('div', { class: 'br-below', 'aria-hidden': 'true' }, theme.below.repeat(6)),
        el('div', { class: 'br-deck' }, Array.from({ length: PLANKS }, (_, i) => el('div', { class: 'br-plank' + (i < st.planks ? ' on' : '') })))),
      el('div', { class: 'br-cliff br-right' }, el('span', { class: 'br-goal' }, last ? '🏰' : '🚩')),
      el('div', { class: 'br-critter', 'data-pos': String(st.planks) }, el('span', { class: 'br-body' }, st.critter)),
      el('div', { class: 'br-dots', 'aria-label': `Bridge ${st.bridge + 1} of ${opts.bridges}` },
        Array.from({ length: opts.bridges }, (_, i) => el('span', { class: 'br-dot' + (i < st.bridge ? ' done' : i === st.bridge ? ' now' : '') }))),
    );
  }

  // In place (not redrawn), so the critter's move is a CSS transition: onto the newest plank, or across.
  // It steps (.walking: a bob on the mirrored body) for as long as the move lasts.
  function refresh(view, moved) {
    view.dataset.planks = st.planks;
    view.querySelectorAll('.br-plank').forEach((p, i) => p.classList.toggle('on', i < st.planks));
    const critter = view.querySelector('.br-critter');
    critter.dataset.pos = st.planks === PLANKS ? 'across' : String(st.planks);
    if (!moved) return;
    critter.classList.add('walking');
    sc.later(() => critter.classList.remove('walking'), st.planks === PLANKS ? CROSS_MS : STEP_MS);
  }

  // Built inside a tap (Start / a critter / Next): spelling and vocabulary questions read aloud at once.
  function question() {
    sc.dispose();
    sc = scope();
    const kind = nextKind();
    const msg = el('div', { class: 'msg br-msg', 'aria-live': 'polite' });
    const nextBtn = el('button', { class: 'btn primary big br-next', type: 'button', hidden: true }, 'Next ➜');
    const view = scene();
    const done = ({ ok }) => {
      if (ok) st.planks++;
      const full = st.planks === PLANKS;
      refresh(view, ok);
      if (!ok) { msg.textContent = "Let's try another one!"; nextBtn.textContent = 'Next ➜'; }
      else if (!full) msg.textContent = 'A new plank!';
      else {
        const lastBridge = st.bridge === opts.bridges - 1;
        msg.textContent = lastBridge ? 'You made it to the castle!' : `Across ${THEMES[st.bridge % THEMES.length].name}!`;
        nextBtn.textContent = lastBridge ? 'Finish 🏰' : 'Next bridge ➜';
        celebrate(root);
      }
      nextBtn.hidden = false;
      nextBtn.onclick = () => {
        if (full) {
          if (st.bridge === opts.bridges - 1) return finish(root, api, start);
          st.bridge++;
          st.planks = 0;
        }
        question();
      };
    };
    const o = { later: sc.later, onLeave: sc.onLeave, done };
    const q = kind === 'spell' ? blank({ kind, entry: draw('spell'), entries, ...o })
      : kind === 'vocab' ? blank({ kind, entry: draw('vocab'), entries: vocabWords, input: vocabInput(), ...o })
        : blank({ kind: 'math', puzzle: mathPuzzle(savedLevel()), ...o });
    root.replaceChildren(view, msg, q, nextBtn);
  }

  root.__bridge = { state: () => ({ ...st, kinds: [...(st ? st.kinds : [])], mode: opts.mode, bridges: opts.bridges }) };
  start();
  return () => sc.dispose();
}
