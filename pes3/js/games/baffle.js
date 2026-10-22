// Baffle: a Boggle-style 5x5 letter grid. Drag (or tap) across touching letters to make words.
// The grid is generated so it hides as many words.txt words as possible; any other real word
// (dict/words.txt) goes in the bonus jar. No timer, no score; after a while it offers a break.
// Helpers: blank slots for the list words are always shown; 💡 Hint blinks the next letter of a
// list word; look-ahead tints every remaining path to a list word, one colour per next tile. Look-ahead switches
// itself off once most of the week's words are found without hints (parent panel sets the rule).
import { el, chooseWords, isLetters, speakWord, celebrate, noWords, award, scope, cheer } from '../util.js';
import { loadDictionary, dictionaryReady, inDictionary, MIN_LEN } from '../dictionary.js';

export const N = 5;
const MAX_TARGETS = 24;           // most list words to aim for on one board
const BREAK_MINUTES = 8;          // offer a break after this long...
const BREAK_TRIES = 40;           // ...or this many tries...
const BREAK_STUCK = 12;           // ...or this many tries in a row with nothing new
const LOOK_KEY = 'spelling-games.baffle.lookahead';   // 'auto' (default) | 'on' | 'off'
const STATS_KEY = 'spelling-games.baffle.stats.v1';   // {games, words: {w: {solo, helped, free, streak}}}
const FLUENCY_KEY = 'spelling-games.baffle.fluency'; // {streak, share}, set in the parent panel
export const FLUENCY_DEFAULT = {
  streak: 2,     // a word is fluent after this many finds in a row with no hint
  share: 0.75,   // auto look-ahead turns off once this share of the list is fluent
};
const BLINK_MS = 2400;
// Look-ahead branch colours (contrasting, none close to the selected-tile indigo) and tint strength.
// Colour-blind-friendly: first four picked from Okabe-Ito (jfly.uni-koeln.de/color) and Paul Tol
// (personal.sron.nl/~pault) colours so that, simulated for protan/deutan/tritan vision at the tile tint,
// every pair stays distinct (the old pink/teal were nearly identical with deuteranopia). Branches 1-2
// (the common case) are the most distinct pair. 5-8 are the remaining Okabe-Ito colours.
const BRANCH_RGB = ['230, 159, 0', '102, 204, 238', '170, 51, 119', '34, 136, 51', '0, 114, 178', '240, 228, 66', '213, 94, 0', '204, 121, 167'];
const ALPHA_MIN = 0.22;   // a tile on one word's path
const ALPHA_MAX = 0.6;    // the tile most words pass through
const CHECK_ALPHA = 0.4;  // checkered tiles use at least this, or the two colours blur into one
// Same colours with neighbouring hues first, so the common 2-branch overlap mixes to coral, not grey.
const BLEND_RGB = ['236, 72, 153', '249, 115, 22', '234, 179, 8', '20, 184, 166', '14, 165, 233', '132, 204, 22', '168, 85, 247', '239, 68, 68'];

// ---- TEST ONLY (branch claude/baffle-lookahead-paths): remove before opening the PR ----
// Fixed board with overlapping branches (bunny/bunnies vs butterfly/butterflies share I-E-S), and a
// shared-tile style toggle. Add ?random to the page URL for normal boards (the automated tests do).
// Overlap boards: from B, the bunny board's bunnies/butterflies share I-E-S (2 branches, your
// words.txt); on the vowel board bats/bets/bits(/bots) each take a different vowel and then all
// share T-S (3 or 4 branches, with its own word list).
const BUNNY_GRID = [...'ubphs' + 'neutn' + 'ndrrt' + 'yiafe' + 'eslya'];
const VOWEL_GRID = [...'kqzxk' + 'kzaek' + 'qzbts' + 'kziok' + 'qxzkq'];
const TEST_BOARDS = [
  ['bunny', 'Bunny (2)', BUNNY_GRID, null],
  ['three', '3-way', VOWEL_GRID, ['bats', 'bets', 'bits']],
  ['four', '4-way', VOWEL_GRID, ['bats', 'bets', 'bits', 'bots']],
];
const BOARD_KEY = 'spelling-games.baffle.testboard';
function testBoard() {
  let k = null;
  try { k = localStorage.getItem(BOARD_KEY); } catch { /* ignore */ }
  return TEST_BOARDS.find((b) => b[0] === k) || TEST_BOARDS[0];
}
const TEST_BOARD = typeof location !== 'undefined' && !new URLSearchParams(location.search).has('random');
const OVERLAP_KEY = 'spelling-games.baffle.overlap';   // 'checker' | 'blend' | 'both'
const OVERLAP_MODES = [['checker', 'Checkered'], ['blend', 'Better blend'], ['both', 'Both']];
function overlapMode() {
  try { const m = localStorage.getItem(OVERLAP_KEY); return OVERLAP_MODES.some(([k]) => k === m) ? m : 'checker'; } catch { return 'checker'; }
}
// ---- end TEST ONLY ----

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
export const neighbours = (i) => [...NB[i]];

