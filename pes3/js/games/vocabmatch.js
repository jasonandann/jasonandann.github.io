// Match the Meaning (vocabulary): 2-3 words and their meanings on one screen; drag each card onto its partner.
// Cards are meanings dropped on words, or words dropped on meanings (Options: Mix = take turns per board).
// Tap works too: tap a card (it is read aloud), then tap where it goes. A card dropped on the wrong
// partner slides back; after 2 slips on one card its partner glows. Each word logs once (logVocab).
import { el, shuffle, speak, speakWord, cheer, retry, celebrate, scope, finish } from '../util.js';
import { chooseVocab, logVocab } from '../vocab.js';
import { choice, openOptions, cornerGear } from '../options.js';

const PER_BOARD = 3;
const BOARDS = 4;
const DRAG_PX = 8;
const OPT_KEY = 'spelling-games.vmatch.options';
const DRAGS = [['mix', 'Mix'], ['def', 'Meanings'], ['word', 'Words']];
function loadOpts() {
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY)); return { drag: DRAGS.some(([v]) => v === o?.drag) ? o.drag : 'mix' }; } catch { return { drag: 'mix' }; }
}
function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* ignore */ } }

// Board sizes for n words: threes, but never a board of one (4 -> 2 + 2).
export function boardSizes(n) {
  const sizes = [];
  for (let k = n; k > 0;) {
    const s = k === 4 ? 2 : Math.min(PER_BOARD, k);
    sizes.push(s);
    k -= s;
  }
  return sizes;
}

