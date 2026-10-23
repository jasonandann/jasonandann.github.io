// Step-chip strip: her program as a wrapping row of big icon + word chips. Tap-only editing
// (drag is unverified on iPad Safari). Top-level blocks only for now; repeat bodies come with
// Turtle Draw.
import { el } from '../util.js';

// ops: {op: {icon, word, say, color}}. onTap(index, block) when a chip is tapped.
export function chipStrip({ ops, onTap, empty = 'Your steps go here.' }) {
  const strip = el('div', { class: 'code-chips', role: 'list', 'aria-label': 'Your program' });
  const chips = () => [...strip.querySelectorAll('.code-chip')];

  function chip(b, i) {
    const o = ops[b.op] || { icon: '?', word: b.op, say: b.op, color: 'grey' };
    return el('button', {
      class: `code-chip c-${o.color}`, type: 'button', role: 'listitem', 'data-op': b.op, 'data-i': i,
      'aria-label': `Step ${i + 1}: ${o.say}`, onclick: () => onTap && onTap(i, b),
    }, el('span', { class: 'ci' }, o.icon), el('span', { class: 'cw' }, o.word));
  }

  return {
    el: strip,
    render(program) {
      strip.replaceChildren(...(program.length ? program.map(chip) : [el('span', { class: 'code-empty' }, empty)]));
    },
    // Highlight the chip being run (path from walk(); null clears).
    setActive(path) {
      chips().forEach((c) => c.classList.remove('now'));
      const c = path && chips()[path[0]];
      if (c) { c.classList.add('now'); c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    },
    // Gentle pulse on the chip that needs fixing.
    pulse(path) {
      chips().forEach((c) => c.classList.remove('pulse'));
      const c = path && chips()[path[0]];
      if (c) c.classList.add('pulse');
    },
    // Little "poof" on chip i, then done() (which re-renders without it).
    poof(i, done) {
      const c = chips()[i];
      if (!c) return done();
      c.classList.add('poof');
      c.disabled = true;
      setTimeout(done, 220);
    },
  };
}
