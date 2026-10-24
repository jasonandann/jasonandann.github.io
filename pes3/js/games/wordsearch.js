// Word Search: find the hidden words. Drag across letters, or tap the first and last letter.
// Words run left-to-right, top-to-bottom, or diagonally down (no backwards words: easier for grade 3).
import { el, chooseWords, isLetters, speakWord, celebrate, noWords } from '../util.js';

const DIRS = [[0, 1], [1, 0], [1, 1]];
const MIN = 8; // smaller boards = bigger letters for small fingers (issue #51)
const MAX = 12;
const WORDS = 6;
// All 8 drag directions as [dr, dc], in angle order (0 = right, then clockwise since rows go down).
const DIRS8 = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const HYST = 0.25; // a drag reaches a quarter cell into the next letter before it grows or shrinks
const DIR_HYST = 0.14; // radians (~8 deg) past a direction boundary before the line swings over
const SLACK = 1; // a selection may run one letter past the word (issue #51: fingers overshoot)

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

// Where a drag from `start` ends, snapped to the nearest of 8 directions (issue #51: diagonals needed a
// perfect 45 deg). pos = pointer in cell units ({x: col, y: row}, cell centres at k + 0.5). prev = the last
// result, so small wobbles near a boundary don't flip the length or the direction. Returns {r, c, dir, len}.
export function snapEnd(start, pos, size, prev) {
  const dx = pos.x - (start.c + 0.5);
  const dy = pos.y - (start.r + 0.5);
  const angle = Math.atan2(dy, dx);
  let dir = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  if (prev && prev.len) {
    const off = Math.abs(Math.atan2(Math.sin(angle - prev.dir * Math.PI / 4), Math.cos(angle - prev.dir * Math.PI / 4)));
    if (off < Math.PI / 8 + DIR_HYST) dir = prev.dir;
  }
  const [dr, dc] = DIRS8[dir];
  const steps = (dx * dc + dy * dr) / (dr && dc ? 2 : 1);
  const was = prev && (prev.dir === dir || !prev.len) ? prev.len : null;
  let len = was !== null && Math.abs(steps - was) < 0.5 + HYST ? was : Math.max(0, Math.round(steps));
  const fits = (k) => { const r = start.r + dr * k; const c = start.c + dc * k; return r >= 0 && r < size && c >= 0 && c < size; };
  while (len > 0 && !fits(len)) len--;
  return { r: start.r + dr * len, c: start.c + dc * len, dir, len };
}

function build(words) {
  const longest = Math.max(...words.map((w) => w.length));
  for (let s = Math.min(MAX, Math.max(MIN, longest)); s <= MAX; s++) {
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
    let chosen = chooseWords(pool, WORDS);
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
    function showPreview(line) {
      clearPreview();
      preview = line.map((p) => cells[p.r][p.c]);
      preview.forEach((d) => d.classList.add('sel'));
    }
    // A miss fades out the letters that were checked, so she can see what the game read (never says "wrong").
    function showMiss(line) {
      gridEl.querySelectorAll('.miss').forEach((d) => d.classList.remove('miss'));
      line.forEach((p) => {
        const d = cells[p.r][p.c];
        void d.offsetWidth; // restart the animation
        d.classList.add('miss');
      });
    }
    const placed = (p) => Array.from({ length: p.word.length }, (_, k) => ({ r: p.r + p.dr * k, c: p.c + p.dc * k }));

    // line = selected cells. Accepts the exact word (either way round), or a remaining word lying inside the
    // selection with at most SLACK extra letters. Returns true if a word was found.
    function evaluate(line) {
      if (!line || line.length < 2) return false;
      const str = line.map((p) => grid[p.r][p.c]).join('');
      const rev = [...str].reverse().join('');
      let hit = remaining.has(str) ? str : remaining.has(rev) ? rev : null;
      let lit = line;
      if (!hit) {
        const sel = new Set(line.map((p) => p.r + ',' + p.c));
        for (const p of remaining.values()) {
          if (p.word.length > line.length || line.length - p.word.length > SLACK) continue;
          if ((!hit || p.word.length > hit.length) && placed(p).every((q) => sel.has(q.r + ',' + q.c))) hit = p.word;
        }
        if (hit) lit = placed(remaining.get(hit));
      }
      if (!hit) return false;
      remaining.delete(hit);
      const f = foundCount++ % 6;
      lit.forEach((p) => { const d = cells[p.r][p.c]; d.classList.add('found'); d.dataset.f = f; });
      chips.get(hit).classList.add('found');
      speakWord(hit.toLowerCase());
      if (!remaining.size) win();
      return true;
    }
    function finish(line) {
      clearPreview();
      if (line && !evaluate(line)) showMiss(line);
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

    // Pointer position in cell units, measured from the corner cells so the gaps between letters aren't dead
    // zones (issue #51: elementFromPoint found no cell there).
    function gridPos(e) {
      const a = cells[0][0].getBoundingClientRect();
      const z = cells[size - 1][size - 1].getBoundingClientRect();
      return { x: ((e.clientX - a.left) / (z.right - a.left)) * size, y: ((e.clientY - a.top) / (z.bottom - a.top)) * size };
    }
    function cellAt(e) {
      const { x, y } = gridPos(e);
      if (x < -0.25 || y < -0.25 || x > size + 0.25 || y > size + 0.25) return null;
      const clamp = (v) => Math.min(size - 1, Math.max(0, Math.floor(v)));
      return { r: clamp(y), c: clamp(x) };
    }

    // One finger at a time (issue #51: a resting palm or second finger reset the drag). The answer is checked
    // against the line on screen, never re-measured where the finger lifts (lifting rolls the contact point).
    // A press that never leaves its letter is a tap: tap the first letter, then the last.
    let drag = null; // {id, start, end: snapEnd result, moved}
    let tapStart = null;
    const same = (a, b) => a.r === b.r && a.c === b.c;
    gridEl.addEventListener('pointerdown', (e) => {
      if (drag) return;
      const cell = cellAt(e);
      if (!cell) return;
      e.preventDefault();
      if (gridEl.setPointerCapture) try { gridEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = { id: e.pointerId, start: cell, end: { ...cell, dir: 0, len: 0 }, moved: false };
      showPreview(tapStart ? lineCells(tapStart, cell) || [cell] : [cell]);
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.end = snapEnd(drag.start, gridPos(e), size, drag.end);
      if (drag.end.len) drag.moved = true;
      if (!drag.moved) return;
      tapStart = null; // a real drag starts over, whatever was tapped before
      showPreview(lineCells(drag.start, drag.end));
    });
    gridEl.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { start, end, moved } = drag;
      drag = null;
      if (moved) {
        if (end.len) finish(lineCells(start, end));
        else clearPreview(); // slid back to the first letter: nothing selected
      } else if (!tapStart) {
        tapStart = start; // keep it highlighted; waiting for the last letter
        showPreview([start]);
      } else if (same(tapStart, start)) {
        tapStart = null; // tapped the same letter again: cancel
        clearPreview();
      } else {
        const line = lineCells(tapStart, start);
        if (line) { tapStart = null; finish(line); }
        else { tapStart = start; showPreview([start]); } // not in a line: start over from this letter
      }
    });
    gridEl.addEventListener('pointercancel', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; tapStart = null; clearPreview();
    });

    root.replaceChildren(
      el('p', { class: 'prompt' }, 'Find the words. Drag across the letters, or tap the first and last letter.'),
      el('div', { class: 'ws' }, gridEl, list),
      msg,
    );
  }

  play();
}
