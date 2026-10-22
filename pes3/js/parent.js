// Hidden "grown-ups" panel. Opened by tapping the page title 5 times quickly,
// or by typing "parent" on the home screen. Nothing on the child-facing screens links here.
import { el, getProgress, clearProgress, isLetters } from './util.js';
import { offlineStatus, updateNow, resetOffline } from './offline.js';
import { lookaheadMode, setLookaheadMode, getStats, clearStats, isFluent, fluentCount, fluentNeeded, getFluency, setFluency } from './games/baffle.js';

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
  const fl = getFluency();
  const fluent = fluentCount(bfWords, bf, fl);
  const need = fluentNeeded(bfWords, fl);
  const mode = lookaheadMode();
  const lookNote = mode === 'on' ? 'Always on.' : mode === 'off' ? 'Off.'
    : `Auto: ${fluent < need ? 'on' : 'off'} now. ${fluent} of ${bfWords.length} words found ${fl.streak}+ times in a row with no hint; it turns off at ${need} (checked when a new board starts).`;
  const modeBtn = (m, label) => el('button', {
    class: `btn${m === mode ? ' primary' : ''}`, type: 'button', 'aria-pressed': String(m === mode),
    onclick: () => { setLookaheadMode(m); reopen(); },
  }, label);
  const bfRows = bfWords.filter((w) => bf.words[w]);
  const reopen = () => { close(); openParent(entries); };
  const picker = (label, value, options, save) => el('label', { class: 'pick' }, label,
    el('select', { onchange: (e) => { save(Number(e.target.value)); reopen(); } },
      options.map(([v, text]) => el('option', { value: v, selected: v === value }, text))));
  const fluencyRow = el('div', { class: 'row' },
    picker('Fluent after ', fl.streak, [1, 2, 3, 4, 5].map((n) => [n, `${n} in a row`]), (n) => setFluency({ streak: n })),
    picker('Auto off at ', fl.share, [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1].map((x) => [x, `${Math.round(x * 100)}% of list`]), (x) => setFluency({ share: x })));

  // Offline copy (issue #13): what this device has saved, plus manual update/reset. Filled in when the worker answers.
  const offNote = el('p', { class: 'small offline-status' }, 'Checking the offline copy…');
  const LAST = {
    quiet: 'nothing new', same: 'compared every file, nothing new', swapped: 'updated',
    mixed: 'the site was in the middle of an update, so the current copy was kept (it tries again next time)',
    offline: 'no internet',
  };
  offlineStatus().then((st) => {
    const last = st && st.last ? ` Last check ${new Date(st.last.at).toLocaleTimeString()}: ${LAST[st.last.result] || st.last.result}.` : '';
    offNote.textContent = !st ? 'No offline copy in this browser (needs https and service worker support).'
      : st.files ? `Offline copy: ${st.files} files, saved ${new Date(st.since).toLocaleString()}.${last} Updates load by themselves when she is on the home menu.`
        : 'Offline copy not saved yet. It is saved the first time the app opens with internet.';
  });
  const busyBtn = (label, run) => el('button', {
    class: 'btn', type: 'button',
    onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Working…'; run(); },
  }, label);

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
      el('p', { class: 'small' }, 'Lights up letters that can still make one of this week’s words. ' + lookNote),
      el('div', { class: 'row' }, modeBtn('auto', 'Auto'), modeBtn('on', 'Always on'), modeBtn('off', 'Off')),
      fluencyRow,
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
      el('h3', {}, 'App updates'),
      offNote,
      el('div', { class: 'row' },
        busyBtn('Check for updates', updateNow),
        busyBtn('Reset offline copy', () => {
          if (confirm('Delete the saved offline copy and download it again? Needs the internet. Progress, Baffle stats and the garden are kept.')) resetOffline();
          else reopen();
        }),
      ),
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
