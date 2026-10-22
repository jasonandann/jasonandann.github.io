// Wordal: Wordle-style. The secret word is her spelling word (she hears it); 6 guesses.
// No dictionary check. Wrong letters are neutral grey, never red.
import { el, rounds, hearBar, speakWord, cheer, logRound, celebrate, keyboard, listenKeys, extraChars } from '../util.js';

const MAX_GUESSES = 6;
const RANK = { absent: 1, present: 2, correct: 3 };

// Two-pass evaluation so repeated letters are handled correctly.
export function evaluateGuess(guess, target) {
  const res = Array(target.length).fill('absent');
  const left = {};
  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) res[i] = 'correct';
    else left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < target.length; i++) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

export function mount(root, entries, api) {
  const pool = entries.filter((e) => e.word.length >= 3 && e.word.length <= 12);
  if (!pool.length) return root.replaceChildren(el('p', { class: 'note' }, 'This game needs words of 3 to 12 letters.'));
  const extras = extraChars(pool);

  return rounds(root, pool, api, ({ entry, next, later, onLeave }) => {
    const word = entry.word;
    const n = word.length;
    const rows = [];
    let guesses = 0;
    let cur = '';
    let busy = false;
    let done = false;
    const keyState = {};

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const grid = el('div', { class: 'wd-grid', style: `--n:${n}` });
    for (let r = 0; r < MAX_GUESSES; r++) {
      const cells = Array.from({ length: n }, () => el('div', { class: 'wd-cell' }));
      rows.push(cells);
      grid.append(el('div', { class: 'wd-row' }, cells));
    }
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');

    const kb = keyboard({ onKey: type, onBack: back, extras });
    const enterBtn = el('button', { class: 'btn primary', type: 'button', onclick: submit }, 'Check ✔');

    function paintRow() {
      rows[guesses].forEach((c, i) => { c.textContent = cur[i] || ''; c.classList.toggle('filled', !!cur[i]); });
    }
    function type(ch) { if (!busy && !done && cur.length < n) { cur += ch; paintRow(); } }
    function back() { if (!busy && !done && cur) { cur = cur.slice(0, -1); paintRow(); } }

    function colorKeys() {
      kb.querySelectorAll('.key').forEach((k) => {
        const s = keyState[k.textContent];
        if (s) k.dataset.s = s;
      });
    }

    function submit() {
      if (busy || done) return;
      if (cur.length < n) {
        msg.textContent = `This word has ${n} letters.`;
        grid.children[guesses].classList.add('shake');
        later(() => grid.children[guesses] && grid.children[guesses].classList.remove('shake'), 450);
        return;
      }
      msg.textContent = '';
      busy = true;
      const guess = cur;
      const res = evaluateGuess(guess, word);
      const row = rows[guesses];
      res.forEach((s, i) => later(() => { row[i].classList.add('flip', s); }, i * 150));
      later(() => {
        [...guess].forEach((ch, i) => {
          if (!keyState[ch] || RANK[res[i]] > RANK[keyState[ch]]) keyState[ch] = res[i];
        });
        colorKeys();
        guesses++;
        cur = '';
        busy = false;
        if (guess === word) {
          done = true;
          logRound(word, guesses <= 2);
          msg.textContent = cheer();
          nextBtn.hidden = false;
          celebrate(root);
        } else if (guesses >= MAX_GUESSES) {
          done = true;
          logRound(word, false);
          msg.replaceChildren(el('span', {}, 'The word is '), el('b', {}, word), el('span', {}, '. Look at how it is spelled!'));
          nextBtn.hidden = false;
        } else {
          msg.textContent = 'Green = right spot. Yellow = right letter, wrong spot.';
        }
      }, n * 150 + 250);
    }

    onLeave(listenKeys({ onKey: type, onBack: back, onEnter: submit, extras }));
    root.append(
      el('p', { class: 'prompt' }, 'Spell the word you hear. You get six tries.'),
      hearBar(entry),
      el('div', { class: 'wd-cols' },
        el('div', { class: 'wd-left' }, grid, msg),
        el('div', { class: 'wd-right' }, kb, el('div', { class: 'row' }, enterBtn), nextBtn),
      ),
    );
    speakWord(entry);
  });
}
