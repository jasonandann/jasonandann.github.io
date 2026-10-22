// Spot Match: two cards share exactly one picture. Tap it. No timer.
import { el, shuffle, scope, celebrate, finish, award, cheer } from '../util.js';

const POOL = ['⭐', '❤️', '🌸', '🦋', '☀️', '🌙', '☁️', '🌳', '🐟', '🐦', '🐞', '🍃', '💧', '⚡', '❄️', '🔥', '💎', '👑', '🔔', '🎁', '🎈', '🍰', '🍪', '🍕', '⚽', '🏀', '🚲', '🚀', '✈️', '🚗', '⚓'];
const PER_CARD = 6;
const ROUNDS = 10;

export function mount(root, _e, api) {
  let sc = scope();
  let alive = true;

  function play() {
    let round = 0;
    const next = () => {
      sc.dispose();
      sc = scope();
      if (!alive) return;
      if (round >= ROUNDS) return finish(root, api, play);
      round++;
      const s = shuffle(POOL);
      const match = s[0];
      const left = shuffle([match, ...s.slice(1, PER_CARD)]);
      const right = shuffle([match, ...s.slice(PER_CARD, PER_CARD * 2 - 1)]);
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      let locked = false;
      const card = (items) =>
        el('div', { class: 'sm-card' },
          items.map((sym) =>
            el('button', {
              class: 'sm-sym', type: 'button',
              style: `font-size:${2 + Math.random() * 0.8}rem;transform:rotate(${Math.floor(Math.random() * 41) - 20}deg)`,
              onclick: (e) => {
                if (locked) return;
                if (sym === match) {
                  locked = true;
                  document.querySelectorAll('.sm-sym').forEach((b) => b.textContent === match && b.classList.add('right'));
                  award();
                  msg.textContent = cheer();
                  sc.later(next, 1000);
                } else {
                  const b = e.currentTarget;
                  b.classList.add('shake');
                  sc.later(() => b.classList.remove('shake'), 450);
                  msg.textContent = 'Look again!';
                }
              },
            }, sym),
          ),
        );
      root.replaceChildren(
        el('p', { class: 'prompt' }, `Find the picture that is on both cards (${round} of ${ROUNDS})`),
        el('div', { class: 'sm-cards' }, card(left), card(right)),
        msg,
      );
    };
    next();
  }
  play();
  return () => { alive = false; sc.dispose(); };
}