export function mount(root, entries, api) {
  const usable = entries.filter((e) => e.def);
  if (usable.length < 2) {
    root.replaceChildren(el('p', { class: 'note' }, 'Match the Meaning needs at least 2 words with meanings in vocab.txt.'));
    return;
  }
  let sc = scope();
  let opts = loadOpts();
  let gear = null;

  function play() {
    const words = chooseVocab(usable, Math.min(usable.length, PER_BOARD * BOARDS));
    const sizes = boardSizes(words.length);
    let b = 0, at = 0;
    const nextBoard = () => {
      if (b >= sizes.length) return finish(root, api, play);
      const set = words.slice(at, at + sizes[b]);
      at += sizes[b];
      const drag = opts.drag === 'mix' ? (b % 2 ? 'word' : 'def') : opts.drag;
      b++;
      board(set, drag, b, sizes.length, nextBoard);
    };
    nextBoard();
  }

  // drag = what the cards show: 'def' (meanings dropped on words) or 'word'.
  function board(set, drag, num, total, done) {
    sc.dispose();
    sc = scope();
    const { later, onLeave } = sc;
    const cardText = (e) => (drag === 'def' ? e.def : e.word);
    const spotText = (e) => (drag === 'def' ? e.word : e.def);
    const say = (e, isCard) => ((drag === 'def') === isCard ? speak(e.def) : speakWord(e.word));
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const slips = new Map(); // word -> wrong drops of its card
    let selected = null;
    let left = set.length;

    const spots = set.map((e) => {
      const hole = el('div', { class: 'vm-hole' }, drag === 'def' ? 'Drop the meaning here' : 'Drop the word here');
      const spot = el('div', { class: `vm-spot vm-${drag === 'def' ? 'word' : 'def'}`, 'data-w': e.word,
        onclick: () => { if (selected) tryPlace(selected, spot); else if (!spot.classList.contains('done')) say(e, false); } },
      el('div', { class: 'vm-face' }, spotText(e)), hole);
      spot._e = e;
      spot._hole = hole;
      return spot;
    });
    const cards = shuffle(set).map((e) => {
      const card = el('button', { class: `vm-card vm-${drag}`, type: 'button', 'data-w': e.word }, cardText(e));
      card._e = e;
      grab(card);
      return card;
    });
    const tray = el('div', { class: 'vm-tray' }, cards);

    function select(card) {
      if (selected) selected.classList.remove('sel');
      selected = card === selected ? null : card;
      if (selected) { selected.classList.add('sel'); say(card._e, true); }
    }

    function tryPlace(card, spot) {
      if (spot.classList.contains('done') || card.classList.contains('placed')) return;
      card.classList.remove('sel');
      selected = null;
      const w = card._e.word;
      if (spot._e.word !== w) {
        slips.set(w, (slips.get(w) || 0) + 1);
        msg.textContent = retry();
        card.classList.add('vm-back');
        later(() => card.classList.remove('vm-back'), 450);
        if (slips.get(w) >= 2) spots.find((s) => s._e.word === w).classList.add('glow');
        return;
      }
      spot.classList.remove('glow');
      spot.classList.add('done');
      card.classList.add('placed');
      card.disabled = true;
      spot._hole.replaceWith(card);
      logVocab(w, !slips.get(w));
      msg.textContent = cheer();
      if (--left === 0) {
        msg.textContent = num < total ? 'All matched!' : 'You matched them all!';
        celebrate(root);
        later(done, 1500);
      }
    }

    // Pointer drag (touch, pen or mouse). Under DRAG_PX of movement it is a tap = select.
    function grab(card) {
      card.addEventListener('pointerdown', (ev) => {
        if (card.classList.contains('placed') || ev.button > 0) return;
        const id = ev.pointerId, x0 = ev.clientX, y0 = ev.clientY;
        let dragging = false;
        try { card.setPointerCapture(id); } catch { /* ignore */ }
        const move = (e) => {
          if (e.pointerId !== id) return;
          const dx = e.clientX - x0, dy = e.clientY - y0;
          if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
          if (!dragging) { dragging = true; card.classList.add('dragging'); if (selected) select(selected); }
          card.style.transform = `translate(${dx}px, ${dy}px)`;
          const hit = spotAt(e.clientX, e.clientY);
          spots.forEach((s) => s.classList.toggle('over', s === hit));
        };
        const up = (e) => {
          if (e.pointerId !== id) return;
          stop();
          card.classList.remove('dragging');
          card.style.transform = '';
          spots.forEach((s) => s.classList.remove('over'));
          if (!dragging) { if (e.type === 'pointerup') select(card); return; }
          card._dragged = true; // the click that follows a drag is not a tap
          const hit = e.type === 'pointerup' ? spotAt(e.clientX, e.clientY) : null;
          if (hit) tryPlace(card, hit);
        };
        const stop = () => {
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerup', up);
          card.removeEventListener('pointercancel', up);
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up);
        card.addEventListener('pointercancel', up);
        onLeave(stop);
      });
      // Keyboard (Enter/Space) selects; pointer taps were handled on pointerup.
      card.addEventListener('click', (e) => { if (card._dragged || e.detail) { card._dragged = false; return; } select(card); });
    }

    // Geometry, not elementFromPoint: the card under the finger would hide the spot.
    function spotAt(x, y) {
      return spots.find((s) => {
        if (s.classList.contains('done')) return false;
        const r = s.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      }) || null;
    }

    root.replaceChildren(
      gear,
      el('p', { class: 'prompt v-prompt' }, drag === 'def' ? 'Drag each meaning to its word.' : 'Drag each word to its meaning.'),
      el('div', { class: 'vm-spots' }, spots),
      tray,
      msg,
      el('p', { class: 'label' }, `${num} of ${total}`),
    );
  }

  gear = cornerGear(() => {
    const before = opts.drag;
    const pop = openOptions({
      title: '⚙️ Match the Meaning',
      body: (redraw) => [choice('What you drag', opts.drag, DRAGS, (v) => { opts = { ...opts, drag: v }; saveOpts(opts); redraw(); })],
      onClose: () => { if (opts.drag !== before) play(); },
    });
    sc.onLeave(pop.dispose);
  });
  play();
  return () => sc.dispose();
}
