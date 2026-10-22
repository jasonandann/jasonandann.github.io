// Five themed math games that share one idea: answer the question, move the game forward.
// Mountain, River, Maze, Bubbles, Cascade. Each exports mount(root, entries, api).
import { el, shuffle, celebrate, cheer } from '../util.js';
import { quiz, nudge } from '../math.js';

const qHeader = (q, i, count) => [
  el('p', { class: 'prompt' }, `Question ${i + 1} of ${count}`),
  el('div', { class: 'mq' }, `${q.text} = ?`),
];

/* ---- Number Mountain: climb one step per right answer ---- */
export const mountain = {
  mount(root, _e, api) {
    return quiz(root, api, 'Number Mountain', 10, ({ q, i, count, choices, later, done }) => {
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      const hiker = el('div', { class: 'mt-hiker', style: `--p:${(i / (count - 1)) * 100}%` }, '🧗');
      const btns = choices.map((c) => el('button', { class: 'btn big ans', type: 'button', onclick: () => pick(c, btnFor(c)) }, c));
      const btnFor = (c) => btns[choices.indexOf(c)];
      let locked = false;
      function pick(c, b) {
        if (locked) return;
        if (c === q.answer) {
          locked = true;
          b.classList.add('right');
          msg.textContent = cheer();
          hiker.style.setProperty('--p', `${((i + 1) / (count - 1)) * 100}%`);
          later(done, 1100);
        } else {
          b.disabled = true;
          msg.textContent = nudge();
        }
      }
      root.append(
        el('div', { class: 'mt' }, el('div', { class: 'mt-peak' }, '🏔️'), el('div', { class: 'mt-flag' }, '🚩'), hiker),
        ...qHeader(q, i, count), el('div', { class: 'answers' }, btns), msg,
      );
    });
  },
};

/* ---- Number River: hop onto the right lily pad ---- */
export const river = {
  mount(root, _e, api) {
    return quiz(root, api, 'Number River', 10, ({ q, i, count, choices, later, done }) => {
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      const frog = el('div', { class: 'rv-frog' }, '🐸');
      let locked = false;
      const pads = choices.map((c) =>
        el('button', {
          class: 'rv-pad', type: 'button',
          onclick: (e) => {
            if (locked) return;
            const b = e.currentTarget;
            if (c === q.answer) {
              locked = true;
              b.classList.add('right');
              b.append(frog);
              msg.textContent = cheer();
              later(done, 1200);
            } else {
              b.classList.add('sunk');
              b.disabled = true;
              msg.textContent = nudge();
            }
          },
        }, c),
      );
      root.append(...qHeader(q, i, count), el('div', { class: 'rv' }, el('div', { class: 'rv-bank' }, '🌾'), el('div', { class: 'rv-pads' }, pads)), msg);
    });
  },
};

/* ---- Number Maze: choose a door in each of 8 rooms ---- */
export const maze = {
  mount(root, _e, api) {
    return quiz(root, api, 'Number Maze', 8, ({ q, i, count, choices, later, done }) => {
      const doors3 = shuffle([q.answer, ...choices.filter((c) => c !== q.answer).slice(0, 2)]);
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      let locked = false;
      const doors = doors3.map((c) =>
        el('button', {
          class: 'door', type: 'button',
          onclick: (e) => {
            if (locked) return;
            const b = e.currentTarget;
            if (c === q.answer) {
              locked = true;
              b.classList.add('open');
              msg.textContent = cheer();
              later(done, 1100);
            } else {
              b.disabled = true;
              b.classList.add('closed');
              msg.textContent = 'Try another door!';
            }
          },
        }, el('span', { class: 'door-n' }, c), el('span', {}, '🚪')),
      );
      root.append(...qHeader(q, i, count), el('div', { class: 'doors' }, doors), msg);
    });
  },
};

/* ---- Number Bubbles: pop the bubble with the answer ---- */
export const bubbles = {
  mount(root, _e, api) {
    return quiz(root, api, 'Number Bubbles', 10, ({ q, i, count, choices, later, done }) => {
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      let locked = false;
      const sea = el('div', { class: 'bb-sea' });
      shuffle([...choices, ...choices]).forEach((c, k) => {
        const dur = 7 + Math.random() * 5;
        sea.append(
          el('button', {
            class: 'bb', type: 'button',
            style: `left:${(k % 8) * 11.5 + Math.random() * 3}%;--d:${dur.toFixed(1)}s;--dl:-${(Math.random() * dur).toFixed(1)}s;--y:${(5 + Math.random() * 65).toFixed(0)}%`,
            onclick: (e) => {
              if (locked) return;
              const b = e.currentTarget;
              if (c === q.answer) {
                locked = true;
                sea.querySelectorAll('.bb').forEach((x) => x.classList.add('pop'));
                msg.textContent = cheer();
                later(done, 900);
              } else {
                b.classList.add('pop');
                later(() => b.remove(), 250);
                msg.textContent = nudge();
              }
            },
          }, c),
        );
      });
      root.append(...qHeader(q, i, count), sea, msg);
    });
  },
};

/* ---- Number Cascade: find the answer on a 4x4 board ---- */
export const cascade = {
  mount(root, _e, api) {
    return quiz(root, api, 'Number Cascade', 10, ({ q, i, count, choices, later, done }) => {
      const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
      const fillers = new Set(choices.filter((c) => c !== q.answer));
      while (fillers.size < 15) {
        const v = Math.max(0, q.answer + Math.floor(Math.random() * 31) - 15);
        if (v !== q.answer) fillers.add(v);
      }
      const cells = shuffle([q.answer, ...[...fillers].slice(0, 15)]);
      let locked = false;
      const grid = el('div', { class: 'cc-grid' });
      const tiles = cells.map((c, k) =>
        el('button', {
          class: 'cc', type: 'button',
          onclick: (e) => {
            if (locked) return;
            const b = e.currentTarget;
            if (c === q.answer) {
              locked = true;
              b.classList.add('right');
              msg.textContent = cheer();
              tiles.forEach((t, j) => {
                const dist = Math.abs((j % 4) - (k % 4)) + Math.abs(Math.floor(j / 4) - Math.floor(k / 4));
                later(() => t.classList.add('ripple'), dist * 90);
              });
              later(done, 1200);
            } else {
              b.disabled = true;
              b.classList.add('shake');
              msg.textContent = nudge();
            }
          },
        }, c),
      );
      grid.append(...tiles);
      root.append(...qHeader(q, i, count), grid, msg);
    });
  },
};