const rnd = (n) => Math.floor(Math.random() * n);
const shuffled = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

const ALL = [...Array(N * N).keys()];

// Cell indexes that spell `word` on grid g (25 letters, each cell used once), or null.
// With `start` (a path of touching cells), only paths that begin with those cells count.
export function findPath(g, word, start = []) {
  if (start.length > word.length || start.some((i, k) => g[i] !== word[k])) return null;
  const used = new Array(g.length).fill(false);
  const path = [...start];
  path.forEach((i) => { used[i] = true; });
  const grow = () => {
    if (path.length === word.length) return true;
    const ch = word[path.length];
    for (const j of path.length ? NB[path[path.length - 1]] : ALL) {
      if (used[j] || g[j] !== ch) continue;
      used[j] = true; path.push(j);
      if (grow()) return true;
      used[j] = false; path.pop();
    }
    return false;
  };
  return grow() ? path : null;
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
// Look-ahead: one way to finish `path` into each of `words` (the route findPath, and so the Hint,
// would take), grouped by the next tile. Showing every route lit up nearly every repeated letter
// (two R's usable in either order, two Y's, two S's) and blended all branches into one colour.
// Returns [{first, tiles: Map(cell -> number of words through it)}], sorted by first cell.
export function lookaheadBranches(g, words, path) {
  const branches = new Map();
  for (const w of words) {
    if (w.length <= path.length) continue;
    const route = findPath(g, w, path);
    if (!route) continue;
    const rest = route.slice(path.length);
    const b = branches.get(rest[0]) || new Map();
    branches.set(rest[0], b);
    for (const c of rest) b.set(c, (b.get(c) || 0) + 1);
  }
  return [...branches.keys()].sort((a, b) => a - b).map((first) => ({ first, tiles: branches.get(first) }));
}

/* ---------- look-ahead setting + hidden per-word stats (shown in the parent panel) ---------- */
export function lookaheadMode() {
  try { const m = localStorage.getItem(LOOK_KEY); return m === 'on' || m === 'off' ? m : 'auto'; } catch { return 'auto'; }
}
export function setLookaheadMode(m) { try { localStorage.setItem(LOOK_KEY, m); } catch { /* ignore */ } }
export function getStats() {
  try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s && s.words) return s; } catch { /* ignore */ }
  return { games: 0, words: {} };
}
function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function clearStats() { try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ } }
export function getFluency() {
  try {
    const f = JSON.parse(localStorage.getItem(FLUENCY_KEY)) || {};
    const streak = Number.isInteger(f.streak) && f.streak >= 1 ? f.streak : FLUENCY_DEFAULT.streak;
    const share = typeof f.share === 'number' && f.share > 0 && f.share <= 1 ? f.share : FLUENCY_DEFAULT.share;
    return { streak, share };
  } catch { return { ...FLUENCY_DEFAULT }; }
}
export function setFluency(f) { try { localStorage.setItem(FLUENCY_KEY, JSON.stringify({ ...getFluency(), ...f })); } catch { /* ignore */ } }
export const isFluent = (r, f = getFluency()) => !!r && r.streak >= f.streak;
export function fluentCount(words, stats = getStats(), f = getFluency()) { return words.filter((w) => isFluent(stats.words[w], f)).length; }
export const fluentNeeded = (words, f = getFluency()) => Math.ceil(f.share * words.length);
// Decided once per board, so tiles never stop lighting up halfway through a game.
export function lookaheadOn(words) {
  const m = lookaheadMode();
  return m === 'on' || (m === 'auto' && fluentCount(words) < fluentNeeded(words));
}

