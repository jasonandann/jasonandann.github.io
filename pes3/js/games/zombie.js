// Zombie Trail: a board-game race. Roll a die, answer a problem.
// Right = move ahead by the roll. Wrong = move back by the roll.
// Shortcut squares (🚀) jump you ahead; zombie squares (🧟) send you back.
import { choice, openOptions, optionsButton } from '../options.js';
import { el, chooseWords, hearBar, speakSentence, cheer, retry, logRound, celebrate, keyboard, listenKeys, extraChars, scope, opKind } from '../util.js';

const COLS = 6;
const ROWS = 6;
const LAST = COLS * ROWS - 1; // square 0 is START, square 35 is FINISH
const DIGITS = [...'0123456789'];

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// Grown-up options live behind the "More options" button and are remembered on this device.
const OPTS_KEY = 'spelling-games.zombie.options';
export const ZOMBIE_COUNTS = [1, 2, 3, 4];
export const JUMPS = [[3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10]]; // squares a rocket or zombie moves you
const DEFAULTS = { zombies: 3, jump: '7-9', fade: false, second: true };
const jumpRange = (key) => JUMPS.find(([a, b]) => `${a}-${b}` === key) || [7, 9];
function loadOptions() {
  try {
    const o = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') };
    if (!ZOMBIE_COUNTS.includes(o.zombies)) o.zombies = DEFAULTS.zombies;
    if (!JUMPS.some(([a, b]) => `${a}-${b}` === o.jump)) o.jump = DEFAULTS.jump;
    o.fade = o.fade === true;
    o.second = o.second !== false;
    return o;
  } catch { return { ...DEFAULTS }; }
}
function saveOptions(o) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify({ zombies: o.zombies, jump: o.jump, fade: o.fade, second: o.second })); } catch { /* ignore */ }
}

// Random board each game. No special square is another special's destination, so jumps never chain.
// Zombies are never on back-to-back squares. "Safe landing" (strict) also keeps every zombie out of the
// 6 squares after any zombie's destination, so the next roll after a zombie can't reach another one
// (with jumps of 7+ it can't reach the same zombie either). If the zombies don't all fit that way, relax it.
// Placement is greedy and can paint itself into a corner, so retry and keep the fullest board.
export function makeBoard({ zombies: zombieCount = 3, jump = [7, 9] } = {}) {
  let best = null;
  for (const strict of [true, false]) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const b = tryBoard(zombieCount, jump, strict);
      const n = Object.keys(b.shortcuts).length + Object.keys(b.zombies).length;
      if (!best || n > best.n) best = { ...b, n, strict };
      if (n === 4 + zombieCount) return { shortcuts: b.shortcuts, zombies: b.zombies, strict };
    }
  }
  return { shortcuts: best.shortcuts, zombies: best.zombies, strict: best.strict };
}

function tryBoard(zombieCount, [lo, hi], strict) {
  const used = new Set([0, 1, LAST - 1, LAST]);
  const free = (i) => i >= 0 && i <= LAST && !used.has(i);
  const shortcuts = {};
  const zombies = {};
  for (let t = 0; t < 300 && Object.keys(shortcuts).length < 4; t++) {
    const from = rand(3, LAST - 1 - lo);
    const to = from + rand(lo, hi);
    if (to > LAST - 1 || !free(from) || !free(to)) continue;
    shortcuts[from] = to; used.add(from); used.add(to);
  }
  for (let t = 0; t < 1000 && Object.keys(zombies).length < zombieCount; t++) {
    const from = rand(Math.max(8, lo + 1), LAST - 2);
    const to = from - rand(lo, hi);
    if (to < 1 || !free(from) || !free(to)) continue;
    if (zombies[from - 1] != null || zombies[from + 1] != null) continue; // never two in a row along the trail
    if (strict) {
      const near = (dest, sq) => sq > dest && sq <= dest + 6;
      if (Object.keys(zombies).some((z) => near(to, +z)) || Object.values(zombies).some((d) => near(d, from))) continue;
    }
    zombies[from] = to; used.add(from); used.add(to);
  }
  return { shortcuts, zombies };
}

// Grade-3 style facts. Tune the ranges here.
export function mathProblem() {
  const kind = pick(['add', 'sub', 'mul', 'mul', 'div']);
  if (kind === 'add') {
    const a = rand(12, 79);
    const b = rand(11, 99 - a);
    return { text: `${a} + ${b} = ?`, answer: String(a + b) };
  }
  if (kind === 'sub') {
    const a = rand(30, 99);
    const b = rand(11, a - 5);
    return { text: `${a} − ${b} = ?`, answer: String(a - b) };
  }
  if (kind === 'mul') {
    const a = rand(2, 10);
    const b = rand(2, 10);
    return { text: `${a} × ${b} = ?`, answer: String(a * b) };
  }
  const b = rand(2, 10);
  const q = rand(2, 10);
  return { text: `${b * q} ÷ ${b} = ?`, answer: String(q) };
}

