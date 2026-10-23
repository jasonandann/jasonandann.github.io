// Step-chip strip: her program as a wrapping row of big icon + word chips. Tap-only editing
// (drag is unverified on iPad Safari). A `repeat` shows as a box holding its body's chips.
// Chips are addressed by path (indexes from the top level down, as walk() reports them).
import { el } from '../util.js';

const key = (path) => path.join('.');
const asPath = (p) => (Array.isArray(p) ? p : [p]);

// ops: {op: {icon, word, say, color, iconClass?, swatch?}}; word/say/swatch may be fn(block).
// onTap(path, block) when a chip (or a box's header chip) is tapped.
export function chipStrip({ ops, onTap, empty = 'Your steps go here.' }) {
  const strip = el('div', { class: 'code-chips', role: 'list', 'aria-label': 'Your program' });
  const find = (path) => path && strip.querySelector(`.code-chip[data-path="${key(asPath(path))}"]`);
  const val = (v, b) => (typeof v === 'function' ? v(b) : v);
  let open = null;

  function chip(b, path) {
    const o = ops[b.op] || { icon: '?', word: b.op, say: b.op, color: 'grey' };
    const sw = o.swatch && val(o.swatch, b);
    const btn = el('button', {
      class: `code-chip c-${o.color}${b.op === 'repeat' ? ' code-rep' : ''}`, type: 'button', role: 'listitem',
      'data-op': b.op, 'data-i': path[path.length - 1], 'data-path': key(path),
      'aria-label': `Step ${key(path.map((i) => i + 1))}: ${val(o.say, b)}`, onclick: () => onTap && onTap(path, b),
    },
    el('span', { class: `ci${o.iconClass ? ` ${o.iconClass}` : ''}` }, o.icon),
    el('span', { class: 'cw' }, val(o.word, b)),
    sw ? el('span', { class: 'csw', style: `background:${sw}` }) : null);
    if (b.op !== 'repeat') return btn;
    const isOpen = open && key(open) === key(path);
    const inner = (b.body || []).map((c, j) => chip(c, [...path, j]));
    return el('div', { class: `code-box${isOpen ? ' open' : ''}`, 'data-path': key(path) },
      btn,
      el('div', { class: 'code-box-body' }, inner.length ? inner : el('span', { class: 'code-empty' }, isOpen ? 'Tap blocks to put them in the box' : 'empty')));
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
