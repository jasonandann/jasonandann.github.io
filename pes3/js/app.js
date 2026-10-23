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

// needsWords: game uses words.txt (spelling). Sections appear in this order on the home screen.
const SECTIONS = [
  { title: '✏️ Spelling', needsWords: true, games: [
    { icon: '📖', name: 'See the Words', blurb: 'Tap a word to hear it', mod: words },
    { icon: '🔀', name: 'Word Jumble', blurb: 'Put the letters in order', mod: jumble },
    { icon: '✏️', name: 'Fill the Blanks', blurb: 'Find the missing letters', mod: fillblank },
    { icon: '👀', name: 'Look, Cover, Write, Check', blurb: 'Study it, hide it, spell it', mod: lcwc },
    { icon: '🌧️', name: 'Spell Catcher', blurb: 'Catch the falling letters', mod: catcher },
    { icon: '🌋', name: 'Word Volcano', blurb: 'Tap the rocks in order', mod: volcano },
    { icon: '🃏', name: 'Memory Match', blurb: 'Match the word pairs', mod: memory },
    { icon: '🤯', name: 'Baffle', blurb: 'Make words from touching letters', mod: baffle },
    { icon: '🔎', name: 'Word Search', blurb: 'Find the hidden words', mod: wordsearch },
    { icon: '🟩', name: 'Wordal', blurb: 'Guess the word in six tries', mod: wordal },
    { icon: '👂', name: 'Listen & Type', blurb: 'Hear it, then spell it', mod: typeit },
  ] },
  { title: '➗ Math', games: [
    { icon: '🫧', name: 'Number Bubbles', blurb: 'Pop the right answer', mod: mq.bubbles },
    { icon: '🔢', name: 'Number Cascade', blurb: 'Find it on the board', mod: mq.cascade },
    { icon: '🧮', name: 'Times Table Explorer', blurb: 'Look, practice, spot patterns', mod: explorer },
    { icon: '🚪', name: 'Number Maze', blurb: 'Pick the right door', mod: mq.maze },
    { icon: '⛰️', name: 'Number Mountain', blurb: 'Climb to the top', mod: mq.mountain },
    { icon: '🧩', name: 'Puzzle Pieces', blurb: 'Uncover the picture', mod: puzzle },
  ] },
  { title: '💻 Coding', games: [
    { icon: '🤖', name: 'Robot Course', blurb: 'Plan a path, press go', mod: robot },
  ] },
  { title: '🎲 Fun', games: [
    { icon: '🧟', name: 'Zombie Trail', blurb: 'Race to the finish', needsWords: true, mod: zombie },
    { icon: '🐸', name: 'Lily Pad River', blurb: 'Hop on the right answer', mod: river },
    { icon: '👁️', name: 'Spot Match', blurb: 'Find the matching picture', mod: spotmatch },
    { icon: '🎵', name: 'Simon Says', blurb: 'Copy the pattern', mod: simon },
  ] },
  { title: '🌱 Rewards', games: [
    { icon: '🌻', name: 'My Garden', blurb: 'See what you have grown', mod: garden },
  ] },
];

const app = document.getElementById('app');
const backBtn = document.getElementById('back');
const titleEl = document.getElementById('title');

let data = { title: '', words: [] };
let cleanup = null;
let inGame = false;

function home() {
  if (cleanup) { cleanup(); cleanup = null; }
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
  home();
  window.__started = true; // tells the start-up watchdog in index.html that the app's code loaded and ran
  // Offline copy + updates. Busy = in a game or a grown-up/options pop-up is open: the update waits for home().
  initOffline(() => inGame || !!document.querySelector('.overlay'));
})();
