// Robot Course: a virtual Kinderbot (Fisher-Price Code 'n Learn, Code mode). Punch steps into the
// robot's head, press the orange key, watch it go. Plan first, then run; bumps are "Let's fix the plan!".
import { el, scope, celebrate, award, cheer } from '../util.js';
import { runner } from '../code/engine.js';
import { chipStrip, shiftButtons, chipTitle } from '../code/chips.js';
import { ROBOT_OPS } from '../code/blocks.js';
import { tone, tune } from '../code/sound.js';
import { LEVELS } from './robot-levels.js';

const STEP_MS = 550;
const HOME_DELAY_MS = 900; // after a bump or a short run: how long the robot stays put before going home
const LIGHTS = 10;
const BUILD_W = 6, BUILD_H = 6;
const MAX_MINE = 12;
const DONE_KEY = 'spelling-games.robot.done.v1'; // ids of finished courses
const MINE_KEY = 'spelling-games.robot.mine.v1'; // her saved courses [{id, name, map}]
const NAME_KEY = 'spelling-games.robot.name';
const DEFAULT_NAME = 'Robo';

const FACING = '^>v<'; // up, right, down, left = d 0..3
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const BEEP = { fwd: 523, back: 392, left: 440, right: 587, undo: 330 };
const SOL = { f: 'fwd', b: 'back', l: 'left', r: 'right' };
const PIECES = { '#': ['wall', ''], c: ['cone', ''], '*': ['gem', '💎'], F: ['flag', '🏁'], '+': ['path', ''] };
// Orange traffic cone, drawn (🚧 looked too much like the 🏁 flag).
const CONE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="12" y="82" width="76" height="12" rx="4" fill="#c2410c"/>
  <path d="M44 10 Q50 4 56 10 L78 84 L22 84 Z" fill="#f97316" stroke="#c2410c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M39 38 L61 38 L65.5 50 L34.5 50 Z M30 62 L70 62 L73.5 73 L26.5 73 Z" fill="#fff"/>
</svg>`;
function coneEl(cls) {
  const s = el('span', { class: cls });
  s.innerHTML = CONE_SVG;
  return s;
}
// replaceChildren() would print a null as the text "null"; el() skips it, this does too.
const kids = (...a) => a.filter((k) => k != null && k !== false);

// Top-down robot, front = top. Face screen, wheels, antenna knob, yellow nose so front/back is clear.
const BOT_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect class="rb-wheel" x="6" y="24" width="13" height="54" rx="6"/><rect class="rb-wheel" x="81" y="24" width="13" height="54" rx="6"/>
  <rect class="rb-shell" x="15" y="14" width="70" height="76" rx="24"/>
  <path class="rb-nose" d="M38 15 L50 2 L62 15 Z"/>
  <rect class="rb-screen" x="25" y="22" width="50" height="34" rx="11"/>
  <circle class="rb-eye" cx="40" cy="36" r="5"/><circle class="rb-eye" cx="60" cy="36" r="5"/>
  <path class="rb-m m-norm" d="M42 46 Q50 51 58 46"/><path class="rb-m m-happy" d="M37 43 Q50 57 63 43"/>
  <circle class="rb-m m-oops" cx="50" cy="47" r="4.5"/>
  <line class="rb-stalk" x1="50" y1="64" x2="50" y2="78"/><circle class="rb-ant" cx="50" cy="78" r="7"/>
</svg>`;

/* ---------- course model (pure; the tests use these) ---------- */
export const fromSolution = (s) => [...s].map((c) => ({ op: SOL[c] }));

export function parseCourse(map) {
  const h = map.length, w = map[0].length;
  let start = null, flag = null;
  const gems = new Set(), walls = new Set();
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (FACING.includes(ch)) start = { x, y, d: FACING.indexOf(ch) };
    else if (ch === 'F') flag = { x, y };
    else if (ch === '*') gems.add(`${x},${y}`);
    else if (ch === '#' || ch === 'c') walls.add(`${x},${y}`);
  }));
  const blocked = (x, y) => x < 0 || y < 0 || x >= w || y >= h || walls.has(`${x},${y}`);
  return { w, h, start, flag, gems, blocked };
}

