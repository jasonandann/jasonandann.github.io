// Look, Cover, Write, Check: the classic classroom spelling method.
import { el, rounds, hearBar, speakWord, cheer, logRound, celebrate, keyboard, listenKeys, extraChars } from '../util.js';

export function mount(root, entries, api) {
  const extras = extraChars(entries);
  return rounds(root, entries, api, ({ entry, next, onLeave }) => {
    const word = entry.word;
    let attempts = 0;
    let phase = 'look';
    let typed = '';
    let shown = null;

    const stage = el('div', { class: 'stage' });
    const prompt = (t) => el('p', { class: 'prompt' }, t);
    const nextBtn = () => el('button', { class: 'btn primary big', type: 'button', onclick: next }, 'Next ➜');
    const draw = () => { if (shown) shown.textContent = typed || ' '; };

    function look() {
      phase = 'look';
      typed = '';
      stage.replaceChildren(
        prompt('1. Look at the word carefully.'),
        el('div', { class: 'bigword' }, word),
        hearBar(entry),
        el('button', { class: 'btn primary big', type: 'button', onclick: cover }, 'Cover it ✋'),
      );
      speakWord(entry);
    }

    function cover() {
      phase = 'write';
      typed = '';
      shown = el('div', { class: 'typed' });
      stage.replaceChildren(
        prompt('2. The word is hidden. Spell it from memory.'),
        el('div', { class: 'hear' }, el('button', { class: 'btn speaker', type: 'button', onclick: () => speakWord(entry) }, '🔊 Hear it')),
        shown,
        keyboard({ onKey, onBack, extras }),
        el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓'),
      );
      draw();
    }

    function onKey(ch) { if (phase === 'write' && typed.length < word.length + 3) { typed += ch; draw(); } }
    function onBack() { if (phase === 'write') { typed = typed.slice(0, -1); draw(); } }

    function check() {
      if (phase !== 'write' || !typed) return;
      phase = 'check';
      const mine = el('div', { class: 'compare' }, [...typed].map((ch, i) => el('span', { class: ch === word[i] ? 'ok' : 'off' }, ch)));
      if (typed === word) {
        logRound(word, attempts === 0);
        stage.replaceChildren(prompt('3. Check it.'), mine, el('div', { class: 'msg' }, cheer()), nextBtn());
        celebrate(root);
        return;
      }
      attempts++;
      const compare = [
        prompt('3. Check it. Compare the letters.'),
        el('p', { class: 'label' }, 'You wrote:'), mine,
        el('p', { class: 'label' }, 'The word:'), el('div', { class: 'bigword' }, word),
      ];
      if (attempts >= 2) {
        logRound(word, false);
        stage.replaceChildren(...compare, nextBtn());
      } else {
        stage.replaceChildren(
          ...compare,
          el('button', { class: 'btn primary big', type: 'button', onclick: look }, 'Look again 👀'),
        );
      }
    }

    onLeave(listenKeys({ onKey, onBack, onEnter: check, extras }));
    root.append(stage);
    look();
  });
}
