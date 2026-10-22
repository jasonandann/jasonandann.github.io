// Fill the Blanks: some letters are missing; tap the right letters on the keyboard.
import { el, shuffle, rounds, hearBar, speakWord, cheer, logRound, celebrate, keyboard, listenKeys } from '../util.js';

export function mount(root, entries, api) {
  return rounds(root, entries, api, ({ entry, next, later, onLeave }) => {
    const word = entry.word;
    const chars = [...word];
    const letterIdx = chars.map((c, i) => (/[a-z]/.test(c) ? i : -1)).filter((i) => i >= 0);
    const count = Math.max(1, Math.min(Math.max(1, letterIdx.length - 1), Math.round(letterIdx.length * 0.4)));
    const blanks = new Set(shuffle(letterIdx).slice(0, count));
    const state = chars.map((c, i) => (blanks.has(i) ? '' : c));
    const blankMiss = {};
    const hinted = new Set();
    let misses = 0;
    let done = false;

    const nextBlank = () => {
      const i = chars.findIndex((_, k) => blanks.has(k) && state[k] === '');
      return i < 0 ? null : i;
    };
    let sel = nextBlank();

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const row = el('div', { class: 'slots' });
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');

    function draw() {
      row.replaceChildren(
        ...chars.map((c, i) => {
          if (!blanks.has(i)) return el('div', { class: 'tile fixed' }, c);
          const cls = 'tile slot' + (state[i] ? ' filled' : '') + (i === sel ? ' sel' : '') + (hinted.has(i) ? ' hint' : '');
          return el('button', { class: cls, type: 'button', onclick: () => { if (!done && !state[i]) { sel = i; draw(); } } }, state[i]);
        }),
      );
    }
    function complete() {
      done = true;
      logRound(word, misses === 0);
      row.classList.add('good');
      msg.textContent = cheer();
      nextBtn.hidden = false;
      celebrate(root);
    }
    function shake() {
      row.classList.remove('shake');
      void row.offsetWidth; // restart the animation
      row.classList.add('shake');
      later(() => row.classList.remove('shake'), 450);
    }
    function press(ch) {
      if (done || sel == null) return;
      if (ch === chars[sel]) {
        state[sel] = ch;
        sel = nextBlank();
        msg.textContent = '';
        draw();
        if (sel == null) complete();
        return;
      }
      misses++;
      blankMiss[sel] = (blankMiss[sel] || 0) + 1;
      shake();
      if (blankMiss[sel] >= 3) {
        state[sel] = chars[sel];
        hinted.add(sel);
        msg.textContent = `That one is “${chars[sel]}”.`;
        sel = nextBlank();
        draw();
        if (sel == null) complete();
      } else {
        msg.textContent = 'Try a different letter.';
      }
    }

    onLeave(listenKeys({ onKey: press }));
    root.append(
      el('p', { class: 'prompt' }, 'Which letters are missing?'),
      hearBar(entry), row, msg, keyboard({ onKey: press }), nextBtn,
    );
    draw();
    speakWord(entry);
  });
}
