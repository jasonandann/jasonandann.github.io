// Game options (Jason, 2026-10-24): necessary choices stay on a game's start screen; everything with a
// sensible default lives behind one ⚙️ Options button and opens in a pop-up (the Zombie Trail model).
import { el } from './util.js';

// One labelled row of buttons; the current value is highlighted. onPick(value) runs on a tap.
export function choice(label, current, opts, onPick, cls = '') {
  return el('div', { class: 'seg' + (cls ? ' ' + cls : '') },
    el('p', { class: 'label' }, label),
    el('div', { class: 'row' },
      opts.map(([val, text]) =>
        el('button', {
          class: 'btn' + (current === val ? ' primary' : ''), type: 'button', 'aria-pressed': String(current === val),
          onclick: () => onPick(val),
        }, text),
      ),
    ),
  );
}

// The pop-up. body(redraw) returns its rows; call redraw() after a change to draw them again.
// Done, a tap outside or Escape closes it and calls onClose(); dispose() removes it without (game cleanup).
export function openOptions({ title = '⚙️ Options', body, onClose, cls = '' }) {
  const panel = el('div', { class: 'panel zt-options opt-panel' + (cls ? ' ' + cls : '') });
  let overlay = null;
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  function dispose() { // leaving the game with the pop-up open: just remove it
    if (!overlay) return false;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onEsc);
    return true;
  }
  function close() { if (dispose() && onClose) onClose(); }
  function redraw() {
    panel.replaceChildren(
      el('h2', {}, title),
      ...body(redraw).filter(Boolean),
      el('button', { class: 'btn primary big opt-done', type: 'button', onclick: close }, 'Done'),
    );
  }
  redraw();
  overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title.replace(/^\W+/, ''),
    onclick: (e) => { if (e.target === overlay) close(); } }, panel);
  document.addEventListener('keydown', onEsc);
  document.body.append(overlay);
  return { close, redraw, dispose };
}

// The button on a start screen, with a one-line summary of what is set under it.
export function optionsButton({ summary, onOpen, label = '⚙️ Options', cls = '' }) {
  return el('div', { class: 'seg' },
    el('button', { class: 'btn opt-more' + (cls ? ' ' + cls : ''), type: 'button', onclick: onOpen }, label),
    summary ? el('p', { class: 'label opt-summary' }, summary) : null,
  );
}

// A small ⚙️ in the corner of a game that has no start screen (the math games).
export function cornerGear(onOpen) {
  return el('button', { class: 'btn opt-gear', type: 'button', 'aria-label': 'Options', onclick: onOpen }, '⚙️');
}
