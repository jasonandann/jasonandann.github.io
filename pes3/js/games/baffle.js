// Baffle: a Boggle-style 5x5 letter grid. Drag (or tap) across touching letters to make words.
// The grid is generated so it hides as many words.txt words as possible; any other real word
// (dict/words.txt) goes in the bonus jar. No timer, no score; after a while it offers a break.
import { el, chooseWords, isLetters, speakWord, celebrate, noWords, award, scope, cheer } from '../util.js';
import { loadDictionary, dictionaryReady, inDictionary, MIN_LEN } from '../dictionary.js';

export const N = 5;
const MAX_TARGETS = 24;           // most list words to aim for on one board
const BREAK_MINUTES = 8;          // offer a break after this long...
const BREAK_TRIES = 40;           // ...or this many tries...
const BREAK_STUCK = 12;           // ...or this many tries in a row with nothing new
const HINTS_KEY = 'spelling-games.baffle.hints';

/* ---------- grid generation ---------- */
const NB = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N);
  const c = i % N;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
    }
  }
  return out;
});
export const touching = (a, b) => NB[a].includes(b);

const rnd = (n) => Math.floor(Math.random() * n);
const shuffled = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

// Cell indexes that spell `word` on grid g (25 letters, each cell used once), or null.
export function findPath(g, word) {
  const used = new Array(g.length).fill(false);
  const path = [];
  const dfs = (i, k) => {
    used[i] = true; path.push(i);
    if (k === word.length - 1) return true;
    for (const j of NB[i]) if (!used[j] && g[j] === word[k + 1] && dfs(j, k + 1)) return true;
    used[i] = false; path.pop();
    return false;
  };
  for (let i = 0; i < g.length; i++) if (g[i] === word[0] && dfs(i, 0)) return path;
  return null;
}

// Try to lay `word` along a random path through empty cells or cells already holding the right letter.
function embed(g, word) {
  const used = new Array(g.length).fill(false);
  const path = [];
  const ok = (i, k) => !used[i] && (g[i] === '' || g[i] === word[k]);
  const dfs = (i, k) => {
    used[i] = true; path.push(i);
    if (k === word.length - 1) return true;
    for (const j of shuffled(NB[i])) if (ok(j, k + 1) && dfs(j, k + 1)) return true;
    used[i] = false; path.pop();
    return false;
  };
  for (const i of shuffled(g.keys())) {
    if (ok(i, 0) && dfs(i, 0)) { path.forEach((p, k) => { g[p] = word[k]; }); return true; }
  }
  return false;
}

// More words beats longer words; length breaks ties.
const value = (g, words) => words.reduce((s, w) => (findPath(g, w) ? s + 10 + w.length : s), 0);

// words: lowercase letters-only. Returns {grid: [25 letters], hidden: [words on the grid]}.
// Restarts stop early once budgetMs is used up, so slower tablets don't freeze for long.
export function generate(words, { restarts = 8, iters = 4000, budgetMs = 400 } = {}) {
  const pool = [...words.join('') + 'aeiourstln'];
  const t0 = Date.now();
  let best = null;
  let bestV = -1;
  for (let t = 0; t < restarts && (t < 2 || Date.now() - t0 < budgetMs); t++) {
    const g = Array(N * N).fill('');
    // Longest first (hardest to fit), with some shuffling so each board differs.
    const order = shuffled(words).sort((a, b) => b.length - a.length + (Math.random() - 0.5) * 3);
    for (const w of order) embed(g, w);
    for (let i = 0; i < g.length; i++) if (!g[i]) g[i] = pool[rnd(pool.length)];
    // Simulated annealing: change or swap letters, keep changes that hide more words.
    let v = value(g, words);
    for (let k = 0; k < iters; k++) {
      const temp = 4 * (1 - k / iters) + 0.05;
      const a = rnd(g.length);
      const b = rnd(g.length);
      const old = g[a];
      const swap = Math.random() < 0.5;
      if (swap) { g[a] = g[b]; g[b] = old; } else g[a] = pool[rnd(pool.length)];
      const v2 = value(g, words);
      if (v2 >= v || Math.random() < Math.exp((v2 - v) / temp)) {
        v = v2;
        if (v > bestV) { bestV = v; best = [...g]; }
      } else if (swap) { g[b] = g[a]; g[a] = old; } else g[a] = old;
    }
    if (v > bestV) { bestV = v; best = [...g]; }
  }
  return { grid: best, hidden: words.filter((w) => findPath(best, w)) };
}

/* ---------- game ---------- */
function hintsOn() { try { return localStorage.getItem(HINTS_KEY) === '1'; } catch { return false; } }
function saveHints(on) { try { localStorage.setItem(HINTS_KEY, on ? '1' : '0'); } catch { /* ignore */ } }

