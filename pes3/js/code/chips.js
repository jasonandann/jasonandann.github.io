// Step-chip strip: her program as a wrapping row of big icon + word chips. A block with a `body`
// (repeat, forever) shows as a box holding its body's chips. Chips are addressed by path (indexes from
// the top level down, as walk() reports them). Tap a chip = onTap. Drag a chip = move it among its neighbours (same row or same box;
// dragging a box's header chip moves the whole box). Drag works on iPad (verified for Word Search/Baffle).
import { el } from '../util.js';

const key = (path) => path.join('.');
const asPath = (p) => (Array.isArray(p) ? p : [p]);
const DRAG_PX = 10;
const val = (v, b) => (typeof v === 'function' ? v(b) : v);
const opOf = (ops, b) => ops[b.op] || { icon: '?', word: b.op, say: b.op, color: 'grey' };
// What a chip shows: icon (+ class, e.g. the flipped pencil), word, optional colour swatch.
function face(o, b) {
  const sw = o.swatch && val(o.swatch, b);
  return [el('span', { class: `ci${o.iconClass ? ` ${o.iconClass}` : ''}` }, o.icon),
    el('span', { class: 'cw' }, val(o.word, b)),
    sw ? el('span', { class: 'csw', style: `background:${sw}` }) : null];
} // finger must move this far before a press becomes a drag (smaller = tap)

