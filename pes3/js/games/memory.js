// Memory Match: every word appears on a pair of cards. Flip two to find the matches.
import { el, shuffle, chooseWords, speakWord, celebrate, scope } from '../util.js';

export function mount(root, entries, api) {
  if (entries.length < 2) {
    root.replaceChildren(el('p', { class: 'note' }, 'Memory Match needs at least 2 words.'));
    return;
  }
  let sc = scope();

  function play() {
    sc.dispose();
    sc = scope();
    const { later } = sc;
    const chosen = chooseWords(entries, 6);
    const deck = shuffle(chosen.flatMap((e) => [{ e }, { e }]));
    let first = null;
    let lock = false;
    let matched = 0;

    const board = el('div', { class: 'memory' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });

    for (const item of deck) {
      const card = el('button', { class: 'card' + (item.e.word.length > 8 ? ' long' : ''), type: 'button', 'aria-label': 'card' },
        el('span', { class: 'face front' }, '⭐'),
        el('span', { class: 'face back' }, item.e.word),
      );
      item.card = card;
      card.addEventListener('click', () => {
        if (lock || card.classList.contains('open')) return;
        card.classList.add('open');
        speakWord(item.e);
        if (!first) { first = item; return; }
        if (first.e.word === item.e.word) {
          first.card.classList.add('matched');
          card.classList.add('matched');
          first = null;
          matched += 2;
          if (matched === deck.length) win();
        } else {
          lock = true;
          const a = first;
          first = null;
          later(() => {
            a.card.classList.remove('open');
            card.classList.remove('open');
            lock = false;
          }, 1200);
        }
      });
      board.append(card);
    }

    function win() {
      msg.textContent = 'You matched them all!';
      board.after(
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big', type: 'button', onclick: play }, 'Play again'),
          el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
        ),
      );
      celebrate(root);
    }

    root.replaceChildren(el('p', { class: 'prompt' }, 'Find the matching words.'), board, msg);
  }

  play();
  return () => sc.dispose();
}