export function mount(root, entries, api) {
  const pool = entries.filter((e) => isLetters(e.word) && e.word.length >= 2);
  if (!pool.length) return noWords(root);
  loadDictionary();
  const listWords = new Set(pool.map((e) => e.word));
  let sc = scope();

  function play() {
    sc.dispose();
    sc = scope();
    const chosen = chooseWords(pool, MAX_TARGETS);
    const { grid, hidden } = generate(chosen.map((e) => e.word));
    const targets = new Map(hidden.map((w) => [w, pool.find((e) => e.word === w)]));
    const found = new Set();   // list words found
    const bonus = new Set();   // other real words found
    let showHints = hintsOn();
    let tries = 0;
    let stuck = 0;
    let started = Date.now();
    let allDone = false;

    const tiles = grid.map((ch, i) => el('div', { class: 'bf-tile', 'data-i': i }, ch.toUpperCase()));
    const gridEl = el('div', { class: 'bf-grid' }, tiles);
    const current = el('div', { class: 'bf-current', 'aria-live': 'polite' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const checkBtn = el('button', { class: 'btn primary', type: 'button', hidden: true, onclick: () => submit() }, '✔ Check');
    const clearBtn = el('button', { class: 'btn', type: 'button', hidden: true, onclick: () => setPath([]) }, '✖ Clear');
    const hintBtn = el('button', { class: 'btn', type: 'button', onclick: toggleHints });
    const listArea = el('div', { class: 'bf-list' });
    const bonusArea = el('div', { class: 'bf-list' });

    /* --- current path --- */
    let path = [];
    function setPath(p) {
      path = p;
      tiles.forEach((t, i) => t.classList.toggle('sel', path.includes(i)));
      tiles.forEach((t) => t.classList.remove('last'));
      if (path.length) tiles[path[path.length - 1]].classList.add('last');
      current.textContent = path.map((i) => grid[i]).join('').toUpperCase();
      checkBtn.hidden = clearBtn.hidden = path.length === 0 || dragging;
    }

    /* --- word lists --- */
    const chip = (w, cls) => el('button', { class: `chip ${cls}`, type: 'button', onclick: () => speakWord(targets.get(w) || w) }, w);
    function drawLists() {
      hintBtn.textContent = showHints ? '💡 Hide hints' : '💡 Hints';
      listArea.replaceChildren();
      if (showHints) {
        const words = [...targets.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
        listArea.append(
          el('h3', {}, '⭐ Spelling words'),
          ...words.map((w) => (found.has(w)
            ? el('button', { class: 'bf-slots done', type: 'button', onclick: () => speakWord(targets.get(w)) }, [...w].map((c) => el('span', {}, c)))
            : el('div', { class: 'bf-slots' }, [...w].map(() => el('span', {}, ''))))),
        );
      } else if (found.size) {
        listArea.append(el('h3', {}, '⭐ Spelling words'), el('div', { class: 'chips' }, [...found].map((w) => chip(w, 'got'))));
      } else if (!bonus.size) {
        listArea.append(el('p', { class: 'small' }, 'Words you find go here.'));
      }
      bonusArea.replaceChildren();
      if (bonus.size) bonusArea.append(el('h3', {}, '🫙 Bonus words'), el('div', { class: 'chips' }, [...bonus].map((w) => chip(w, 'bonus'))));
    }
    function toggleHints() { showHints = !showHints; saveHints(showHints); drawLists(); }

    /* --- checking a word --- */
    function flash(cls) {
      const p = path.map((i) => tiles[i]);
      p.forEach((t) => t.classList.add(cls));
      sc.later(() => p.forEach((t) => t.classList.remove(cls)), 700);
    }
    function submit() {
      const word = path.map((i) => grid[i]).join('');
      if (path.length < 2) return setPath([]);
      tries++;
      let isNew = false;
      if (found.has(word) || bonus.has(word)) {
        msg.textContent = 'You found that one already! ⭐';
      } else if (targets.has(word)) {
        found.add(word); isNew = true;
        speakWord(targets.get(word));
        msg.textContent = `${cheer()} ⭐`;
        flash('good');
      } else if (word.length < MIN_LEN && !listWords.has(word)) {
        msg.textContent = 'Words need 3 letters or more.';
      } else if (listWords.has(word) || inDictionary(word)) {
        bonus.add(word); isNew = true;
        speakWord(word);
        msg.textContent = 'Bonus word! 🫙';
        flash('bonus');
      } else if (!dictionaryReady()) {
        msg.textContent = 'Still opening my word book. Try that one again in a moment!';
      } else {
        msg.textContent = "Hmm, I don't know that word. Try another!";
      }
      setPath([]);
      if (isNew) {
        award();
        stuck = 0;
        drawLists();
        if (!allDone && targets.size && found.size === targets.size) {
          allDone = true;
          msg.textContent = 'You found every spelling word! 🎉 Keep looking for bonus words, or try new letters.';
          celebrate(root);
        }
      } else stuck++;
      maybeBreak();
    }

    /* --- gentle break prompt --- */
    let breakShown = false;
    function maybeBreak() {
      if (breakShown || dragging) return;
      if (tries >= BREAK_TRIES || stuck >= BREAK_STUCK || Date.now() - started >= BREAK_MINUTES * 60000) showBreak();
    }
    const tick = () => { maybeBreak(); sc.later(tick, 15000); };
    sc.later(tick, 15000);
    function showBreak() {
      breakShown = true;
      const box = el('div', { class: 'bf-break', role: 'dialog' },
        el('div', { class: 'bf-break-card' },
          el('div', { class: 'big-emoji' }, '😊'),
          el('h2', {}, "Getting tired? Let's take a break!"),
          el('div', { class: 'row' },
            el('button', { class: 'btn big', type: 'button', onclick: () => {
              box.remove(); breakShown = false; tries = 0; stuck = 0; started = Date.now();
            } }, 'Keep playing'),
            el('button', { class: 'btn primary big', type: 'button', onclick: () => { box.remove(); wrapUp(); } }, 'All done'),
          ),
        ),
      );
      root.append(box);
    }
    function wrapUp() {
      sc.dispose();
      const hiding = [...targets.keys()].filter((w) => !found.has(w));
      const peek = el('div', { class: 'chips', hidden: true }, hiding.map((w) => chip(w, '')));
      const got = [...found, ...bonus];
      root.replaceChildren(
        el('div', { class: 'finish' },
          el('div', { class: 'big-emoji' }, '🎉'),
          el('h2', {}, got.length ? 'Great finding!' : 'Thanks for playing!'),
          got.length ? el('div', { class: 'chips' }, [...found].map((w) => chip(w, 'got')), [...bonus].map((w) => chip(w, 'bonus'))) : null,
          hiding.length ? el('button', { class: 'btn', type: 'button', onclick: (e) => { peek.hidden = false; e.currentTarget.remove(); } }, '👀 Peek at the hiding words') : null,
          peek,
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big', type: 'button', onclick: play }, 'New letters'),
            el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
          ),
        ),
      );
      if (got.length) celebrate(root);
    }

    /* --- touch / mouse: drag across letters, or tap them one by one --- */
    let dragging = false;
    let moved = false;
    // Tile under the pointer; only near the tile's centre so diagonal drags don't clip neighbours.
    function tileAt(e) {
      const r = gridEl.getBoundingClientRect();
      const size = r.width / N;
      const c = Math.floor((e.clientX - r.left) / size);
      const rw = Math.floor((e.clientY - r.top) / size);
      if (c < 0 || c >= N || rw < 0 || rw >= N) return -1;
      const dx = e.clientX - (r.left + (c + 0.5) * size);
      const dy = e.clientY - (r.top + (rw + 0.5) * size);
      return Math.hypot(dx, dy) <= size * 0.42 ? rw * N + c : -1;
    }
    gridEl.addEventListener('pointerdown', (e) => {
      const i = tileAt(e);
      if (i < 0) return;
      e.preventDefault();
      if (gridEl.setPointerCapture) try { gridEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      dragging = true;
      moved = false;
      const last = path[path.length - 1];
      if (path.length && i === last) { dragging = false; return submit(); } // tap the last letter again = check
      if (path.length && !path.includes(i) && touching(last, i)) return setPath([...path, i]);
      if (path.includes(i)) return setPath(path.slice(0, path.indexOf(i) + 1));
      setPath([i]);
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const i = tileAt(e);
      if (i < 0 || i === path[path.length - 1]) return;
      if (i === path[path.length - 2]) { moved = true; return setPath(path.slice(0, -1)); } // slid back
      if (!path.includes(i) && touching(path[path.length - 1], i)) { moved = true; setPath([...path, i]); }
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      if (moved && path.length > 1) submit();
      else setPath(path); // tap mode: show Check/Clear
    };
    gridEl.addEventListener('pointerup', up);
    gridEl.addEventListener('pointercancel', up);

    root.replaceChildren(
      el('p', { class: 'prompt' }, 'Find words! Slide across letters that touch.'),
      el('div', { class: 'bf' },
        gridEl,
        el('div', { class: 'bf-side' },
          el('div', { class: 'row bf-now' }, current, checkBtn, clearBtn),
          msg,
          el('div', { class: 'row' }, hintBtn, el('button', { class: 'btn', type: 'button', onclick: play }, '🔀 New letters'),
            el('button', { class: 'btn', type: 'button', onclick: wrapUp }, '🏁 All done')),
          listArea,
          bonusArea,
        ),
      ),
    );
    drawLists();
  }

  play();
  return () => sc.dispose();
}