// One step from pos {x,y,d}. Returns the new pos, or {...pos, bonk: true} if a wall or edge is in the way.
export function move(course, pos, op) {
  if (op === 'left') return { ...pos, d: (pos.d + 3) % 4 };
  if (op === 'right') return { ...pos, d: (pos.d + 1) % 4 };
  const s = op === 'back' ? -1 : 1;
  const x = pos.x + DX[pos.d] * s, y = pos.y + DY[pos.d] * s;
  return course.blocked(x, y) ? { ...pos, bonk: true } : { x, y, d: pos.d };
}

// Runs a whole program without drawing. {result: 'goal'|'bonk'|'end', at: step index, gems}
export function simulate(map, program) {
  const c = parseCourse(map);
  let p = { ...c.start };
  const got = new Set();
  for (let i = 0; i < program.length; i++) {
    const n = move(c, p, program[i].op);
    if (n.bonk) return { result: 'bonk', at: i, gems: got.size };
    p = n;
    if (c.gems.has(`${p.x},${p.y}`)) got.add(`${p.x},${p.y}`);
    if (p.x === c.flag.x && p.y === c.flag.y) return { result: 'goal', at: i, gems: got.size };
  }
  return { result: 'end', at: program.length, gems: got.size };
}

const blankMap = () => Array.from({ length: BUILD_H }, (_, y) =>
  Array.from({ length: BUILD_W }, (_, x) => (x === 0 && y === BUILD_H - 1 ? '^' : x === BUILD_W - 1 && y === 0 ? 'F' : '.')).join(''));

/* ---------- storage ---------- */
function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
const doneIds = () => new Set(load(DONE_KEY, []));
const loadMine = () => (Array.isArray(load(MINE_KEY, [])) ? load(MINE_KEY, []) : []);
function botName() {
  try { return localStorage.getItem(NAME_KEY); } catch { return DEFAULT_NAME; }
}
function setBotName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
}
const nice = (n) => n.charAt(0).toUpperCase() + n.slice(1);

/* ---------- drawing ---------- */
function botEl(cls = 'rb-body') {
  const b = el('div', { class: cls });
  b.innerHTML = BOT_SVG;
  return b;
}

// Grid of squares. tag 'button' + onCell(x, y) for the course builder.
function drawBoard(map, { tag = 'div', onCell, showBot = false } = {}) {
  const h = map.length, w = map[0].length;
  const board = el('div', { class: 'rb-board', style: `--w:${w};--h:${h};aspect-ratio:${w}/${h}` });
  const cells = map.map((row, y) => [...row].map((ch, x) => {
    const [kind, icon] = PIECES[ch] || ['empty', ''];
    const attrs = { class: `rb-cell k-${kind}`, 'data-x': x, 'data-y': y };
    if (tag === 'button') Object.assign(attrs, { type: 'button', 'aria-label': `square ${x + 1}, ${y + 1}: ${kind}`, onclick: (e) => onCell(x, y, e) });
    const cell = el(tag, attrs, kind === 'cone' ? coneEl('rb-piece rb-cone') : icon ? el('span', { class: 'rb-piece' }, icon) : null);
    if (showBot && FACING.includes(ch)) {
      cell.classList.add('k-start');
      const mini = botEl('rb-mini');
      mini.style.transform = `rotate(${FACING.indexOf(ch) * 90}deg)`;
      cell.append(mini);
    }
    board.append(cell);
    return cell;
  }));
  return { board, cells };
}

