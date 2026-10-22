// Word Search: find the hidden words. Drag across letters, or tap the first and last letter.
// Words run left-to-right, top-to-bottom, or diagonally down (no backwards words: easier for grade 3).
import { el, chooseWords, isLetters, speakWord, celebrate, noWords } from '../util.js';

const DIRS = [[0, 1], [1, 0], [1, 1]];
const MAX = 14;

// words: UPPERCASE strings. Returns {grid, placements, size} or null if it can't fit.
export function generate(words, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const placements = [];
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      if (r + dr * (w.length - 1) >= size || c + dc * (w.length - 1) >= size) continue;
      let ok = true;
      for (let k = 0; k < w.length; k++) {
        const ch = grid[r + dr * k][c + dc * k];
        if (ch && ch !== w[k]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let k = 0; k < w.length; k++) grid[r + dr * k][c + dc * k] = w[k];
      placements.push({ word: w, r, c, dr, dc });
      placed = true;
    }
    if (!placed) return null;
  }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = A[Math.floor(Math.random() * 26)];
  }
  return { grid, placements, size };
}

export function lineCells(a, b) {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  return Array.from({ length: len + 1 }, (_, k) => ({ r: a.r + sr * k, c: a.c + sc * k }));
}

function build(words) {
  const longest = Math.max(...words.map((w) => w.length));
  for (let s = Math.min(MAX, Math.max(10, longest + 1)); s <= MAX; s++) {
    for (let t = 0; t < 30; t++) {
      const r = generate(words, s);
      if (r) return r;
    }
  }
  return null;
}

export function mount(root, entries, api) {
  const pool = entries.filter((e) => isLetters(e.word) && e.word.length <= MAX);
  if (!pool.length) return noWords(root);

  function play() {
    let chosen = chooseWords(pool, 8);
    let built = null;
    while (chosen.length) {
      built = build(chosen.map((e) => e.word.toUpperCase()));
      if (built) break;
      chosen = chosen.slice(0, -1);
    }
    if (!built) return noWords(root, 'Could not build a puzzle from these words.');

    const { grid, placements, size } = built;
    const remaining = new Map(placements.map((p) => [p.word, p]));
    let foundCount = 0;

    const gridEl = el('div', { class: 'ws-grid', style: `--n:${size}` });
    const cells = grid.map((row, r) =>
      row.map((ch, c) => {
        const d = el('div', { class: 'cell', 'data-r': r, 'data-c': c }, ch);
        gridEl.append(d);
        return d;
      }),
    );

    const chips = new Map();
    const list = el('div', { class: 'ws-list' });
    [...placements].sort((a, b) => a.word.localeCompare(b.word)).forEach((p) => {
      const chip = el('button', { class: 'chip', type: 'button', onclick: () => speakWord(p.word.toLowerCase()) }, p.word.toLowerCase());
      chips.set(p.word, chip);
      list.append(chip);
    });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });

    let preview = [];
    const clearPreview = () => { preview.forEach((d) => d.classList.remove('sel')); preview = []; };
    function showPreview(a, b) {
      clearPreview();
      const line = lineCells(a, b) || [a];
      preview = line.map((p) => cells[p.r][p.c]);
      preview.forEach((d) => d.classList.add('sel'));
    }

    function evaluate(a, b) {
      const line = lineCells(a, b);
      if (!line || line.length < 2) return;
      const str = line.map((p) => grid[p.r][p.c]).join('');
      const rev = [...str].reverse().join('');
      const hit = remaining.has(str) ? str : remaining.has(rev) ? rev : null;
      if (!hit) return; // quietly ignore misses
      remaining.delete(hit);
      const f = foundCount++ % 6;
      line.forEach((p) => { const d = cells[p.r][p.c]; d.classList.add('found'); d.dataset.f = f; });
      chips.get(hit).classList.add('found');
      speakWord(hit.toLowerCase());
      if (!remaining.size) win();
    }

    function win() {
      msg.textContent = 'You found them all!';
      msg.after(
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big', type: 'button', onclick: play }, 'Play again'),
          el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
        ),
      );
      celebrate(root);
    }

    function cellAt(e) {
      let t = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
      if (!t || !t.closest) t = e.target;
      const c = t && t.closest ? t.closest('.cell') : null;
      return c && gridEl.contains(c) ? { r: +c.dataset.r, c: +c.dataset.c } : null;
    }

    let start = null;
    let tapStart = null;
    let dragging = false;
    const same = (a, b) => a.r === b.r && a.c === b.c;
    gridEl.addEventListener('pointerdown', (e) => {
      const cell = cellAt(e);
      if (!cell) return;
      e.preventDefault();
      if (tapStart) { // second tap of a tap-tap selection
        evaluate(tapStart, cell);
        tapStart = null;
        clearPreview();
        return;
      }
      start = cell;
      dragging = true;
      showPreview(cell, cell);
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const cell = cellAt(e);
      if (cell) showPreview(start, cell);
    });
    gridEl.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const cell = cellAt(e) || start;
      if (same(cell, start)) {
        tapStart = start; // keep it highlighted; waiting for the second tap
        showPreview(start, start);
      } else {
        evaluate(start, cell);
        clearPreview();
      }
      start = null;
    });
    gridEl.addEventListener('pointercancel', () => { dragging = false; start = null; tapStart = null; clearPreview(); });

    root.replaceChildren(
      el('p', { class: 'prompt' }, 'Find the words. Drag across the letters, or tap the first and last letter.'),
      el('div', { class: 'ws' }, gridEl, list),
      msg,
    );
  }

  play();
}
