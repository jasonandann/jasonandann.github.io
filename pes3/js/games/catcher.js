// Spell Catcher: letters drift down like rain; tap them in spelling order.
// Letters that reach the bottom just loop back to the top, so nothing is ever lost.
import { el, shuffle, rounds, hearBar, speakWord, cheer, logRound, celebrate } from '../util.js';

const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

export function mount(root, entries, api) {
  return rounds(root, entries, api, ({ entry, next, later }) => {
    const word = entry.word;
    const chars = [...word];
    const decoyPool = [...ALPHA].filter((c) => !chars.includes(c));
    const decoys = shuffle(decoyPool).slice(0, 4 + Math.floor(Math.random() * 3));
    let pos = 0;
    let misses = 0;
    let done = false;

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const slotRow = el('div', { class: 'slots' });
    const sky = el('div', { class: 'sc-sky' });
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');

    const drawSlots = () =>
      slotRow.replaceChildren(
        ...chars.map((ch, i) => el('span', { class: 'tile slot' + (i < pos ? ' filled' : '') }, i < pos ? ch : '')),
      );

    function glowNext() {
      sky.querySelectorAll('.sc-letter').forEach((b) => b.classList.toggle('glow', b.dataset.ch === chars[pos]));
    }

    function tap(btn) {
      if (done) return;
      if (btn.dataset.ch === chars[pos]) {
        btn.remove();
        pos++;
        drawSlots();
        sky.querySelectorAll('.glow').forEach((b) => b.classList.remove('glow'));
        if (misses >= 3) glowNext();
        if (pos === chars.length) {
          done = true;
          logRound(word, misses === 0);
          msg.textContent = cheer('spell');
          nextBtn.hidden = false;
          sky.querySelectorAll('.sc-letter').forEach((b) => b.remove());
          celebrate(root);
        }
      } else {
        misses++;
        btn.classList.add('no');
        later(() => btn.classList.remove('no'), 500);
        msg.textContent = 'Keep looking — you can do it!';
        if (misses >= 3) glowNext();
      }
    }

    const letters = shuffle([...chars, ...decoys]);
    letters.forEach((ch, i) => {
      const dur = 9 + Math.random() * 6;
      sky.append(
        el('button', {
          class: 'sc-letter', type: 'button', 'data-ch': ch,
          style: `left:${4 + Math.random() * 82}%;background:${COLORS[i % COLORS.length]};` +
            `--d:${dur.toFixed(1)}s;--dl:-${(Math.random() * dur).toFixed(1)}s;--y:${(8 + Math.random() * 70).toFixed(0)}%`,
          onclick: (e) => tap(e.currentTarget),
        }, ch),
      );
    });

    root.append(el('p', { class: 'prompt' }, 'Catch the letters in order.'), hearBar(entry), slotRow, sky, msg, nextBtn);
    drawSlots();
    speakWord(entry);
  });
}
