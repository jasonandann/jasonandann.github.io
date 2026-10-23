import { el, loadWords } from './util.js';
import { openParent } from './parent.js';
import { initOffline, checkForUpdates, reloadIfPending } from './offline.js';
import * as jumble from './games/jumble.js';
import * as typeit from './games/typeit.js';
import * as fillblank from './games/fillblank.js';
import * as memory from './games/memory.js';
import * as wordsearch from './games/wordsearch.js';
import * as baffle from './games/baffle.js';
import * as lcwc from './games/lcwc.js';
import * as zombie from './games/zombie.js';
import * as words from './games/words.js';
import * as catcher from './games/catcher.js';
import * as volcano from './games/volcano.js';
import * as wordal from './games/wordal.js';
import * as mq from './games/mathquiz.js';
import * as puzzle from './games/puzzle.js';
import * as explorer from './games/explorer.js';
import * as spotmatch from './games/spotmatch.js';
import * as simon from './games/simon.js';
import * as garden from './games/garden.js';
import * as river from './games/river.js';
import * as robot from './games/robot.js';

// id: deep-link name (index.html#robot opens Robot Course); keep them stable once shared.
// needsWords: game uses words.txt (spelling). Sections appear in this order on the home screen.
const SECTIONS = [
  { title: '✏️ Spelling', needsWords: true, games: [
    { icon: '📖', id: 'words', name: 'See the Words', blurb: 'Tap a word to hear it', mod: words },
    { icon: '🔀', id: 'jumble', name: 'Word Jumble', blurb: 'Put the letters in order', mod: jumble },
    { icon: '✏️', id: 'blanks', name: 'Fill the Blanks', blurb: 'Find the missing letters', mod: fillblank },
    { icon: '👀', id: 'lcwc', name: 'Look, Cover, Write, Check', blurb: 'Study it, hide it, spell it', mod: lcwc },
    { icon: '🌧️', id: 'catcher', name: 'Spell Catcher', blurb: 'Catch the falling letters', mod: catcher },
    { icon: '🌋', id: 'volcano', name: 'Word Volcano', blurb: 'Tap the rocks in order', mod: volcano },
    { icon: '🃏', id: 'memory', name: 'Memory Match', blurb: 'Match the word pairs', mod: memory },
    { icon: '🤯', id: 'baffle', name: 'Baffle', blurb: 'Make words from touching letters', mod: baffle },
    { icon: '🔎', id: 'search', name: 'Word Search', blurb: 'Find the hidden words', mod: wordsearch },
    { icon: '🟩', id: 'wordal', name: 'Wordal', blurb: 'Guess the word in six tries', mod: wordal },
    { icon: '👂', id: 'listen', name: 'Listen & Type', blurb: 'Hear it, then spell it', mod: typeit },
  ] },
  { title: '➗ Math', games: [
    { icon: '🫧', id: 'bubbles', name: 'Number Bubbles', blurb: 'Pop the right answer', mod: mq.bubbles },
    { icon: '🔢', id: 'cascade', name: 'Number Cascade', blurb: 'Find it on the board', mod: mq.cascade },
    { icon: '🧮', id: 'times', name: 'Times Table Explorer', blurb: 'Look, practice, spot patterns', mod: explorer },
    { icon: '🚪', id: 'maze', name: 'Number Maze', blurb: 'Pick the right door', mod: mq.maze },
    { icon: '⛰️', id: 'mountain', name: 'Number Mountain', blurb: 'Climb to the top', mod: mq.mountain },
    { icon: '🧩', id: 'puzzle', name: 'Puzzle Pieces', blurb: 'Uncover the picture', mod: puzzle },
  ] },
  { title: '💻 Coding', games: [
    { icon: '🤖', id: 'robot', name: 'Robot Course', blurb: 'Plan a path, press go', mod: robot },
  ] },
  { title: '🎲 Fun', games: [
    { icon: '🧟', id: 'zombie', name: 'Zombie Trail', blurb: 'Race to the finish', needsWords: true, mod: zombie },
    { icon: '🐸', id: 'river', name: 'Lily Pad River', blurb: 'Hop on the right answer', mod: river },
    { icon: '👁️', id: 'spot', name: 'Spot Match', blurb: 'Find the matching picture', mod: spotmatch },
    { icon: '🎵', id: 'simon', name: 'Simon Says', blurb: 'Copy the pattern', mod: simon },
  ] },
  { title: '🌱 Rewards', games: [
    { icon: '🌻', id: 'garden', name: 'My Garden', blurb: 'See what you have grown', mod: garden },
  ] },
];

const app = document.getElementById('app');
const backBtn = document.getElementById('back');
const titleEl = document.getElementById('title');

