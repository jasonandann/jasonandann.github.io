// Fill the Blanks, one game in three menu sections (the questions come from js/blanks.js):
//   mount      Spelling: missing letters of 10 list words
//   vocab      Vocabulary: the missing word in 10 sentences (tiles; ⚙️ Options can switch to typing)
//   math       Math: a missing number or sign in 10 sums, at the saved math level (⚙️ = level, like the math games)
// Each question ends with a Next tap, so the next one can be read aloud on iOS.
import { el, scope, finish, celebrate, chooseWords } from '../util.js';
import { blank, mathPuzzle } from '../blanks.js';
import { chooseVocab, canBlank } from '../vocab.js';
import { savedLevel, levelGear } from '../math.js';
import { choice, openOptions, cornerGear } from '../options.js';

const COUNT = 10;

// pick() -> items for one game; build(item, {later, onLeave, done}) -> the question; gear(sc, play) -> corner ⚙️ or null.
function run(root, api, { pick, build, gear }) {
  let sc = scope();
  function play() {
    const items = pick();
    let i = 0;
    const show = () => {
      sc.dispose();
      sc = scope();
      if (i >= items.length) return finish(root, api, play);
      const item = items[i++];
      const nextBtn = el('button', { class: 'btn primary big fb-next', type: 'button', hidden: true, onclick: show }, i < items.length ? 'Next ➜' : 'Finish');
      const q = build(item, { later: sc.later, onLeave: sc.onLeave, done: () => { nextBtn.hidden = false; celebrate(root); } });
      root.replaceChildren(...[gear && gear(sc, play), q, nextBtn, el('p', { class: 'label' }, `${i} of ${items.length}`)].filter(Boolean));
    };
    show();
  }
  play();
  return () => sc.dispose();
}

export function mount(root, entries, api) {
  return run(root, api, {
    pick: () => chooseWords(entries, COUNT),
    build: (entry, o) => blank({ kind: 'spell', entry, entries, ...o }),
  });
}

const VOPT_KEY = 'spelling-games.vblanks.options';
export const INPUTS = [['tiles', 'Pick the word'], ['type', 'Type the word']];
export function vocabInput() {
  try { const v = JSON.parse(localStorage.getItem(VOPT_KEY)).input; return INPUTS.some(([k]) => k === v) ? v : 'tiles'; } catch { return 'tiles'; }
}
function setVocabInput(v) { try { localStorage.setItem(VOPT_KEY, JSON.stringify({ input: v })); } catch { /* ignore */ } }
// The vocab input row, shared with Bridge Builder's options.
export const inputChoice = (redraw) => choice('Vocabulary answers', vocabInput(), INPUTS, (v) => { setVocabInput(v); redraw(); });

export const vocab = {
  mount(root, entries, api) {
    const usable = entries.filter(canBlank);
    if (usable.length < 2) {
      root.replaceChildren(el('p', { class: 'note' }, 'Fill the Blanks needs at least 2 words with a meaning or a sentence that uses the word in vocab.txt.'));
      return;
    }
    return run(root, api, {
      pick: () => chooseVocab(usable, COUNT),
      build: (entry, o) => blank({ kind: 'vocab', entry, entries: usable, input: vocabInput(), ...o }),
      gear: (sc, play) => cornerGear(() => {
        const before = vocabInput();
        const pop = openOptions({ title: '⚙️ Fill the Blanks', body: (redraw) => [inputChoice(redraw)], onClose: () => { if (vocabInput() !== before) play(); } });
        sc.onLeave(pop.dispose);
      }),
    });
  },
};

export const math = {
  mount(root, _e, api) {
    return run(root, api, {
      pick: () => {
        const seen = new Set(), out = [];
        for (let g = 0; out.length < COUNT && g < 400; g++) {
          const p = mathPuzzle(savedLevel());
          const key = `${p.a}${p.op}${p.b}${p.hide}`;
          if (!seen.has(key)) { seen.add(key); out.push(p); }
        }
        return out;
      },
      build: (puzzle, o) => blank({ kind: 'math', puzzle, ...o }),
      gear: (sc, play) => levelGear(play, sc.onLeave),
    });
  },
};
