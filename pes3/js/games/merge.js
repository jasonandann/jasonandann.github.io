// Merge Makers: tap the crate to make small number tiles, drag one onto a matching one to make double.
// Make the goal number to finish a level; that tile is carried into the next level, where the crate makes a
// different number. (3s make 12, then 3s make 24, then 6s make 48, ...) No timer, no score, nothing to lose.
import { el, scope, celebrate, finish, award } from '../util.js';

export const COLS = 5;
export const ROWS = 5;
// base = what the crate makes; carry = the tile brought from the last level (its goal); goal = tile to make.
export const LEVELS = [
  { base: 3, goal: 12 },
  { base: 3, goal: 24, carry: 12 },
  { base: 6, goal: 48, carry: 24 },
  { base: 12, goal: 48, carry: 24 },
  { base: 6, goal: 96, carry: 48 },
  { base: 12, goal: 96, carry: 48 },
  { base: 24, goal: 96, carry: 48 },
  { base: 12, goal: 192, carry: 96 },
  { base: 24, goal: 192, carry: 96 },
];
const KEY = 'spelling-games.merge.level';
const savedLevel = () => {
  try { return Math.min(LEVELS.length - 1, Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0)); } catch { return 0; }
};
const saveLevel = (n) => { try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ } };
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// One colour per doubling of 3 (3, 6, 12, 24, ...), so a number looks the same in every level.
const hue = (v) => (Math.round(Math.log2(v / 3)) * 47 + 215) % 360;