// ops: {op: {icon, word, say, color, iconClass?, swatch?}}; word/say/swatch may be fn(block).
// onTap(path, block) when a chip (or a box's header chip) is tapped.
// onMove(parentPath, from, to): move child `from` of that container (program or a box body) to index `to`
//   (index after taking it out). Omit to turn dragging off. canDrag() = false (e.g. while running) blocks it.
export function chipStrip({ ops, onTap, onMove, canDrag = () => true, empty = 'Your steps go here.' }) {
  const strip = el('div', { class: `code-chips${onMove ? ' can-drag' : ''}`, role: 'list', 'aria-label': 'Your program' });
  const find = (path) => path && strip.querySelector(`.code-chip[data-path="${key(asPath(path))}"]`);
  let open = null;
  let dragged = false; // the click that ends a drag is not a tap (cleared by the next press)

  function chip(b, path) {
    const o = opOf(ops, b);
    const isBox = Array.isArray(b.body); // repeat, forever
    const btn = el('button', {
      class: `code-chip c-${o.color}${isBox ? ' code-rep' : ''}`, type: 'button', role: 'listitem',
      'data-op': b.op, 'data-i': path[path.length - 1], 'data-path': key(path),
      'aria-label': `Step ${key(path.map((i) => i + 1))}: ${val(o.say, b)}`,
      onclick: () => { if (dragged) { dragged = false; return; } if (onTap) onTap(path, b); },
    },
    ...face(o, b));
    if (onMove) btn.addEventListener('pointerdown', (e) => press(e, btn, path));
    if (!isBox) return btn;
    const isOpen = open && key(open) === key(path);
    const inner = (b.body || []).map((c, j) => chip(c, [...path, j]));
    return el('div', { class: `code-box${isOpen ? ' open' : ''}`, 'data-path': key(path) },
      btn,
      el('div', { class: 'code-box-body' }, inner.length ? inner : el('span', { class: 'code-empty' }, isOpen ? 'Tap blocks to put them in the box' : 'empty')));
  }

  /* ----- drag to reorder ----- */
  // The element that moves for a chip: the chip itself, or its whole box for a box's header chip.
  const unit = (btn) => (btn.classList.contains('code-rep') ? btn.closest('.code-box') : btn);
  // Chips (header chips for boxes) in the same container as `path`, in order.
  function siblings(path) {
    const parent = key(path.slice(0, -1));
    return [...strip.querySelectorAll('.code-chip')].filter((c) => {
      const p = c.dataset.path.split('.');
      return p.length === path.length && key(p.slice(0, -1)) === parent;
    });
  }
  function press(e, btn, path) {
    dragged = false;
    if (!canDrag() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const x0 = e.clientX, y0 = e.clientY;
    let drag = null;
    const move = (ev) => {
      if (!drag) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
        drag = start(btn, path, ev);
      }
      follow(drag, ev);
    };
    const end = (ev) => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', end);
      btn.removeEventListener('pointercancel', end);
      if (!drag) return;
      dragged = true;
      finish(drag, ev.type === 'pointerup');
    };
    try { btn.setPointerCapture(e.pointerId); } catch { /* still works without capture on most browsers */ }
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }
  function start(btn, path, ev) {
    const box = unit(btn);
    const r = box.getBoundingClientRect();
    const ghost = box.cloneNode(true);
    ghost.classList.add('code-ghost');
    ghost.style.width = `${r.width}px`;
    document.body.append(ghost);
    const mark = el('div', { class: 'code-drop', 'aria-hidden': 'true' });
    strip.append(mark);
    box.classList.add('dragging');
    const others = siblings(path).filter((c) => c !== btn).map(unit);
    return { path, box, ghost, mark, others, dx: ev.clientX - r.left, dy: ev.clientY - r.top, to: path[path.length - 1] };
  }
  // Ghost follows the finger; the drop bar goes before/after the nearest neighbour.
  function follow(d, ev) {
    d.ghost.style.transform = `translate(${ev.clientX - d.dx}px, ${ev.clientY - d.dy}px)`;
    if (!d.others.length) { d.mark.hidden = true; return; }
    let best = 0, bestDist = Infinity;
    d.others.forEach((o, i) => {
      const r = o.getBoundingClientRect();
      const dist = Math.hypot(ev.clientX - (r.left + r.width / 2), (ev.clientY - (r.top + r.height / 2)) * 1.5);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    const r = d.others[best].getBoundingClientRect();
    const after = ev.clientX > r.left + r.width / 2;
    d.to = best + (after ? 1 : 0);
    const s = strip.getBoundingClientRect();
    d.mark.hidden = false;
    d.mark.style.left = `${(after ? r.right + 3 : r.left - 3) - s.left + strip.scrollLeft}px`;
    d.mark.style.top = `${r.top - s.top + strip.scrollTop}px`;
    d.mark.style.height = `${r.height}px`;
  }
  function finish(d, drop) {
    d.ghost.remove();
    d.mark.remove();
    d.box.classList.remove('dragging');
    const from = d.path[d.path.length - 1];
    if (drop && d.to !== from) onMove(d.path.slice(0, -1), from, d.to);
  }

  return {
    el: strip,
    // openPath: the repeat box new blocks go into (shown open), or null.
    render(program, openPath = null) {
      open = openPath;
      strip.replaceChildren(...(program.length ? program.map((b, i) => chip(b, [i])) : [el('span', { class: 'code-empty' }, empty)]));
    },
    // Highlight the chip being run and the boxes around it (path from walk(); null clears).
    setActive(path) {
      strip.querySelectorAll('.now').forEach((c) => c.classList.remove('now'));
      if (!path) return;
      const p = asPath(path);
      for (let d = 1; d < p.length; d++) {
        const box = strip.querySelector(`.code-box[data-path="${key(p.slice(0, d))}"]`);
        if (box) box.classList.add('now');
      }
      const c = find(p);
      if (c) { c.classList.add('now'); c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    },
    // Gentle pulse on the chip that needs fixing.
    pulse(path) {
      strip.querySelectorAll('.code-chip.pulse').forEach((c) => c.classList.remove('pulse'));
      const c = find(path);
      if (c) c.classList.add('pulse');
    },
    // Little "poof" on a chip (path or top-level index), then done() (which re-renders without it).
    poof(path, done) {
      const c = find(path);
      if (!c) return done();
      (c.closest('.code-box') && c.classList.contains('code-rep') ? c.closest('.code-box') : c).classList.add('poof');
      c.disabled = true;
      setTimeout(done, 220);
    },
  };
}

// ◀ / ▶ buttons for a chip's tap menu: move the chip one place within its row or box (the same moves
// as dragging, for when dragging is fiddly). index = its place, count = how many are in that row/box.
export function shiftButtons(index, count, onShift) {
  return el('div', { class: 'row code-shift' },
    el('button', { class: 'btn', type: 'button', 'data-act': 'shift-left', disabled: index <= 0, onclick: () => onShift(-1) }, '◀ Move left'),
    el('button', { class: 'btn', type: 'button', 'data-act': 'shift-right', disabled: index >= count - 1, onclick: () => onShift(1) }, 'Move right ▶'));
}

// Title for a chip's tap menu: the chip itself (same colour, icon, word), bigger and not tappable, so a
// child who can't read the words yet still sees which step the menu is about.
export function chipTitle(ops, b) {
  const o = opOf(ops, b);
  return el('h2', { class: 'code-menu-title', 'aria-label': val(o.say, b) },
    el('span', { class: `code-face c-${o.color}`, 'aria-hidden': 'true', 'data-op': b.op }, ...face(o, b)));
}
