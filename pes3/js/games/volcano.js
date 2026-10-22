// Word Volcano: letters sit on a volcano as rocks; tap them in spelling order.
// The lava only rises as she gets letters right (a reward, never a threat).
import { el, shuffle, rounds, hearBar, speakWord, cheer, logRound, celebrate } from '../util.js';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ROCKS = ['#d6d3d1', '#e7e5e4', '#fecaca', '#fed7aa', '#fde68a'];

// Scatter n points in a 100x100 box, keeping them apart; relaxes the spacing if it cannot fit.
export function scatter(n) {
  let gap = 20;
  for (;;) {
    const pts = [];
    for (let tries = 0; pts.length < n && tries < 400; tries++) {
      const p = { x: 8 + Math.random() * 84, y: 6 + Math.random() * 70 };
      if (pts.every((q) => Math.hypot((p.x - q.x) * 1.3, p.y - q.y) >= gap)) pts.push(p);
    }
    if (pts.length === n) return pts;
    gap -= 2;
  }
}

export function mount(root, entries, api) {
  return rounds(root, entries, api, ({ entry, next, later }) => {
    const word = entry.word;
    const chars = [...word];
    const decoys = shuffle([...ALPHA].filter((c) => !chars.includes(c))).slice(0, 2 + Math.floor(Math.random() * 2));
    const all = shuffle([...chars, ...decoys]);
    const pts = scatter(all.length);
    let pos = 0;
    let misses = 0;
    let done = false;

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const slotRow = el('div', { class: 'slots' });
    const lava = el('div', { class: 'vo-lava' });
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');
    const mountain = el('div', { class: 'vo-mountain' }, lava);

    const drawSlots = () =>
      slotRow.replaceChildren(
        ...chars.map((ch, i) => el('span', { class: 'tile slot' + (i < pos ? ' filled' : '') }, i < pos ? ch : '')),
      );
    const glowNext = () =>
      mountain.querySelectorAll('.vo-rock').forEach((b) => b.classList.toggle('glow', b.dataset.ch === chars[pos]));

    function tap(btn) {
      if (done) return;
      if (btn.dataset.ch === chars[pos]) {
        btn.remove();
        pos++;
        drawSlots();
        lava.style.height = `${Math.round((pos / chars.length) * 38)}%`;
        mountain.querySelectorAll('.glow').forEach((b) => b.classList.remove('glow'));
        if (misses >= 3) glowNext();
        if (pos === chars.length) {
          done = true;
          logRound(word, misses === 0);
          mountain.classList.add('erupt');
          mountain.querySelectorAll('.vo-rock').forEach((b) => b.remove());
          msg.textContent = cheer();
          nextBtn.hidden = false;
          celebrate(root);
        }
      } else {
        misses++;
        btn.classList.add('shake');
        later(() => btn.classList.remove('shake'), 500);
        msg.textContent = 'Try another rock!';
        if (misses >= 3) glowNext();
      }
    }

    all.forEach((ch, i) => {
      mountain.append(
        el('button', {
          class: 'vo-rock', type: 'button', 'data-ch': ch,
          style: `left:${pts[i].x}%;top:${pts[i].y}%;background:${ROCKS[i % ROCKS.length]}`,
          onclick: (e) => tap(e.currentTarget),
        }, ch),
      );
    });

    root.append(el('p', { class: 'prompt' }, 'Tap the rocks in order.'), hearBar(entry), slotRow, mountain, msg, nextBtn);
    drawSlots();
    speakWord(entry);
  });
}
