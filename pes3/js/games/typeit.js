// Listen & Type: the closest thing to the real test. Hear the word, type it.
import { el, rounds, hearBar, speakSentence, cheer, retry, logRound, celebrate, keyboard, listenKeys, extraChars } from '../util.js';

export function mount(root, entries, api) {
  const extras = extraChars(entries);
  return rounds(root, entries, api, ({ entry, next, onLeave }) => {
    const word = entry.word;
    let typed = '';
    let misses = 0;
    let done = false;

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const shown = el('div', { class: 'typed' });
    const ref = el('div', { class: 'reveal', hidden: true });
    const nextBtn = el('button', { class: 'btn primary big', type: 'button', hidden: true, onclick: next }, 'Next ➜');
    const checkBtn = el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓');

    const draw = () => { shown.textContent = typed || ' '; };
    function onKey(ch) { if (!done && typed.length < word.length + 3) { typed += ch; draw(); } }
    function onBack() { if (!done) { typed = typed.slice(0, -1); draw(); } }
    function check() {
      if (done || !typed) return;
      if (typed === word) {
        done = true;
        logRound(word, misses === 0);
        shown.classList.add('good');
        msg.textContent = cheer('spell');
        checkBtn.hidden = true;
        nextBtn.hidden = false;
        celebrate(root);
        return;
      }
      misses++;
      typed = '';
      draw();
      if (misses >= 2) {
        ref.hidden = false;
        ref.textContent = word;
        msg.textContent = 'Here it is — look closely, then type it.';
      } else {
        msg.textContent = retry() + ' Tap 🔊 to hear it again.';
      }
    }

    onLeave(listenKeys({ onKey, onBack, onEnter: check, extras }));
    root.append(
      el('p', { class: 'prompt' }, 'Listen, then type the word.'),
      hearBar(entry), ref, shown, msg,
      keyboard({ onKey, onBack, extras }),
      el('div', { class: 'row' }, checkBtn, nextBtn),
    );
    draw();
    speakSentence(entry);
  });
}