/* ---------- the game ---------- */
export function mount(root, _entries, api) {
  const sc = scope();
  let leaveView = () => {};
  let overlay = null;
  const wait = (ms) => new Promise((res) => sc.later(res, ms));
  const name = () => nice(botName() || DEFAULT_NAME);

  function view(...kids) {
    leaveView();
    leaveView = () => {};
    closeAsk();
    root.replaceChildren(...kids);
  }

  function closeAsk() {
    if (overlay) { overlay.remove(); overlay = null; }
  }
  function menu(label, title, ...content) {
    closeAsk();
    overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': label,
      onclick: (e) => { if (e.target === overlay) closeAsk(); } }, el('div', { class: 'panel rb-ask' }, title, ...content));
    document.body.append(overlay);
  }
  function ask(text, yesLabel, onYes, noLabel = 'No, keep them') {
    closeAsk();
    const card = el('div', { class: 'panel rb-ask' },
      el('h2', {}, text),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary big', type: 'button', onclick: () => { closeAsk(); onYes(); } }, yesLabel),
        el('button', { class: 'btn big', type: 'button', onclick: closeAsk }, noLabel),
      ));
    overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': text,
      onclick: (e) => { if (e.target === overlay) closeAsk(); } }, card);
    document.body.append(overlay);
  }

  /* ----- name the robot (first launch only; optional) ----- */
  // A normal text box (the device's own keyboard): the on-screen keyboard was too small on a phone
  // (Jason, 2026-10-23). Autocorrect is off; it's a name, not a spelling word.
  function naming(then) {
    const was = botName() && botName() !== DEFAULT_NAME ? botName() : '';
    const done = (n) => { setBotName(String(n || '').trim().slice(0, 12) || DEFAULT_NAME); then(); };
    const input = el('input', { class: 'rb-name-input', type: 'text', maxlength: '12', value: was, placeholder: DEFAULT_NAME,
      autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Robot name' });
    view(el('form', { class: 'setup rb-naming', onsubmit: (e) => { e.preventDefault(); done(input.value); } },
      el('div', { class: 'rb-hello' }, botEl('rb-mini big')),
      el('h2', {}, 'Your robot needs a name!'),
      input,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary big', type: 'submit' }, "That's it!"),
        el('button', { class: 'btn big', type: 'button', onclick: () => done(botName() || DEFAULT_NAME) }, 'Skip'),
      )));
    // Inside the tap that opened this screen, so phones show their keyboard straight away.
    try { input.focus({ preventScroll: true }); } catch { /* fine without */ }
  }

  /* ----- tabs: Courses / Build my own ----- */
  function picker(tab = 'courses') {
    const tabs = el('div', { class: 'rb-tabs', role: 'tablist' },
      el('button', { class: 'rb-tab', type: 'button', role: 'tab', 'aria-selected': String(tab === 'courses'), onclick: () => picker('courses') }, '🗺️ Courses'),
      el('button', { class: 'rb-tab', type: 'button', role: 'tab', 'aria-selected': String(tab === 'build'), onclick: () => picker('build') }, '🧱 Build my own'));
    let body;
    if (tab === 'courses') {
      const done = doneIds();
      body = el('div', { class: 'rb-levels' }, LEVELS.map((lv, i) =>
        el('button', { class: `rb-level${done.has(lv.id) ? ' done' : ''}`, type: 'button', 'data-id': lv.id, onclick: () => play(lv, { level: i }) },
          el('span', { class: 'rb-n' }, String(i + 1)),
          el('span', { class: 'rb-nm' }, lv.name),
          done.has(lv.id) ? el('span', { class: 'rb-star', 'aria-label': 'finished' }, '⭐') : null)));
    } else {
      const mine = loadMine();
      body = el('div', { class: 'rb-levels' },
        el('button', { class: 'rb-level rb-new', type: 'button', onclick: () => editor({ name: '', map: blankMap() }) },
          el('span', { class: 'rb-n' }, '➕'), el('span', { class: 'rb-nm' }, 'New course')),
        mine.map((m) => el('div', { class: 'rb-mine-wrap' },
          el('button', { class: 'rb-level rb-mine', type: 'button', 'data-id': m.id, onclick: () => editor(m) },
            el('span', { class: 'rb-n' }, '🧱'), el('span', { class: 'rb-nm' }, m.name)),
          el('button', { class: 'rb-del', type: 'button', 'aria-label': `Delete ${m.name}`, onclick: () => ask(`Delete “${m.name}”?`, 'Yes, delete it', () => {
            save(MINE_KEY, loadMine().filter((x) => x.id !== m.id));
            picker('build');
          }, 'No, keep it') }, '🗑️'))));
    }
    view(el('div', { class: 'rb-pick' },
      el('p', { class: 'prompt' }, `${name()} is ready!`),
      tabs, body,
      el('button', { class: 'btn rb-rename', type: 'button', onclick: () => naming(() => picker(tab)) }, `✏️ Rename ${name()}`)));
  }

  /* ----- course builder ----- */
  function editor(mine) {
    const grid = mine.map.map((r) => [...r]);
    let tool = 'wall';
    const TOOLS = [['wall', '🧱', 'Wall', '#'], ['cone', '🚧', 'Cone', 'c'], ['gem', '💎', 'Gem', '*'],
      ['flag', '🏁', 'Flag', 'F'], ['robot', '🤖', 'Robot', '^'], ['erase', '🧽', 'Eraser', '.']];
    const WALL_HINT = 'Tap a square, or drag across squares to build a long wall.';
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' }, WALL_HINT);
    const palette = el('div', { class: 'rb-palette' });
    const holder = el('div', { class: 'rb-board-wrap' });
    const map = () => grid.map((r) => r.join(''));
    const find = (pred) => { for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) if (pred(grid[y][x])) return [x, y]; return null; };

    function drawPalette() {
      palette.replaceChildren(...TOOLS.map(([id, icon, label]) =>
        el('button', { class: 'rb-tool', type: 'button', 'data-tool': id, 'aria-pressed': String(tool === id), onclick: () => { tool = id; msg.textContent = id === 'wall' ? WALL_HINT : 'Tap a square.'; drawPalette(); } },
          id === 'cone' ? coneEl('ci rb-cone') : el('span', { class: 'ci' }, icon), el('span', { class: 'cw' }, label))));
    }
    // Squares react on pointerdown (below). The click that follows a pointerdown is ignored, so a click
    // only acts for the keyboard. (Not event.detail: Chromium sent detail 0 for a touch tap after a mouse drag.)
    let pressedAt = -1e9;
    const onCell = (x, y) => { if (performance.now() - pressedAt > 800) tapCell(x, y); };
    function draw() { holder.replaceChildren(drawBoard(map(), { tag: 'button', onCell, showBot: true }).board); }

    // Walls are many pieces, so 🧱 can be dragged across squares to build (or, starting on a wall,
    // take away) a continuous wall. Other pieces are one square each: tap only.
    let paint = null; // { add: bool, last: [x, y] } while a wall drag is going
    const cellAt = (e) => {
      const c = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rb-cell');
      return c && holder.contains(c) ? [+c.dataset.x, +c.dataset.y] : null;
    };
    function paintWall([x, y], first) {
      const ch = grid[y][x];
      if (FACING.includes(ch) || ch === 'F') {
        if (first) msg.textContent = FACING.includes(ch) ? 'Tap 🤖 Robot to move or turn the robot.' : 'Tap 🏁 Flag to move the flag.';
        return;
      }
      const next = paint.add ? '#' : ch === '#' ? '.' : ch;
      if (next === ch) return;
      grid[y][x] = next;
      tone(paint.add ? BEEP.fwd : BEEP.undo, 50);
      draw();
    }
    holder.addEventListener('pointerdown', (e) => {
      const at = cellAt(e);
      if (!at) return;
      e.preventDefault();
      pressedAt = performance.now();
      if (tool !== 'wall') { tapCell(...at); return; }
      msg.textContent = '';
      paint = { add: grid[at[1]][at[0]] !== '#', last: at };
      try { holder.setPointerCapture(e.pointerId); } catch { /* old browser: still works square by square */ }
      paintWall(at, true);
    });
    holder.addEventListener('pointermove', (e) => {
      if (!paint) return;
      const at = cellAt(e);
      if (!at || (at[0] === paint.last[0] && at[1] === paint.last[1])) return;
      // A fast finger can skip squares: fill in the ones between, so the wall has no gaps.
      const [x0, y0] = paint.last;
      const n = Math.max(Math.abs(at[0] - x0), Math.abs(at[1] - y0));
      for (let i = 1; i <= n; i++) paintWall([Math.round(x0 + ((at[0] - x0) * i) / n), Math.round(y0 + ((at[1] - y0) * i) / n)], false);
      paint.last = at;
    });
    const endPaint = () => { paint = null; };
    holder.addEventListener('pointerup', endPaint);
    holder.addEventListener('pointercancel', endPaint);

    function tapCell(x, y) {
      const ch = grid[y][x];
      const isBot = FACING.includes(ch);
      const sym = TOOLS.find((t) => t[0] === tool)[3];
      msg.textContent = '';
      if (tool === 'robot') {
        if (isBot) grid[y][x] = FACING[(FACING.indexOf(ch) + 1) % 4]; // tap again = turn it
        else if (ch === 'F') { msg.textContent = 'Move the flag first.'; return; }
        else {
          const old = find((c) => FACING.includes(c));
          const face = old ? grid[old[1]][old[0]] : '^';
          if (old) grid[old[1]][old[0]] = '.';
          grid[y][x] = face;
        }
      } else if (isBot || ch === 'F') {
        msg.textContent = isBot ? 'Tap 🤖 Robot to move or turn the robot.' : 'Tap 🏁 Flag to move the flag.';
        return;
      } else if (tool === 'flag') {
        const old = find((c) => c === 'F');
        if (old) grid[old[1]][old[0]] = '.';
        grid[y][x] = 'F';
      } else {
        grid[y][x] = ch === sym ? '.' : sym; // tap again to take it away
      }
      tone(BEEP.fwd, 60);
      draw();
    }

    function saveIt() {
      const all = loadMine();
      const i = mine.id ? all.findIndex((m) => m.id === mine.id) : -1;
      if (i < 0 && all.length >= MAX_MINE) { msg.textContent = 'Your course shelf is full. Delete one first.'; return; }
      if (i < 0) {
        const n = all.reduce((k, m) => Math.max(k, parseInt(String(m.name).replace(/\D/g, ''), 10) || 0), 0) + 1;
        mine = { id: `m${Date.now()}`, name: `My course ${n}`, map: map() };
        all.push(mine);
      } else {
        mine = { ...all[i], map: map() };
        all[i] = mine;
      }
      save(MINE_KEY, all);
      msg.textContent = `Saved as “${mine.name}”!`;
      title.textContent = mine.name;
      drawButtons();
    }

    const title = el('p', { class: 'prompt' }, mine.name || 'New course');
    const buttons = el('div', { class: 'row' });
    function drawButtons() {
      buttons.replaceChildren(...kids(
        el('button', { class: 'btn primary big', type: 'button', onclick: () => play({ name: mine.name || 'My course', map: map() }, { mine: { ...mine, map: map() } }) }, '🤖 Code it!'),
        el('button', { class: 'btn big', type: 'button', onclick: saveIt }, '💾 Save course'),
        mine.id ? el('button', { class: 'btn', type: 'button', onclick: () => ask('Delete this course?', 'Yes, delete it', () => {
          save(MINE_KEY, loadMine().filter((m) => m.id !== mine.id));
          picker('build');
        }, 'No, keep it') }, '🗑️ Delete course') : null));
    }

    drawPalette(); draw(); drawButtons();
    view(el('div', { class: 'rb-edit' },
      el('div', { class: 'rb-top' },
        el('button', { class: 'btn', type: 'button', onclick: () => picker('build') }, '‹ My courses'),
        title),
      palette, holder, msg, buttons));
  }

  /* ----- coding a course ----- */
  function play(course, from) {
    const c = parseCourse(course.map);
    let program = [];
    let pos = { ...c.start };
    let deg = c.start.d * 90;
    const got = new Set();

    const { board, cells } = drawBoard(course.map);
    const body = botEl();
    const turn = el('div', { class: 'rb-turn' }, body);
    const bot = el('div', { class: 'rb-bot', 'data-x': pos.x, 'data-y': pos.y, 'data-d': pos.d }, turn);
    // Where the robot starts, always marked (dashed square + arrow for its facing).
    const startMark = el('div', { class: 'rb-start', 'aria-hidden': 'true', style: `transform:translate(${c.start.x * 100}%, ${c.start.y * 100}%)` },
      el('span', { class: 'rb-start-arrow', style: `transform:rotate(${c.start.d * 90}deg)` }, '⬆'));
    // Breadcrumbs of the last run and a faded "ghost" robot where it stopped. Kept until the next run starts.
    const trail = el('div', { class: 'rb-trail', 'aria-hidden': 'true' });
    board.append(startMark, trail, bot);
    const cellXform = (x, y) => `translate(${x * 100}%, ${y * 100}%)`;
    function crumb(from, to) {
      const dir = to.x > from.x ? 1 : to.x < from.x ? 3 : to.y > from.y ? 2 : 0;
      trail.append(el('div', { class: 'rb-crumb', 'data-x': from.x, 'data-y': from.y, style: `transform:${cellXform(from.x, from.y)}` },
        el('span', { style: `transform:rotate(${dir * 90}deg)` })));
    }
    function leaveGhost() {
      const ghost = el('div', { class: 'rb-ghost', 'data-x': pos.x, 'data-y': pos.y, 'data-d': pos.d, style: `transform:${cellXform(pos.x, pos.y)}` },
        el('div', { class: 'rb-turn', style: `transform:rotate(${deg}deg)` }, botEl(body.className)));
      trail.append(ghost);
    }
    // Fade the robot back to its start square (gems come back too). One at a time.
    let homing = null;
    function goHome() {
      if (homing) return homing;
      const atHome = pos.x === c.start.x && pos.y === c.start.y && pos.d === c.start.d && !got.size;
      if (atHome) return Promise.resolve();
      homing = (async () => {
        bot.classList.add('fade');
        await wait(260);
        pos = { ...c.start };
        deg = c.start.d * 90;
        got.clear();
        board.querySelectorAll('.k-gem.got').forEach((g) => g.classList.remove('got'));
        body.className = 'rb-body';
        place(true);
        bot.classList.remove('fade');
        await wait(260);
        homing = null;
      })();
      return homing;
    }
    function place(snap) {
      if (snap) bot.classList.add('snap');
      bot.style.transform = `translate(${pos.x * 100}%, ${pos.y * 100}%)`;
      turn.style.transform = `rotate(${deg}deg)`;
      Object.assign(bot.dataset, { x: pos.x, y: pos.y, d: pos.d });
      if (snap) { void bot.offsetWidth; bot.classList.remove('snap'); }
    }
    place(true);

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' }, 'Press the arrow keys to plan a path to the 🏁.');
    const say = (t) => { msg.textContent = t; };
    const strip = chipStrip({ ops: ROBOT_OPS, onTap: chipMenu, onMove: moveStep, canDrag: () => !locked(), empty: 'Your steps show up here.' });
    const after = el('div', { class: 'row rb-after' });

    // ----- the robot's head (same key positions and colours as the toy) -----
    const lights = Array.from({ length: LIGHTS }, () => el('span', { class: 'rb-light' }));
    const key = (op, cls, label, ...kids) => el('button', { class: `rb-key ${cls}`, type: 'button', 'data-key': op, 'aria-label': label, onclick: () => press(op) }, ...kids);
    const runKey = key('run', 'k-orange', 'Run the program', '▶');
    const head = el('div', { class: 'rb-head' },
      el('div', { class: 'rb-lights' }, lights),
      el('div', { class: 'rb-pad' },
        el('span', { class: 'rb-gap' }),
        key('fwd', 'k-green', 'Forward', el('span', { class: 'ki' }, '⬆')),
        el('span', { class: 'rb-gap' }),
        key('left', 'k-blue', 'Quarter turn counter-clockwise', el('span', { class: 'ki' }, '↺'), el('span', { class: 'kw' }, '¼ counter-clockwise')),
        el('span', { class: 'rb-centre', 'aria-hidden': 'true' }),
        key('right', 'k-purple', 'Quarter turn clockwise', el('span', { class: 'ki' }, '↻'), el('span', { class: 'kw' }, '¼ clockwise')),
        key('undo', 'k-yellow', 'Undo the last step', '✕'),
        key('back', 'k-red', 'Back', el('span', { class: 'ki' }, '⬇')),
        runKey));

    // Idle: the first 10 steps, dim. Running: the 10 around the current step, current one lit.
    function drawLights(active) {
      const page = active == null ? 0 : Math.floor(active / LIGHTS);
      lights.forEach((l, k) => {
        const b = program[page * LIGHTS + k];
        l.className = `rb-light${b ? ` c-${ROBOT_OPS[b.op].color}` : ''}${active === page * LIGHTS + k ? ' on' : ''}`;
      });
    }
    function sync() {
      const running = r.playing;
      head.classList.toggle('running', running);
      runKey.textContent = running ? '⏹' : '▶';
      runKey.setAttribute('aria-label', running ? 'Stop' : 'Run the program');
    }
    function edited() {
      r.reset();
      strip.render(program);
      strip.pulse(null);
      drawLights(null);
      after.replaceChildren();
    }
    // Editing waits only for a playing run; a step still finishing its move after ⏹ is ignored by r.reset().
    const locked = () => r.playing;

    function press(op) {
      if (op === 'run') {
        if (r.playing) { r.stop(); return; }
        if (!program.length) { say('Press the arrow keys to add steps first!'); return; }
        tune([[523, 70], [659, 70], [784, 90]]);
        r.play();
        sync();
        sc.later(sync, 0); // play() may first wait for a stopped step to finish
        return;
      }
      if (locked()) return;
      tone(BEEP[op], 110);
      if (op === 'undo') {
        if (!program.length) return;
        strip.poof(program.length - 1, () => { program.pop(); edited(); });
        r.reset();
        return;
      }
      program.push({ op });
      say('');
      edited();
    }
    // Drag a chip to a new place (the toy only has backspace; here she can rearrange).
    function moveStep(_parent, from, to) {
      if (locked()) return;
      const [b] = program.splice(from, 1);
      program.splice(to, 0, b);
      tone(BEEP[b.op], 80);
      r.reset();
      say('');
      edited();
    }
    // Tap a step: a small menu (move it, or remove it). Tapping no longer deletes straight away:
    // with drag-to-reorder, a slipped drag became a tap and deleted the step (Jason, 2026-10-23).
    function chipMenu(path) {
      if (locked()) return;
      const i = path[0];
      const o = ROBOT_OPS[program[i].op];
      menu(o.say, chipTitle(ROBOT_OPS, program[i]),
        shiftButtons(i, program.length, (d) => { moveStep([], i, i + d); chipMenu([i + d]); }),
        el('div', { class: 'row' },
          el('button', { class: 'btn', type: 'button', 'data-act': 'remove', onclick: () => { closeAsk(); removeAt(path); } }, '🗑️ Remove'),
          el('button', { class: 'btn primary', type: 'button', onclick: closeAsk }, 'Done')));
    }
    function removeAt(path) {
      const i = path[0];
      if (locked()) return;
      tone(BEEP.undo, 90);
      r.reset();
      strip.poof(i, () => { program.splice(i, 1); edited(); });
    }

    const r = runner({
      program: () => program,
      async onStart() {
        body.className = 'rb-body';
        strip.pulse(null);
        after.replaceChildren();
        say('');
        trail.replaceChildren();
        await goHome();
      },
      onActive(item) {
        strip.setActive(item && item.path);
        drawLights(item ? item.path[0] : null);
        sync();
      },
      async exec({ block }) {
        body.classList.add('blink');
        sc.later(() => body.classList.remove('blink'), 250);
        tone(BEEP[block.op], 90, { gain: 0.06 });
        const n = move(c, pos, block.op);
        if (n.bonk) {
          body.classList.add(block.op === 'back' ? 'bonk-b' : 'bonk-f', 'oops');
          tune([[330, 90], [294, 120]], { type: 'triangle', gain: 0.08 });
          await wait(650);
          body.classList.remove('bonk-b', 'bonk-f');
          return 'bonk';
        }
        if (block.op === 'left') deg -= 90;
        if (block.op === 'right') deg += 90;
        if (n.x !== pos.x || n.y !== pos.y) crumb(pos, n);
        pos = n;
        place(false);
        await wait(STEP_MS);
        const k = `${pos.x},${pos.y}`;
        if (c.gems.has(k) && !got.has(k)) {
          got.add(k);
          cells[pos.y][pos.x].classList.add('got');
          tune([[988, 60], [1319, 90]], { gain: 0.08 });
        }
        if (pos.x === c.flag.x && pos.y === c.flag.y) return 'goal';
        return undefined;
      },
      onEnd(why, item) {
        sync();
        if (why === 'goal') {
          body.classList.add('happy', 'dance');
          award();
          celebrate(root);
          tune([[523, 110], [659, 110], [784, 110], [1047, 220]]);
          say(`${cheer()} ${name()} made it to the 🏁!`);
          if (from.level != null) {
            const done = doneIds();
            done.add(course.id);
            save(DONE_KEY, [...done]);
            const nxt = LEVELS[from.level + 1];
            after.replaceChildren(...kids(
              nxt ? el('button', { class: 'btn primary big', type: 'button', onclick: () => play(nxt, { level: from.level + 1 }) }, 'Next course ▶') : null,
              el('button', { class: 'btn big', type: 'button', onclick: () => picker('courses') }, '🗺️ All courses')));
          } else {
            after.replaceChildren(el('button', { class: 'btn big', type: 'button', onclick: () => editor(from.mine) }, '✏️ Change my course'));
          }
        } else if (why === 'stopped') {
          say('Stopped. Press ▶ to go again.');
        } else {
          // Bump or not far enough: a faded robot stays where it stopped, the real one goes home,
          // so she can see the start, the path it took (breadcrumbs) and where the plan needs fixing.
          if (why === 'bonk') strip.pulse(item.path);
          say(why === 'bonk' ? "Bonk! Let's fix the plan!" : 'Almost! Add more steps?');
          sc.later(() => {
            if (r.playing || r.midway) return; // she already started again
            leaveGhost();
            goHome();
          }, HOME_DELAY_MS);
        }
      },
    });

    function step() {
      if (!program.length) { say('Press the arrow keys to add steps first!'); return; }
      r.step();
    }
    function clearAll() {
      if (locked() || !program.length) return;
      ask('Clear all steps?', 'Yes, clear them', () => { program = []; edited(); say('All clear. Plan a new path!'); });
    }

    strip.render(program);
    drawLights(null);
    const backTo = from.level != null
      ? el('button', { class: 'btn', type: 'button', onclick: () => picker('courses') }, '‹ Courses')
      : el('button', { class: 'btn', type: 'button', onclick: () => editor(from.mine) }, '‹ Change course');
    view(el('div', { class: 'rb-play' },
      el('div', { class: 'rb-top' }, backTo,
        el('p', { class: 'prompt' }, from.level != null ? `${from.level + 1}. ${course.name}` : course.name),
        el('span', { class: 'rb-ready' }, `${name()} is ready!`)),
      el('div', { class: 'rb-stage' }, el('div', { class: 'rb-board-wrap' }, board), head),
      strip.el,
      el('div', { class: 'row rb-tools' },
        el('button', { class: 'btn', type: 'button', 'data-tool': 'step', onclick: step }, '👣 Step'),
        el('button', { class: 'btn', type: 'button', 'data-tool': 'clear', onclick: clearAll }, '🧹 Clear all')),
      msg, after));

    // Physical keyboard (Chromebook): arrows = keys, Backspace = ✕, Enter = run.
    const KEYS = { ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', Backspace: 'undo', Enter: 'run' };
    const onKey = (e) => {
      if (overlay || e.ctrlKey || e.metaKey || e.altKey || !KEYS[e.key]) return;
      e.preventDefault();
      press(KEYS[e.key]);
    };
    document.addEventListener('keydown', onKey);
    leaveView = () => { r.reset(); document.removeEventListener('keydown', onKey); };
  }

  if (botName() == null) naming(() => picker());
  else picker();
  return () => { leaveView(); closeAsk(); sc.dispose(); };
}