export function mount(root, _e, api) {
  let sc = scope();
  let alive = true;

  function menu() {
    const lv = savedLevel();
    root.replaceChildren(
      el('div', { class: 'zt-setup' },
        el('h2', {}, '🔢 Merge Makers'),
        el('p', { class: 'prompt' }, 'Drag a number onto the same number to make a bigger one!'),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big', type: 'button', onclick: () => play(lv) }, lv ? `Level ${lv + 1}` : 'Play'),
          lv ? el('button', { class: 'btn big', type: 'button', onclick: () => { saveLevel(0); play(0); } }, 'Start over') : null,
        ),
      ),
    );
  }

  function play(level) {
    sc.dispose();
    sc = scope();
    const L = LEVELS[level];
    const grid = Array(COLS * ROWS).fill(null); // each cell: null or { v, id }
    let nextId = 1;
    let sel = -1; // tapped tile waiting for its match
    let done = false;
    let drag = null;

    const put = (i, v) => { grid[i] = { v, id: nextId++ }; return grid[i]; };
    const empties = () => grid.flatMap((t, i) => (t ? [] : [i]));
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' }, '');
    const board = el('div', { class: 'mg-board', style: `--cols:${COLS}` });
    const crate = el('button', { class: 'btn primary big mg-crate', type: 'button', 'aria-label': `Make a ${L.base}` },
      el('span', { class: 'mg-crate-pic' }, '📦'), ` Make a ${L.base}`);
    const info = L.carry
      ? `Make a ${L.goal}. The ${L.carry} came with you!`
      : `Make a ${L.goal}!`;

    const cells = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = el('div', { class: 'mg-cell', 'data-i': i });
      cells.push(c);
      board.append(c);
    }

    function draw(popId) {
      cells.forEach((c, i) => {
        const t = grid[i];
        const cur = c.firstChild;
        if (!t) { c.replaceChildren(); return; }
        if (cur && cur.dataset.id === String(t.id)) { cur.classList.toggle('sel', sel === i); return; }
        const b = el('button', {
          class: `mg-tile${t.id === popId ? ' pop' : ''}${sel === i ? ' sel' : ''}${t.v === L.goal ? ' goal' : ''}`,
          type: 'button', 'data-id': t.id, 'data-v': t.v, 'aria-label': String(t.v),
          style: `--h:${hue(t.v)}`,
        }, String(t.v));
        c.replaceChildren(b);
      });
      crate.disabled = done || !empties().length;
    }

    function merge(from, to, quiet) {
      if (done || from === to || !grid[from] || !grid[to] || grid[from].v !== grid[to].v) return false;
      const h = grid[to].v;
      const v = h * 2;
      grid[from] = null;
      sel = -1;
      const t = put(to, v);
      msg.textContent = `${h} + ${h} = ${v}`;
      draw(t.id);
      if (!quiet) cells[to].firstChild?.focus?.();
      if (v === L.goal) win();
      else tidy();
      return true;
    }

    // A full board with no pair would leave her stuck: sparkle away the smallest tiles to make room.
    function tidy() {
      if (empties().length) return;
      if (grid.some((t, i) => grid.some((u, j) => j !== i && u.v === t.v))) return;
      const small = Math.min(...grid.map((t) => t.v));
      grid.forEach((t, i) => { if (t.v === small) grid[i] = null; });
      msg.textContent = '✨ Sparkles made some room!';
      draw();
    }

    function win() {
      done = true;
      award();
      draw();
      celebrate(root);
      const last = level === LEVELS.length - 1;
      msg.textContent = `${L.goal / 2} + ${L.goal / 2} = ${L.goal} 🎉`;
      sc.later(() => {
        if (!alive) return;
        if (last) { saveLevel(0); finish(root, api, () => play(0)); return; }
        saveLevel(level + 1);
        root.replaceChildren(
          el('div', { class: 'zt-setup' },
            el('div', { class: 'big-emoji' }, '🌟'),
            el('h2', {}, `${L.goal}!`),
            el('p', { class: 'prompt' }, `The ${L.goal} comes with you to the next level.`),
            el('div', { class: 'row' },
              el('button', { class: 'btn primary big mg-next', type: 'button', onclick: () => play(level + 1) }, 'Next level'),
              el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
            ),
          ),
        );
        celebrate(root);
      }, reduced() ? 600 : 1500);
    }

    crate.addEventListener('click', () => {
      if (done) return;
      const e = empties();
      if (!e.length) return;
      const i = e[Math.floor(Math.random() * e.length)];
      const t = put(i, L.base);
      sel = -1;
      msg.textContent = '';
      draw(t.id);
      tidy();
    });

    /* ---- drag a tile onto its match; a plain tap selects, then tap the match ---- */
    const cellAt = (x, y) => {
      const c = document.elementFromPoint(x, y)?.closest?.('.mg-cell');
      return c && board.contains(c) ? Number(c.dataset.i) : -1;
    };
    board.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.mg-tile');
      if (!b || done || drag) return;
      const from = Number(b.parentNode.dataset.i);
      drag = { from, b, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      b.setPointerCapture?.(e.pointerId);
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      if (!drag.moved) { drag.moved = true; drag.b.classList.add('drag'); }
      drag.b.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
      const over = cellAt(e.clientX, e.clientY);
      cells.forEach((c, i) => c.classList.toggle('want', i === over && i !== drag.from && grid[i]?.v === grid[drag.from].v));
    });
    const endDrag = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      cells.forEach((c) => c.classList.remove('want'));
      d.b.classList.remove('drag');
      d.b.style.transform = '';
      if (cancelled) return;
      if (d.moved) {
        const to = cellAt(e.clientX, e.clientY);
        if (to >= 0 && !merge(d.from, to)) msg.textContent = to === d.from ? '' : 'Drop it on the same number!';
        return;
      }
      // a tap
      if (sel >= 0 && sel !== d.from) {
        if (!merge(sel, d.from)) { msg.textContent = 'Tap the same number!'; sel = d.from; draw(); }
      } else {
        sel = sel === d.from ? -1 : d.from;
        msg.textContent = '';
        draw();
      }
    };
    board.addEventListener('pointerup', (e) => endDrag(e, false));
    board.addEventListener('pointercancel', (e) => endDrag(e, true));

    // starting tiles: the carried one, and a few base tiles to get going
    if (L.carry) put(Math.floor(Math.random() * grid.length), L.carry).carried = true;
    for (let n = 0; n < 4; n++) {
      const e = empties();
      put(e[Math.floor(Math.random() * e.length)], L.base);
    }

    root.replaceChildren(
      el('p', { class: 'prompt' }, `${info}`),
      el('div', { class: 'mg-goal' }, 'Goal: ', el('span', { class: 'mg-num', style: `--h:${hue(L.goal)}` }, L.goal)),
      board,
      el('div', { class: 'row' }, crate),
      msg,
    );
    draw();
    root.__merge = {
      state: () => ({ level, goal: L.goal, base: L.base, carry: L.carry || 0, done, grid: grid.map((t) => (t ? t.v : 0)), sel }),
      merge: (a, b) => merge(a, b, true),
      set: (list) => { grid.fill(null); list.forEach((v, i) => { if (v) put(i, v); }); sel = -1; draw(); },
    };
  }

  menu();
  return () => { alive = false; sc.dispose(); };
}