let data = { title: '', words: [] };
let cleanup = null;
let inGame = false;

// Deep links: the URL hash names a game (#robot). The hash is kept in step with the screen via replaceState
// (no history entries, so the browser's Back still leaves the site as before).
function setHash(id) {
  const url = location.pathname + location.search + (id ? '#' + id : '');
  if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
}

function findGame(hash) {
  const id = decodeURIComponent(hash.replace(/^#/, '')).trim().toLowerCase();
  for (const sec of SECTIONS) for (const g of sec.games) if (g.id === id) return { game: g, sec };
  return null;
}

// Opened from a link there is no tap yet, and iOS only allows speech inside one: show the game's card and
// mount it from that tap. Unknown names fall back to the menu.
function startFromHash() {
  const hit = findGame(location.hash);
  if (!hit) { if (location.hash) setHash(''); return home(); }
  if (cleanup) { cleanup(); cleanup = null; }
  const { game, sec } = hit;
  inGame = false; // nothing to lose here, so an app update may reload (the hash brings her back to this card)
  backBtn.hidden = false;
  app.replaceChildren(
    el('div', { class: 'menu-wrap start-gate' },
      el('button', { class: 'mcard', type: 'button', onclick: () => open(game, sec) },
        el('span', { class: 'icon' }, game.icon),
        el('span', { class: 'name' }, game.name),
        el('span', { class: 'blurb' }, game.blurb),
        el('span', { class: 'btn primary big' }, '▶ Tap to start'),
      ),
    ),
  );
}

function home() {
  if (cleanup) { cleanup(); cleanup = null; }
  setHash('');
  if (reloadIfPending()) return; // an update arrived during the game: load it now, on the way to the menu
  inGame = false;
  backBtn.hidden = true;
  app.replaceChildren(
    el('div', { class: 'menu-wrap' },
      data.title ? el('p', { class: 'listname' }, data.title) : null,
      SECTIONS.map((sec) =>
        el('section', { class: 'sect' },
          el('h2', {}, sec.title),
          el('div', { class: 'menu' },
            sec.games.map((g) =>
              el('button', { class: 'mcard', type: 'button', onclick: () => open(g, sec) },
                el('span', { class: 'icon' }, g.icon),
                el('span', { class: 'name' }, g.name),
                el('span', { class: 'blurb' }, g.blurb),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  checkForUpdates(); // quick probe; reloads here (not in a game) if something changed
}

function open(game, sec) {
  if (cleanup) { cleanup(); cleanup = null; }
  inGame = true;
  backBtn.hidden = false;
  setHash(game.id);
  const root = el('div', { class: 'game' });
  app.replaceChildren(root);
  // Mount synchronously inside the tap so text-to-speech is allowed on iOS.
  if ((game.needsWords || sec.needsWords) && !data.words.length) {
    root.append(el('p', { class: 'note' }, 'Add some words to words.txt to play this one.'));
    return;
  }
  cleanup = game.mod.mount(root, data.words, { home }) || null;
}

function showError(text, hint) {
  app.replaceChildren(el('div', { class: 'note' }, el('p', {}, text), hint ? el('p', { class: 'small' }, hint) : null));
}

backBtn.addEventListener('click', home);

// Hidden parent access #1: tap the title 5 times within 3 seconds (home screen only).
let taps = [];
titleEl.addEventListener('click', () => {
  const now = Date.now();
  taps = taps.filter((t) => now - t < 3000);
  taps.push(now);
  if (taps.length >= 5) {
    taps = [];
    if (!inGame) openParent(data.words);
  }
});

// Hidden parent access #2: type "parent" on the home screen with a keyboard.
let buf = '';
document.addEventListener('keydown', (e) => {
  if (inGame || e.key.length !== 1) return;
  buf = (buf + e.key.toLowerCase()).slice(-6);
  if (buf === 'parent') { buf = ''; openParent(data.words); }
});

(async function init() {
  try {
    data = await loadWords('words.txt');
  } catch (err) {
    const hint = location.protocol === 'file:'
      ? 'Opening the file directly does not work. Run "python3 -m http.server" in this folder and visit http://localhost:8000.'
      : String(err.message || err);
    window.__started = true; // the code is fine; the list is what failed
    initOffline(() => true); // still set up the offline copy so the next launch can work offline
    return showError('Could not load the word list.', hint);
  }
  startFromHash();
  window.addEventListener('hashchange', startFromHash); // a link to another game while the page is open
  window.__started = true; // tells the start-up watchdog in index.html that the app's code loaded and ran
  // Offline copy + updates. Busy = in a game or a grown-up/options pop-up is open: the update waits for home().
  initOffline(() => inGame || !!document.querySelector('.overlay'));
})();