// Serpentine path: start bottom-left, rows alternate direction, finish at the top.
function cell(i) {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  return { col: r % 2 === 0 ? c : COLS - 1 - c, row: ROWS - 1 - r };
}

const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n) =>
  el('div', { class: 'die', 'data-n': n || '' },
    n ? Array.from({ length: 9 }, (_, i) => el('span', { class: 'pip' + (FACES[n].includes(i) ? ' on' : '') })) : el('span', { class: 'q' }, '?'),
  );

export function mount(root, entries, api) {
  const sc = scope();
  const { later } = sc;
  let offKeys = null;
  let more = null; // the open options pop-up
  const settings = { players: 1, mode: 'spelling', ...loadOptions() };
  const textExtras = extraChars(entries);
  const bag = [];
  const nextWord = () => {
    if (!bag.length) bag.push(...chooseWords(entries, Math.min(10, entries.length)));
    return bag.pop();
  };
  const nextProblem = () => {
    const kind = settings.mode === 'spelling' ? 'spell' : settings.mode === 'math' ? 'math' : Math.random() < 0.5 ? 'spell' : 'math';
    return kind === 'spell' ? { kind, entry: nextWord() } : { kind, ...mathProblem() };
  };

  const seg = (label, key, opts, redraw) =>
    el('div', { class: 'seg' },
      el('p', { class: 'label' }, label),
      el('div', { class: 'row' },
        opts.map(([val, text]) =>
          el('button', {
            class: 'btn' + (settings[key] === val ? ' primary' : ''), type: 'button',
            'aria-pressed': String(settings[key] === val),
            onclick: () => { settings[key] = val; redraw(); },
          }, text),
        ),
      ),
    );
  const enDash = (k) => k.replace('-', '–');
  const summary = () =>
    `${settings.zombies} zombie${settings.zombies === 1 ? '' : 's'}${settings.fade ? ' (fade away)' : ''} · jumps ${enDash(settings.jump)} · second chance ${settings.second ? 'on' : 'off'}`;

  function setup() {
    root.replaceChildren(
      el('div', { class: 'zt-setup' },
        el('h2', {}, '🧟 Zombie Trail'),
        el('p', { class: 'prompt' }, 'Roll the die and answer a question. Right: move ahead. Wrong: move back. Find shortcuts and dodge the zombies!'),
        seg('Players', 'players', [[1, '1 player'], [2, '2 players']], setup),
        seg('Questions', 'mode', [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']], setup),
        optionsButton({ label: '⚙️ More options', cls: 'zt-more', summary: summary(), onOpen: openMore }),
        el('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Start!'),
      ),
    );
  }

  function openMore() {
    more = openOptions({
      title: '⚙️ More options',
      onClose: setup,
      body: (redraw) => {
        const pick = (key) => (v) => { settings[key] = v; saveOptions(settings); redraw(); };
        return [
          choice('Zombies', settings.zombies, ZOMBIE_COUNTS.map((n) => [n, String(n)]), pick('zombies')),
          choice('Jump size (squares a 🚀 rocket or 🧟 zombie moves you)', settings.jump, JUMPS.map(([a, b]) => [`${a}-${b}`, `${a}–${b}`]), pick('jump')),
          choice('After a zombie is hit', settings.fade, [[false, 'It stays'], [true, 'It fades away']], pick('fade')),
          choice('Second chance (try once more before moving back)', settings.second, [[true, 'On'], [false, 'Off']], pick('second')),
        ];
      },
    });
  }

  function start() {
    const board = makeBoard({ zombies: settings.zombies, jump: jumpRange(settings.jump) });
    const players = [{ name: 'Player 1', emoji: '😎', pos: 0, cls: 'p0' }];
    if (settings.players === 2) players.push({ name: 'Player 2', emoji: '🤠', pos: 0, cls: 'p1' });
    let turn = 0;
    let lastRoll = 0;

    // ----- board -----
    const grid = el('div', { class: 'zt-grid' });
    for (let i = 0; i <= LAST; i++) {
      const { col, row } = cell(i);
      const s = board.shortcuts[i];
      const z = board.zombies[i];
      const cls = ['sq', 'c' + (i % 4)];
      if (i === 0) cls.push('start');
      if (i === LAST) cls.push('end');
      if (s != null) cls.push('short');
      if (z != null) cls.push('zomb');
      const icon = i === 0 ? '🚪' : i === LAST ? '🏁' : s != null ? '🚀' : z != null ? '🧟' : null;
      const tag = i === 0 ? 'START' : i === LAST ? 'FINISH' : s != null ? `→ ${s}` : z != null ? `← ${z}` : null;
      grid.append(
        el('div', {
          class: cls.join(' '), style: `grid-column:${col + 1};grid-row:${row + 1}`,
          'data-i': i, 'data-kind': s != null ? 'shortcut' : z != null ? 'zombie' : 'none', 'data-to': s != null ? s : z != null ? z : '',
        },
          el('span', { class: 'n' }, i === 0 ? '' : i),
          icon ? el('span', { class: 'ic' }, icon) : null,
          tag ? el('span', { class: 'tg' }, tag) : null,
        ),
      );
    }

    const marker = (id, color) => {
      const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '7', refY: '5', markerWidth: '4', markerHeight: '4', orient: 'auto' });
      m.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
      return m;
    };
    const lines = svg('svg', { viewBox: `0 0 ${COLS} ${ROWS}`, class: 'zt-lines', 'aria-hidden': 'true' });
    const defs = svg('defs');
    defs.append(marker('arrG', '#16a34a'), marker('arrR', '#dc2626'));
    lines.append(defs);
    const addLine = (from, to, color, marker_, dash) => {
      const a = cell(+from);
      const b = cell(+to);
      const attrs = {
        x1: a.col + 0.5, y1: a.row + 0.5, x2: b.col + 0.5, y2: b.row + 0.5,
        stroke: color, 'stroke-width': '.09', 'stroke-linecap': 'round', opacity: '.5', 'marker-end': `url(#${marker_})`,
      };
      if (dash) attrs['stroke-dasharray'] = '.2 .15';
      const line = svg('line', attrs);
      lines.append(line);
      return line;
    };
    for (const [f, t] of Object.entries(board.shortcuts)) addLine(f, t, '#16a34a', 'arrG', false);
    const zombieLines = {};
    for (const [f, t] of Object.entries(board.zombies)) zombieLines[f] = addLine(f, t, '#dc2626', 'arrR', true);

    // "Fade away" option: a zombie that has been hit leaves the board for the rest of the game.
    function fadeZombie(i) {
      delete board.zombies[i];
      const sq = grid.querySelector(`.sq[data-i="${i}"]`);
      sq.classList.add('gone');
      sq.dataset.kind = 'none';
      sq.dataset.to = '';
      zombieLines[i].classList.add('gone');
      later(() => {
        sq.classList.remove('zomb', 'gone');
        sq.querySelector('.ic')?.remove();
        sq.querySelector('.tg')?.remove();
        zombieLines[i].remove();
      }, 900);
    }

    players.forEach((p) => { p.el = el('div', { class: 'pawn ' + p.cls }, p.emoji); });
    function placePawns() {
      players.forEach((p, i) => {
        const { col, row } = cell(p.pos);
        const off = players.length > 1 ? (i ? 1 : -1) * 0.2 : 0;
        p.el.style.left = ((col + 0.5 + off) / COLS) * 100 + '%';
        p.el.style.top = ((row + 0.5) / ROWS) * 100 + '%';
        p.el.dataset.pos = p.pos;
      });
    }
    placePawns();
    const boardEl = el('div', { class: 'zt-board' }, grid, lines, players.map((p) => p.el));

    // ----- side panel -----
    const panel = el('div', { class: 'zt-panel' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const say = (t) => { msg.textContent = t; };
    const status = (p) =>
      el('div', { class: 'zt-status' }, el('span', { class: 'dot ' + p.cls }), players.length === 1 ? 'Your turn' : `${p.name}'s turn`);

    function rollPhase() {
      const p = players[turn];
      say('');
      panel.replaceChildren(
        status(p),
        el('div', { class: 'zt-die' }, die(lastRoll)),
        el('button', { class: 'btn primary big', type: 'button', onclick: doRoll }, '🎲 Roll!'),
        msg,
      );
    }

    // Runs inside the Roll tap so iOS allows the word to be spoken right away.
    function doRoll() {
      const p = players[turn];
      const n = rand(1, 6);
      lastRoll = n;
      panel.replaceChildren(
        status(p),
        el('div', { class: 'zt-die' }, die(n), el('p', { class: 'prompt' }, `Rolled a ${n}! Answer to move ahead ${n}.`)),
      );
      panel.append(ask(nextProblem(), (ok) => resolve(p, n, ok)));
      if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function ask(problem, done) {
      const isMath = problem.kind === 'math';
      const answer = isMath ? problem.answer : problem.entry.word;
      let typed = '';
      let misses = 0;
      let finished = false;
      let called = false;
      const finishOnce = (ok) => { if (!called) { called = true; done(ok); } };

      const shown = el('div', { class: 'typed' });
      const note = el('div', { class: 'msg', 'aria-live': 'polite' });
      const draw = () => { shown.textContent = typed || ' '; };
      const stop = () => {
        finished = true;
        if (offKeys) { offKeys(); offKeys = null; }
        kb.remove();
        checkBtn.remove();
      };
      const onKey = (ch) => {
        if (finished) return;
        if (isMath && !/\d/.test(ch)) return;
        if (typed.length < answer.length + 2) { typed += ch; draw(); }
      };
      const onBack = () => { if (!finished) { typed = typed.slice(0, -1); draw(); } };

      function check() {
        if (finished || !typed) return;
        if (typed === answer) {
          stop();
          if (!isMath) logRound(answer, misses === 0);
          shown.classList.add('good');
          note.textContent = cheer(isMath ? opKind(problem.text) : 'spell');
          later(() => finishOnce(true), 900);
          return;
        }
        misses++;
        typed = '';
        draw();
        if (settings.second && misses === 1) { note.textContent = retry(); return; }
        stop();
        if (!isMath) logRound(answer, false);
        note.textContent = `The answer is ${answer}.`;
        box.append(el('button', { class: 'btn primary big', type: 'button', onclick: () => finishOnce(false) }, 'OK'));
      }

      const kb = isMath ? numpad(onKey, onBack) : keyboard({ onKey, onBack, extras: textExtras });
      const checkBtn = el('button', { class: 'btn primary big', type: 'button', onclick: check }, 'Check ✓');
      const box = el('div', { class: 'zt-q' },
        isMath ? el('div', { class: 'bigword' }, problem.text) : el('p', { class: 'prompt' }, 'Listen, then spell the word.'),
        isMath ? null : hearBar(problem.entry),
        shown, note, kb, checkBtn,
      );
      offKeys = listenKeys({ onKey, onBack, onEnter: check, extras: isMath ? DIGITS : textExtras });
      draw();
      if (!isMath) speakSentence(problem.entry);
      return box;
    }

    function walk(p, to, cb) {
      const dir = Math.sign(to - p.pos);
      if (dir === 0) return cb();
      const step = () => {
        p.pos += dir;
        placePawns();
        if (p.pos === to) later(cb, 350);
        else later(step, 260);
      };
      later(step, 150);
    }

    function land(p, cb) {
      const s = board.shortcuts[p.pos];
      const z = board.zombies[p.pos];
      if (s == null && z == null) return cb();
      const fades = z != null && settings.fade;
      say(s != null ? `🚀 Shortcut! Zoom ahead to square ${s}!`
        : `🧟 A zombie! Shuffle back to square ${z}.${fades ? ' Then it wanders off!' : ''}`);
      p.el.classList.add('jump');
      const from = p.pos;
      later(() => {
        p.pos = s != null ? s : z;
        placePawns();
        if (fades) fadeZombie(from);
        later(() => { p.el.classList.remove('jump'); cb(); }, 1000);
      }, 700);
    }

    function resolve(p, n, ok) {
      panel.replaceChildren(status(p), el('div', { class: 'zt-die' }, die(n)), msg);
      const to = ok ? Math.min(LAST, p.pos + n) : Math.max(0, p.pos - n);
      if (ok) say(`Moving ahead ${n}!`);
      else say(to === p.pos ? 'Right at the start. Try again!' : `Moving back ${p.pos - to}.`);
      walk(p, to, () => land(p, () => endTurn(p)));
    }

    function endTurn(p) {
      if (p.pos === LAST) return win(p);
      turn = (turn + 1) % players.length;
      rollPhase();
    }

    function win(p) {
      panel.replaceChildren(
        el('div', { class: 'finish' },
          el('div', { class: 'big-emoji' }, '🏁'),
          el('h2', {}, players.length === 1 ? 'You made it to the finish!' : `${p.name} made it to the finish!`),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big', type: 'button', onclick: setup }, 'Play again'),
            el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
          ),
        ),
      );
      celebrate(root);
    }

    root.replaceChildren(el('div', { class: 'zt' }, boardEl, panel));
    rollPhase();
  }

  function numpad(onKey, onBack) {
    const kb = el('div', { class: 'kb numpad' });
    [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '⌫']].forEach((row) => {
      const r = el('div', { class: 'kb-row' });
      row.forEach((k) =>
        r.append(el('button', { class: 'key' + (k === '⌫' ? ' wide' : ''), type: 'button', 'aria-label': k === '⌫' ? 'Delete' : k, onclick: () => (k === '⌫' ? onBack() : onKey(k)) }, k)),
      );
      kb.append(r);
    });
    return kb;
  }

  setup();
  return () => {
    sc.dispose();
    if (offKeys) offKeys();
    if (more) more.dispose();
  };
}
