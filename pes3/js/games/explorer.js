// Times Table Explorer: a 12x12 grid to look at, practice with, and spot patterns in.
import { el, shuffle, award, cheer } from '../util.js';
import { nudge } from '../math.js';

export function mount(root, _e, api) {
  let mode = 'explore';
  let table = 3;
  let hi = 2;
  const known = new Set();

  const info = el('div', { class: 'msg ex-info', 'aria-live': 'polite' }, 'Tap a square.');
  const grid = el('div', { class: 'ex-grid' });
  const panel = el('div', { class: 'ex-panel' });
  const tabs = el('div', { class: 'row' });
  const picker = el('div', { class: 'ex-pick' });

  function drawTabs() {
    tabs.replaceChildren(
      ...[['explore', '🔍 Explore'], ['practice', '🎯 Practice'], ['pattern', '✨ Patterns']].map(([m, label]) =>
        el('button', { class: 'btn' + (m === mode ? ' primary' : ''), type: 'button', onclick: () => { mode = m; panel.replaceChildren(); info.textContent = 'Tap a square.'; drawTabs(); drawGrid(); } }, label),
      ),
    );
    picker.replaceChildren();
    if (mode !== 'explore') {
      const pickRow = [];
      for (let n = 2; n <= 12; n++) {
        const sel = (mode === 'practice' ? table : hi) === n;
        pickRow.push(el('button', { class: 'chip' + (sel ? ' found' : ''), type: 'button', onclick: () => { if (mode === 'practice') table = n; else hi = n; drawTabs(); drawGrid(); } }, `×${n}`));
      }
      picker.append(...pickRow);
    }
  }

  function drawGrid() {
    const cells = [];
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const v = r * c;
        let cls = 'ex-cell';
        let hidden = false;
        if (mode === 'pattern' && v % hi === 0) cls += ' lit';
        if (mode === 'practice' && (r === table || c === table) && !known.has(`${r}x${c}`)) { hidden = true; cls += ' hide'; }
        cells.push(el('button', { class: cls, type: 'button', onclick: () => tap(r, c) }, hidden ? '?' : v));
      }
    }
    grid.replaceChildren(...cells);
  }

  function tap(r, c) {
    const v = r * c;
    if (mode === 'practice' && (r === table || c === table) && !known.has(`${r}x${c}`)) return ask(r, c);
    info.textContent = `${r} × ${c} = ${v}`;
  }

  function ask(r, c) {
    const v = r * c;
    const opts = new Set([v]);
    for (const x of shuffle([v + r, v - r, v + c, v - c, v + 1, v - 1, v + 10])) { if (x > 0 && opts.size < 4) opts.add(x); }
    let locked = false;
    info.textContent = '';
    panel.replaceChildren(
      el('div', { class: 'mq' }, `${r} × ${c} = ?`),
      el('div', { class: 'answers' },
        shuffle([...opts]).map((o) =>
          el('button', {
            class: 'btn big ans', type: 'button',
            onclick: (e) => {
              if (locked) return;
              if (o === v) { locked = true; award(); known.add(`${r}x${c}`); panel.replaceChildren(); info.textContent = cheer('mul'); drawGrid(); }
              else { e.currentTarget.disabled = true; info.textContent = nudge(); }
            },
          }, o),
        ),
      ),
    );
  }

  drawTabs();
  drawGrid();
  root.append(tabs, picker, info, panel, grid);
}
