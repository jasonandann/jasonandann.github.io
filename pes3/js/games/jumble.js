// Word Jumble: hear the word, tap the shuffled letters into the right order.
import { el, shuffle, rounds, hearBar, speakWord, cheer, retry, logRound, celebrate, isLetters, noWords } from '../util.js';

function scramble(tiles) {
  const word = tiles.map((t) => t.ch).join('');
  if (new Set(tiles.map((t) => t.ch)).size < 2) return [...tiles];
  let s;
  do { s = shuffle(tiles); } while (s.map((t) => t.ch).join('') === word);
  return s;
}

export function mount(root, entries, api) {
  const pool = entries.filter((e) => isLetters(e.word));
  if (!pool.length) return noWords(root);

  return rounds(root, pool, api, ({ entry, next, later }) => {
    const word = entry.word;
    const n = word.length;
    const tiles = [...word].map((ch, id) => ({ ch, id }));
    let tray = scramble(tiles);
    let slots = Array(n).fill(null);
    let misses = 0;
    let done = false;
    let locked = false;
    let logged = false;
    const record = (ok) => { if (!logged) { logged = true; logRound(word, ok); } };

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const slotRow = el('div', { class: 'slots' });
    const trayRow = el('div', { class: 'tray' });
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');

    function draw() {
      slotRow.replaceChildren(
        ...slots.map((t, i) =>
          el('button', { class: 'tile slot' + (t ? ' filled' : ''), type: 'button', onclick: () => unplace(i) }, t ? t.ch : ''),
        ),
      );
      trayRow.replaceChildren(
        ...tray.map((t) => el('button', { class: 'tile', type: 'button', onclick: () => place(t) }, t.ch)),
      );
    }
    function place(t) {
      if (done || locked) return;
      const i = slots.indexOf(null);
      if (i < 0) return;
      slots[i] = t;
      tray = tray.filter((x) => x !== t);
      draw();
      if (!slots.includes(null)) check();
    }
    function unplace(i) {
      if (done || locked || !slots[i]) return;
      tray.push(slots[i]);
      slots[i] = null;
      draw();
    }
    function win() {
      done = true;
      slotRow.classList.add('good');
      msg.textContent = cheer();
      nextBtn.hidden = false;
      celebrate(root);
    }
    function check() {
      if (slots.map((t) => t.ch).join('') === word) {
        record(misses === 0);
        return win();
      }
      misses++;
      if (misses >= 3) {
        // Show her the word so she can see how it's spelled, then move on.
        slots = [...word].map((ch, id) => ({ ch, id }));
        tray = [];
        draw();
        done = true;
        record(false);
        msg.textContent = 'Here is the word. Tap 🔊 and look at how it is spelled.';
        nextBtn.hidden = false;
        return;
      }
      locked = true;
      slotRow.classList.add('shake');
      msg.textContent = retry();
      later(() => {
        slotRow.classList.remove('shake');
        slots = Array(n).fill(null);
        tray = scramble(tiles);
        locked = false;
        draw();
      }, 900);
    }

    root.append(
      el('p', { class: 'prompt' }, 'Listen, then put the letters in order.'),
      hearBar(entry), slotRow, trayRow, msg, nextBtn,
    );
    draw();
    speakWord(entry);
  });
}