export function mount(root, entries, api) {
  let pool = entries.filter((e) => isLetters(e.word) && e.word.length >= 2);
  if (!pool.length) return noWords(root);
  let listWords = new Set(pool.map((e) => e.word));
  // TEST ONLY: the 3-/4-way boards bring their own word list.
  const useTestWords = () => {
    const ws = TEST_BOARD && testBoard()[3];
    pool = ws ? ws.map((word) => ({ word })) : entries.filter((e) => isLetters(e.word) && e.word.length >= 2);
    listWords = new Set(pool.map((e) => e.word));
  };
  useTestWords();
  loadDictionary();
  let sc = scope();

  function play() {
    sc.dispose();
    sc = scope();
    const chosen = chooseWords(pool, MAX_TARGETS);
    const { grid, hidden } = TEST_BOARD // TEST ONLY
      ? { grid: testBoard()[2], hidden: [...listWords].filter((w) => findPath(testBoard()[2], w)) }
      : generate(chosen.map((e) => e.word));
    const targets = new Map(hidden.map((w) => [w, pool.find((e) => e.word === w)]));
    const found = new Set();   // list words found
    const bonus = new Set();   // other real words found
    const hinted = new Set();  // list words the Hint button helped with on this board
    const look = lookaheadOn([...listWords]);
    let hintWord = null;       // slot the last hint was for
    let counted = false;       // this board counted in stats.games yet?
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
    const hintBtn = el('button', { class: 'btn', type: 'button', onclick: () => hint() }, '💡 Hint');
    const listArea = el('div', { class: 'bf-list' });
    const bonusArea = el('div', { class: 'bf-list' });
    const slotWords = [...targets.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));

    /* --- look-ahead: tint each remaining path to an unfound spelling word, one colour per branch --- */
    const spell = (p) => p.map((i) => grid[i]).join('');
    const openWords = () => [...listWords].filter((w) => !found.has(w) && !bonus.has(w));
    // More words through a tile = stronger tint. A tile on several branches either gets a small
    // checkerboard of the branch colours (no direction, unlike diagonals or stripes) or translucent
    // layers that blend.
    function paintLookahead(p) {
      const mode = overlapMode();
      const palette = mode === 'checker' ? BRANCH_RGB : BLEND_RGB;
      const shades = tiles.map(() => []);
      const branches = look && p.length ? lookaheadBranches(grid, openWords(), p) : [];
      const most = Math.max(1, ...branches.flatMap((b) => [...b.tiles.values()]));
      branches.forEach((b, k) => {
        const rgb = palette[k % palette.length];
        for (const [c, n] of b.tiles) {
          const a = (ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * (n - 1) / Math.max(1, most - 1)).toFixed(2);
          shades[c].push({ rgb, a: +a });
        }
      });
      // 2 or 4 colours: a checkerboard (the 4 quarters of each repeated cell). 3 or 5+: one pie centred
      // on the letter, cropped by the square. A colour must never face itself across the centre, or
      // it reads as a line: 3 colours repeat 3 times (9 slices, 120 deg apart; 6 or 12 slices put a
      // colour opposite itself), 5+ distinct colours go round once.
      const checker = (cs) => {
        const cols = cs.map(({ rgb, a }) => `rgba(${rgb}, ${Math.max(a, CHECK_ALPHA)})`);
        const seq = cols.length === 2 ? [...cols, ...cols] : cols.length === 3 ? [...cols, ...cols, ...cols] : cols;
        const step = 100 / seq.length;
        return `conic-gradient(${seq.map((c, j) => `${c} ${(j * step).toFixed(1)}% ${((j + 1) * step).toFixed(1)}%`).join(', ')})`;
      };
      const isPie = (n) => n === 3 || n > 4;
      tiles.forEach((t, i) => {
        const cs = shades[i];
        const checkered = cs.length > 1 && mode !== 'blend';
        t.style.backgroundImage = checkered ? checker(cs) : cs.map(({ rgb, a }) => `linear-gradient(rgba(${rgb}, ${a}), rgba(${rgb}, ${a}))`).join(', ');
        t.style.backgroundSize = checkered && !isPie(cs.length) ? '50% 50%' : ''; // checker: 2x2 cells = 4x4 checks
        const k = branches.findIndex((b) => b.first === i);
        t.classList.toggle('next', k >= 0);
        if (k >= 0) t.style.setProperty('--ring', `rgb(${palette[k % palette.length]})`);
        else t.style.removeProperty('--ring');
      });
    }

    /* --- current path --- */
    let path = [];
    function setPath(p) {
      path = p;
      tiles.forEach((t, i) => {
        t.classList.toggle('sel', path.includes(i));
        t.classList.toggle('last', i === path[path.length - 1]);
      });
      paintLookahead(path);
      current.textContent = spell(path).toUpperCase();
      current.classList.toggle('word', look && openWords().includes(spell(path)));
      checkBtn.hidden = clearBtn.hidden = path.length === 0 || dragging;
    }

    /* --- hint: blink the next letter of a spelling word, keeping as much of her path as fits --- */
    let blinkTimer = null;
    function blink(i) {
      clearTimeout(blinkTimer);
      tiles.forEach((t) => t.classList.remove('blink'));
      void tiles[i].offsetWidth; // restart the animation if the same tile blinks again
      tiles[i].classList.add('blink');
      blinkTimer = sc.later(() => tiles[i].classList.remove('blink'), BLINK_MS);
    }
    function hint() {
      const left = slotWords.filter((w) => !found.has(w));
      if (!left.length) { msg.textContent = 'You found every spelling word! Look for bonus words. 🫙'; return; }
      // The word her letters already start (most letters kept wins; ties keep the last hinted word,
      // then slot order), else the next empty slot.
      const order = left.includes(hintWord) ? [hintWord, ...left.filter((w) => w !== hintWord)] : left;
      let best = { w: order[0], k: 0, route: findPath(grid, order[0]) };
      for (const w of order) {
        for (let k = path.length; k > best.k; k--) {
          const route = findPath(grid, w, path.slice(0, k));
          if (route) { best = { w, k, route }; break; }
        }
      }
      const { w, k, route } = best;
      const switched = w !== hintWord;
      hinted.add(w);
      hintWord = w;
      drawLists();
      if (k < path.length) setPath(route.slice(0, k)); // drop letters that lead away from it
      if (k === w.length) {
        msg.textContent = 'That spells it! Tap ✔ Check. ⭐';
        return blink(route[k - 1]);
      }
      if (k === 0 || switched) speakWord(targets.get(w)); // say which word; in the tap, so iOS lets it play
      msg.textContent = k === 0 ? 'Listen! Start with the blinking letter. 💡' : 'The blinking letter comes next! 💡';
      blink(route[k]);
    }

    /* --- word lists: blank slots for each hidden spelling word, filled in when found --- */
    const chip = (w, cls) => el('button', { class: `chip ${cls}`, type: 'button', onclick: () => speakWord(targets.get(w) || w) }, w);
    function drawLists() {
      listArea.replaceChildren();
      if (slotWords.length) {
        listArea.append(
          el('h3', {}, '⭐ Spelling words'),
          ...slotWords.map((w) => (found.has(w)
            ? el('button', { class: 'bf-slots done', type: 'button', 'data-w': w, onclick: () => speakWord(targets.get(w)) }, [...w].map((c) => el('span', {}, c)))
            : el('div', { class: `bf-slots${w === hintWord ? ' now' : ''}`, 'data-w': w }, [...w].map(() => el('span', {}, ''))))),
        );
      } else if (!bonus.size) {
        listArea.append(el('p', { class: 'small' }, 'Words you find go here.'));
      }
      bonusArea.replaceChildren();
      if (bonus.size) bonusArea.append(el('h3', {}, '🫙 Bonus words'), el('div', { class: 'chips' }, [...bonus].map((w) => chip(w, 'bonus'))));
    }

    // Hidden stats: a find with no hint for that word grows its streak; a hinted find resets it.
    function record(w) {
      const s = getStats();
      const r = s.words[w] || { solo: 0, helped: 0, free: 0, streak: 0 };
      if (hinted.has(w)) { r.helped++; r.streak = 0; } else { r.solo++; r.streak++; if (!look) r.free++; }
      if (!counted) { s.games = (s.games || 0) + 1; counted = true; }
      s.words[w] = r;
      saveStats(s);
    }

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
        record(word);
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
          TEST_BOARD ? overlapToggle() : null, // TEST ONLY
          listArea,
          bonusArea,
        ),
      ),
    );
    drawLists();

    // TEST ONLY: switch how shared tiles look, keeping the current letters selected.
    function overlapToggle() {
      const box = el('div', { class: 'row bf-test' });
      const draw = () => box.replaceChildren(
        el('span', { class: 'small' }, 'Shared tiles (test):'),
        ...OVERLAP_MODES.map(([k, label]) => el('button', {
          class: `btn${k === overlapMode() ? ' primary' : ''}`, type: 'button', 'data-mode': k,
          onclick: () => { try { localStorage.setItem(OVERLAP_KEY, k); } catch { /* ignore */ } draw(); setPath(path); },
        }, label)),
        el('span', { class: 'small' }, 'Board (test):'),
        ...TEST_BOARDS.map(([k, label]) => el('button', {
          class: `btn${k === testBoard()[0] ? ' primary' : ''}`, type: 'button', 'data-board': k,
          onclick: () => { try { localStorage.setItem(BOARD_KEY, k); } catch { /* ignore */ } useTestWords(); play(); },
        }, label)),
      );
      draw();
      return box;
    }
  }

  play();
  return () => sc.dispose();
}
