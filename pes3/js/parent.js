// Hidden "grown-ups" panel. Opened by tapping the page title 5 times quickly,
// or by typing "parent" on the home screen. Nothing on the child-facing screens links here.
import { el, getProgress, clearProgress, isLetters } from './util.js';
import { lookaheadMode, setLookaheadMode, getStats, clearStats, isFluent, fluentCount, FLUENT_STREAK, FLUENT_SHARE } from './games/baffle.js';

export function openParent(entries) {
  if (document.querySelector('.overlay')) return;
  const p = getProgress();
  const rows = entries
    .map((e) => {
      const s = p.words[e.word] || { c: 0, m: 0 };
      return { word: e.word, c: s.c, m: s.m };
    })
    .sort((a, b) => b.m - a.m || (b.m + b.c) - (a.m + a.c) || a.word.localeCompare(b.word));
  const days = Object.entries(p.days).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const focus = rows.filter((r) => r.m > 0 && r.m >= r.c).map((r) => r.word);
  // Baffle helpers: look-ahead setting + per-word finds (Baffle keeps its own stats).
  const bf = getStats();
  const bfWords = entries.map((e) => e.word).filter((w) => isLetters(w) && w.length >= 2);
  const fluent = fluentCount(bfWords, bf);
  const need = Math.ceil(FLUENT_SHARE * bfWords.length);
  const mode = lookaheadMode();
  const lookNote = mode === 'on' ? 'Always on.' : mode === 'off' ? 'Off.'
    : `Auto: ${fluent < need ? 'on' : 'off'} now. ${fluent} of ${bfWords.length} words found ${FLUENT_STREAK}+ times in a row with no hint; it turns off at ${need} (checked when a new board starts).`;
  const modeBtn = (m, label) => el('button', {
    class: `btn${m === mode ? ' primary' : ''}`, type: 'button', 'aria-pressed': String(m === mode),
    onclick: () => { setLookaheadMode(m); close(); openParent(entries); },
  }, label);
  const bfRows = bfWords.filter((w) => bf.words[w]);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);

  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'panel' },
      el('h2', {}, 'Grown-ups only'),
      el('p', { class: 'small' }, 'Saved only in this browser on this device. “First try” = spelled correctly with no misses or hints.'),
      el('h3', {}, 'Words to keep practicing'),
      el('p', {}, focus.length ? focus.join(', ') : 'Nothing stands out yet.'),
      el('h3', {}, 'This week’s list'),
      el('table', {},
        el('thead', {}, el('tr', {}, ['Word', 'Rounds', 'First try', 'Needed help'].map((h) => el('th', {}, h)))),
        el('tbody', {}, rows.map((r) =>
          el('tr', {}, el('td', {}, r.word), el('td', {}, r.c + r.m), el('td', {}, r.c), el('td', { class: r.m > r.c ? 'flag' : '' }, r.m)),
        )),
      ),
      el('h3', {}, 'Baffle look-ahead'),
      el('p', { class: 'small' }, 'Lights up letters that can still make a word. ' + lookNote),
      el('div', { class: 'row' }, modeBtn('auto', 'Auto'), modeBtn('on', 'Always on'), modeBtn('off', 'Off')),
      bfRows.length
        ? el('table', {},
          el('thead', {}, el('tr', {}, ['Word', 'Found, no hint', 'Look-ahead off', 'With hint', 'In a row'].map((h) => el('th', {}, h)))),
          el('tbody', {}, bfRows.map((w) => {
            const r = bf.words[w];
            return el('tr', {}, el('td', {}, w), el('td', {}, r.solo), el('td', {}, r.free || 0),
              el('td', { class: r.helped > r.solo ? 'flag' : '' }, r.helped), el('td', {}, isFluent(r) ? `${r.streak} ✓` : r.streak));
          })))
        : el('p', {}, `No Baffle words found yet${bf.games ? '' : ' (no boards played)'}.`),
      bf.games ? el('p', { class: 'small' }, `${bf.games} Baffle boards with at least one spelling word found.`) : null,
      el('h3', {}, 'Recent practice days'),
      days.length
        ? el('table', {}, el('tbody', {}, days.map(([d, v]) => el('tr', {}, el('td', {}, d), el('td', {}, `${v.c + v.m} rounds`)))))
        : el('p', {}, 'No practice recorded yet.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: close }, 'Close'),
        el('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            if (confirm('Erase all saved practice history on this device?')) { clearProgress(); clearStats(); close(); openParent(entries); }
          },
        }, 'Erase history'),
      ),
    ),
  );
  document.body.append(overlay);
}
