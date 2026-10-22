// Puzzle Pieces: tap a piece, answer its question, and the piece of the picture appears.
import { el, shuffle, scope, celebrate, cheer, opKind, award } from '../util.js';
import { pickLevel, makeQuestions, choices, nudge } from '../math.js';

const PICTURES = [
  { name: 'Sunny Garden', cells: ['☁️', '☀️', '☁️', '🌳', '🏡', '🌳', '🌷', '🐇', '🌻'] },
  { name: 'Pond Life', cells: ['🌤️', '🦆', '🌤️', '🌿', '🐸', '🌿', '🐟', '🪷', '🐢'] },
  { name: 'Rainbow Meadow', cells: ['🌈', '🌈', '🌈', '🦋', '🐑', '🐝', '🌼', '🌸', '🍄'] },
  { name: 'Enchanted Forest', cells: ['🌙', '⭐', '🦉', '🌲', '🧚', '🌲', '🍄', '🦊', '🌲'] },
];

export function mount(root, _e, api) {
  let sc = scope();
  let alive = true;

  function start(level) {
    sc.dispose();
    sc = scope();
    const pic = PICTURES[Math.floor(Math.random() * PICTURES.length)];
    const qs = makeQuestions(level, 9);
    const revealed = new Set();
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const panel = el('div', { class: 'pz-panel' });
    const grid = el('div', { class: 'pz-grid' });

    function draw() {
      grid.replaceChildren(
        ...pic.cells.map((c, i) =>
          el('button', {
            class: 'pz-piece' + (revealed.has(i) ? ' shown' : ''), type: 'button',
            disabled: revealed.has(i), onclick: () => ask(i),
          }, revealed.has(i) ? c : '?'),
        ),
      );
    }
    function ask(i) {
      const q = qs[i];
      let locked = false;
      panel.replaceChildren(
        el('div', { class: 'mq' }, `${q.text} = ?`),
        el('div', { class: 'answers' },
          choices(q).map((c) =>
            el('button', {
              class: 'btn big ans', type: 'button',
              onclick: (e) => {
                if (locked) return;
                if (c === q.answer) {
                  locked = true;
                  award();
                  revealed.add(i);
                  msg.textContent = cheer(opKind(q.text));
                  panel.replaceChildren();
                  draw();
                  if (revealed.size === 9) {
                    msg.textContent = `You uncovered the ${pic.name}!`;
                    celebrate(root);
                    panel.replaceChildren(el('button', { class: 'btn primary big', type: 'button', onclick: () => start(level) }, 'New picture'), el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'));
                  }
                } else {
                  e.currentTarget.disabled = true;
                  msg.textContent = nudge();
                }
              },
            }, c),
          ),
        ),
      );
    }
    root.replaceChildren(el('p', { class: 'prompt' }, 'Tap a piece, answer the question, and reveal the picture.'), grid, panel, msg);
    draw();
  }

  pickLevel(root, 'Puzzle Pieces', start);
  return () => { alive = false; sc.dispose(); };
}
