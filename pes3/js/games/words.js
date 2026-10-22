// See the Words: a plain study list. Tap a word to hear it (and its sentence, if given).
import { el, speakSentence } from '../util.js';

export function mount(root, entries) {
  root.replaceChildren(
    el('p', { class: 'prompt' }, 'Tap a word to hear it.'),
    el('div', { class: 'study' },
      entries.map((e) =>
        el('button', { class: 'study-word', type: 'button', onclick: () => speakSentence(e) },
          el('span', { class: 'w' }, e.word),
          e.sentence ? el('span', { class: 's' }, e.sentence) : null,
          el('span', { 'aria-hidden': 'true' }, '🔊'),
        ),
      ),
    ),
  );
}
