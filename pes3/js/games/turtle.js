// Turtle Draw: Logo-style drawing with blocks (issue #21). The turtle starts in the middle facing up
// with the pencil down; forward/back draw, turns are ¼ / ½ turns, repeat boxes hold steps.
// "📝 Logo" shows the same program as real Logo text.
import { el, scope, celebrate, award, cheer } from '../util.js';
import { runner, walk } from '../code/engine.js';
import { chipStrip } from '../code/chips.js';
import { TURTLE_OPS, PEN_COLORS, penColor } from '../code/blocks.js';
import { tone, tune } from '../code/sound.js';
import { SHAPES } from './turtle-shapes.js';

export const SIZE = 400; // canvas units; the turtle starts at the middle
const HOME = { x: SIZE / 2, y: SIZE / 2, h: 0, pen: true, color: 0 }; // h = quarter turns clockwise from up
const DISTS = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10..200, counting by tens
const DEFAULT_DIST = 50;
const REPS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const DEFAULT_REP = 4;
const MAX_DEPTH = 2; // a box may hold one more box (v1)
const DEFAULT_COLOR = 4; // red
const GALLERY_MAX = 12;
const SAVE_AWARDS = 3; // garden points for saved drawings per visit (stops spam-saving)
const GALLERY_KEY = 'spelling-games.turtle.gallery.v1';
const DONE_KEY = 'spelling-games.turtle.done.v1';
const FAST_KEY = 'spelling-games.turtle.fast';
let savedAwards = 0; // per page load

const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const TURN = { right: 1, left: -1, right2: 2, left2: -2 };
const BEEP = { fwd: 523, back: 392, left: 440, right: 587, left2: 415, right2: 622, penup: 700, pendown: 350, color: 660, repeat: 494 };
const clamp = (v) => Math.max(0, Math.min(SIZE, v));
const clone = (p) => JSON.parse(JSON.stringify(p));

/* ---------- turtle model (pure; the tests use these) ---------- */
// One block. Returns the new state, the line drawn (if any) and whether it stopped at the edge.
export function stepTurtle(st, b) {
  if (b.op === 'fwd' || b.op === 'back') {
    const d = (b.op === 'back' ? -1 : 1) * b.arg;
    const [dx, dy] = DIR[st.h];
    const tx = st.x + dx * d, ty = st.y + dy * d;
    const x = clamp(tx), y = clamp(ty); // off the canvas: it just stops at the edge
    const seg = st.pen && (x !== st.x || y !== st.y) ? { x1: st.x, y1: st.y, x2: x, y2: y, color: st.color } : null;
    return { st: { ...st, x, y }, seg, edge: x !== tx || y !== ty };
  }
  if (b.op in TURN) return { st: { ...st, h: (st.h + TURN[b.op] + 4) % 4 } };
  if (b.op === 'penup') return { st: { ...st, pen: false } };
  if (b.op === 'pendown') return { st: { ...st, pen: true } };
  if (b.op === 'color') return { st: { ...st, color: b.arg } };
  return { st };
}

export function trace(program) {
  let st = { ...HOME };
  const segs = [];
  let edge = false;
  const it = walk(program);
  let n;
  while (!(n = it.next()).done) {
    const r = stepTurtle(st, n.value.block);
    st = r.st;
    if (r.seg) segs.push(r.seg);
    if (r.edge) edge = true;
  }
  return { segs, st, edge, capped: n.value === 'capped' };
}

// Lines as a set of 10-unit pieces, so drawing a side in two goes (or twice) still counts.
export function pieces(segs) {
  const out = new Set();
  for (const s of segs) {
    if (s.x1 === s.x2) for (let y = Math.min(s.y1, s.y2); y < Math.max(s.y1, s.y2); y += 10) out.add(`${s.x1},${y},v`);
    else for (let x = Math.min(s.x1, s.x2); x < Math.max(s.x1, s.x2); x += 10) out.add(`${x},${s.y1},h`);
  }
  return out;
}

// Covers every piece of the outline, without scribbling more extra line than the outline itself.
export function matches(target, drawn) {
  const T = pieces(target), D = pieces(drawn);
  for (const p of T) if (!D.has(p)) return false;
  let extra = 0;
  for (const p of D) if (!T.has(p)) extra++;
  return extra <= T.size;
}

/* ---------- Logo text ---------- */
const LOGO = {
  fwd: (b) => `FORWARD ${b.arg}`, back: (b) => `BACK ${b.arg}`,
  right: () => 'RIGHT 90', left: () => 'LEFT 90', right2: () => 'RIGHT 180', left2: () => 'LEFT 180',
  penup: () => 'PENUP', pendown: () => 'PENDOWN', color: (b) => `SETPENCOLOR ${b.arg}`,
  repeat: (b) => `REPEAT ${b.arg} [${toLogo(b.body || [])}]`,
};
// Logo has degrees; she has ¼ and ½ turns. RIGHT = clockwise, LEFT = counter-clockwise.
const NOTE = {
  right: '¼ turn ↻ clockwise', left: '¼ turn ↺ counter-clockwise',
  right2: '½ turn ↻ clockwise', left2: '½ turn ↺ counter-clockwise',
};
export const toLogo = (program) => program.map((b) => LOGO[b.op](b)).join(' ');

// One line per top-level block; turns and colours get a ; comment.
export function logoLines(program) {
  return program.map((b) => {
    const text = LOGO[b.op](b);
    if (NOTE[b.op]) return `${text} ; ${NOTE[b.op]}`;
    if (b.op === 'color') return `${text} ; ${penColor(b.arg).name}`;
    if (b.op !== 'repeat') return text;
    const notes = new Set();
    const look = (list) => list.forEach((c) => {
      if (NOTE[c.op]) notes.add(`${LOGO[c.op](c)} = ${NOTE[c.op]}`);
      if (c.op === 'color') notes.add(`${LOGO[c.op](c)} = ${penColor(c.arg).name}`);
      if (c.body) look(c.body);
    });
    look(b.body || []);
    return notes.size ? `${text} ; ${[...notes].join(', ')}` : text;
  });
}

/* ---------- drawing ---------- */
function paint(ctx, scale, { segs, partial, target, grid = true }) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (grid) {
    ctx.strokeStyle = '#eef0f8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = 50; v < SIZE; v += 50) { ctx.moveTo(v, 0); ctx.lineTo(v, SIZE); ctx.moveTo(0, v); ctx.lineTo(SIZE, v); }
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (target) {
    ctx.strokeStyle = 'rgba(99, 102, 241, .22)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (const s of target) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (const s of partial ? [...segs, partial] : segs) {
    ctx.strokeStyle = penColor(s.color).css;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

// Small picture of a program (gallery) or an outline (shape picker), as a data: URL.
function thumb(segs, { target = null, px = 120 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  paint(c.getContext('2d'), px / SIZE, { segs, target, grid: false });
  return c.toDataURL('image/png');
}

// Top-down turtle facing up. The pencil is a separate, unrotated element (tip down = drawing).
const TURTLE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <ellipse cx="24" cy="34" rx="9" ry="7" fill="#65a30d"/><ellipse cx="76" cy="34" rx="9" ry="7" fill="#65a30d"/>
  <ellipse cx="26" cy="72" rx="9" ry="7" fill="#65a30d"/><ellipse cx="74" cy="72" rx="9" ry="7" fill="#65a30d"/>
  <path d="M50 88 L45 97 L55 97 Z" fill="#65a30d"/>
  <circle cx="50" cy="15" r="11" fill="#84cc16" stroke="#3f6212" stroke-width="2.5"/>
  <circle cx="45" cy="12" r="2.3" fill="#1f2340"/><circle cx="55" cy="12" r="2.3" fill="#1f2340"/>
  <ellipse cx="50" cy="54" rx="27" ry="31" fill="#15803d" stroke="#14532d" stroke-width="3"/>
  <path d="M50 30 L64 44 L60 64 L40 64 L36 44 Z" fill="#22c55e" stroke="#14532d" stroke-width="2"/>
</svg>`;

/* ---------- storage ---------- */
function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}
const loadGallery = () => (Array.isArray(load(GALLERY_KEY, [])) ? load(GALLERY_KEY, []) : []);
const kids = (...a) => a.filter((k) => k != null && k !== false); // replaceChildren() prints null as "null"

/* ---------- the game ---------- */
export function mount(root, _entries, api) {
  const sc = scope();
  let leaveView = () => {};
  let overlay = null;
  let freeProgram = [];
  let showLogo = false;
  let fast = load(FAST_KEY, false) === true;
  const wait = (ms) => new Promise((res) => sc.later(res, ms));

  function view(...nodes) {
    leaveView();
    leaveView = () => {};
    closePop();
    root.replaceChildren(...nodes);
  }
  function closePop() {
    if (overlay) { overlay.remove(); overlay = null; }
  }
  function pop(label, ...content) {
    closePop();
    const card = el('div', { class: 'panel tt-pop' }, ...content);
    overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': label,
      onclick: (e) => { if (e.target === overlay) closePop(); } }, card);
    document.body.append(overlay);
  }
  function ask(text, yesLabel, onYes, noLabel = 'No, keep it') {
    pop(text, el('h2', {}, text), el('div', { class: 'row' },
      el('button', { class: 'btn primary big', type: 'button', onclick: () => { closePop(); onYes(); } }, yesLabel),
      el('button', { class: 'btn big', type: 'button', onclick: closePop }, noLabel)));
  }

  function tabs(cur) {
    const t = (id, label) => el('button', { class: 'rb-tab', type: 'button', role: 'tab', 'aria-selected': String(cur === id),
      onclick: () => (id === 'free' ? workspace({}) : id === 'shapes' ? shapes() : gallery()) }, label);
    return el('div', { class: 'rb-tabs', role: 'tablist' }, t('free', '🖍️ Free draw'), t('shapes', '🎯 Copy the shape'), t('gallery', '🖼️ My drawings'));
  }

  /* ----- shape picker ----- */
  function shapes() {
    const done = new Set(load(DONE_KEY, []));
    view(el('div', { class: 'rb-pick' }, tabs('shapes'),
      el('p', { class: 'prompt' }, 'Pick a shape, then code the turtle to draw over it.'),
      el('div', { class: 'tt-tiles' }, SHAPES.map((s) =>
        el('button', { class: `tt-tile${done.has(s.id) ? ' done' : ''}`, type: 'button', 'data-id': s.id, onclick: () => workspace({ shape: s }) },
          el('img', { src: thumb([], { target: trace(s.solution).segs }), alt: '' }),
          el('span', { class: 'rb-nm' }, s.name),
          done.has(s.id) ? el('span', { class: 'rb-star', 'aria-label': 'finished' }, '⭐') : null)))));
  }

  /* ----- gallery ----- */
  function gallery() {
    const items = loadGallery();
    view(el('div', { class: 'rb-pick' }, tabs('gallery'),
      items.length
        ? el('div', { class: 'tt-tiles' }, items.map((g) => el('div', { class: 'rb-mine-wrap tt-gal' },
          el('button', { class: 'tt-tile', type: 'button', 'data-id': g.id, onclick: () => { freeProgram = clone(g.program); workspace({ draw: true }); } },
            el('img', { src: g.thumb, alt: 'my drawing' }), el('span', { class: 'rb-nm' }, g.name)),
          el('button', { class: 'rb-del', type: 'button', 'aria-label': `Delete ${g.name}`, onclick: () => ask(`Delete “${g.name}”?`, 'Yes, delete it', () => {
            save(GALLERY_KEY, loadGallery().filter((x) => x.id !== g.id));
            gallery();
          }) }, '🗑️'))))
        : el('p', { class: 'note' }, 'No drawings yet. Make one in 🖍️ Free draw and tap 💾 Save!')));
  }

  /* ----- the coding workspace (free draw, or copy a shape) ----- */
  function workspace({ shape = null, draw: drawNow = false }) {
    let program = shape ? [] : freeProgram;
    const setProgram = (p) => { program = p; if (!shape) freeProgram = p; };
    let open = null; // path of the repeat box new blocks go into
    let st = { ...HOME };
    let deg = 0; // turtle heading in degrees, accumulating so turns animate the short way
    let segs = [];
    let partial = null;
    let edge = false;
    let gone = false;
    const target = shape ? trace(shape.solution).segs : null;

    const canvas = el('canvas', { class: 'tt-canvas', width: SIZE * 2, height: SIZE * 2, 'aria-label': 'drawing' });
    const ctx = canvas.getContext('2d');
    const body = el('div', { class: 'tt-body' });
    body.innerHTML = TURTLE_SVG;
    const pen = el('span', { class: 'tt-pen', 'aria-hidden': 'true' }, '✏️');
    const turtle = el('div', { class: 'tt-turtle' }, body, pen);
    const stage = el('div', { class: 'tt-stage' }, canvas, turtle);
    const redraw = () => paint(ctx, canvas.width / SIZE, { segs, partial, target });
    function place(x, y) {
      turtle.style.left = `${(x / SIZE) * 100}%`;
      turtle.style.top = `${(y / SIZE) * 100}%`;
      body.style.transform = `rotate(${deg}deg)`;
      pen.classList.toggle('up', !st.pen);
      pen.style.setProperty('--pc', penColor(st.color).css);
      Object.assign(turtle.dataset, { x: Math.round(x), y: Math.round(y), h: st.h, pen: st.pen ? 'down' : 'up' });
    }
    function home() {
      st = { ...HOME }; deg = 0; segs = []; partial = null; edge = false;
      place(st.x, st.y);
      redraw();
    }
    // Shows a whole program at once (opening a saved drawing).
    function showAll() {
      const t = trace(program);
      segs = t.segs; st = t.st; deg = st.h * 90;
      place(st.x, st.y);
      redraw();
    }
    const speed = (ms) => (fast ? ms / 4 : ms);
    function animate(ms, frame) {
      return new Promise((res) => {
        const t0 = performance.now();
        const tick = (now) => {
          if (gone) return;
          const t = Math.min(1, (now - t0) / ms);
          frame(t);
          if (t < 1) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
    }

    const msg = el('div', { class: 'msg', 'aria-live': 'polite' }, shape ? `Draw the ${shape.name.toLowerCase()}!` : 'Tap blocks to make a program, then ▶.');
    const say = (t) => { msg.textContent = t; };
    const strip = chipStrip({ ops: TURTLE_OPS, onTap: editChip, empty: 'Your steps show up here.' });
    const logo = el('pre', { class: 'tt-logo', 'aria-label': 'Logo text' });
    const after = el('div', { class: 'row rb-after' });

    // ----- program editing -----
    const getBlock = (path) => path.reduce((b, i, k) => (k ? b.body[i] : program[i]), null);
    const containerOf = (path) => (path ? getBlock(path).body : program);
    const locked = () => r.playing;
    function edited() {
      r.reset();
      strip.render(program, open);
      strip.pulse(null);
      logo.textContent = logoLines(program).join('\n') || '; (no steps yet)';
      logo.hidden = !showLogo;
      keys.forEach((k) => {
        if (k.dataset.op === 'repeat') k.disabled = !!open && open.length >= MAX_DEPTH;
      });
      closeKey.hidden = !open;
      after.replaceChildren();
    }
    function add(op) {
      if (locked()) return;
      tone(BEEP[op], 110);
      const b = { op };
      if (op === 'fwd' || op === 'back') b.arg = DEFAULT_DIST;
      if (op === 'color') b.arg = DEFAULT_COLOR;
      if (op === 'repeat') {
        if (open && open.length >= MAX_DEPTH) return;
        Object.assign(b, { arg: DEFAULT_REP, body: [] });
      }
      const into = containerOf(open);
      into.push(b);
      const path = [...(open || []), into.length - 1];
      if (op === 'repeat') open = path;
      say(op === 'repeat' ? 'Tap blocks to put them in the box. Tap ✅ when the box is done.' : '');
      edited();
      if (op === 'color') editChip(path, b);
    }
    function closeBox() {
      if (!open) return;
      open = open.length > 1 ? open.slice(0, -1) : null;
      tone(BEEP.repeat, 90);
      say('');
      edited();
    }
    function removeAt(path) {
      const parent = path.length > 1 ? getBlock(path.slice(0, -1)).body : program;
      const i = path[path.length - 1];
      if (open) {
        const inside = path.every((v, k) => open[k] === v);
        if (inside) open = path.length > 1 ? path.slice(0, -1) : null;
        else if (open.length >= path.length && path.slice(0, -1).every((v, k) => open[k] === v) && open[path.length - 1] > i) {
          open = [...open];
          open[path.length - 1]--;
        }
      }
      r.reset();
      strip.poof(path, () => { parent.splice(i, 1); edited(); });
    }
    function undo() {
      if (locked()) return;
      tone(330, 110);
      const c = containerOf(open);
      if (c.length) removeAt([...(open || []), c.length - 1]);
      else if (open) removeAt(open); // an empty box: take the box away
    }
    function clearAll() {
      if (locked() || !program.length) return;
      ask('Clear all steps?', 'Yes, clear them', () => { setProgram([]); open = null; edited(); home(); say('All clear!'); }, 'No, keep them');
    }

    // Tap a chip: change its number or colour, or take it away.
    function editChip(path, b) {
      if (locked()) return;
      const o = TURTLE_OPS[b.op];
      const word = typeof o.word === 'function' ? o.word(b) : o.word;
      const set = (arg) => { b.arg = arg; closePop(); tone(BEEP[b.op], 80); edited(); };
      const pick = (vals, label, fmt = String) => el('div', { class: 'tt-nums', role: 'group', 'aria-label': label }, vals.map((v) =>
        el('button', { class: `btn tt-num${v === b.arg ? ' on' : ''}`, type: 'button', 'data-v': v, onclick: () => set(v) }, fmt(v))));
      const parts = [el('h2', {}, `${o.icon} ${word}`)];
      if (b.op === 'fwd' || b.op === 'back') parts.push(el('p', { class: 'label' }, 'How far?'), pick(DISTS, 'How far'));
      if (b.op === 'repeat') {
        parts.push(el('p', { class: 'label' }, 'How many times?'), pick(REPS, 'How many times'));
        if (!(open && open.join('.') === path.join('.'))) {
          parts.push(el('button', { class: 'btn', type: 'button', onclick: () => { open = path; closePop(); say('Tap blocks to put them in the box.'); edited(); } }, '➕ Put more steps in this box'));
        }
      }
      if (b.op === 'color') {
        parts.push(el('p', { class: 'label' }, 'Pick a colour'), el('div', { class: 'tt-nums', role: 'group', 'aria-label': 'Colours' }, PEN_COLORS.map((c) =>
          el('button', { class: `tt-swatch${c.n === b.arg ? ' on' : ''}`, type: 'button', 'data-v': c.n, 'aria-label': c.name, style: `background:${c.css}`, onclick: () => set(c.n) }))));
      }
      parts.push(el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', 'data-act': 'remove', onclick: () => { closePop(); removeAt(path); } }, b.op === 'repeat' ? '🗑️ Remove box and its steps' : '🗑️ Remove'),
        el('button', { class: 'btn primary', type: 'button', onclick: closePop }, 'Done')));
      pop(word, ...parts);
    }

    // ----- block keys -----
    const KEYS = [['fwd', 'forward'], ['back', 'back'], ['left', '¼ counter-clockwise'], ['right', '¼ clockwise'],
      ['left2', '½ counter-clockwise'], ['right2', '½ clockwise'], ['pendown', 'pencil down'], ['penup', 'pencil up'],
      ['color', 'colour'], ['repeat', 'repeat']];
    const keys = KEYS.map(([op, word]) => {
      const o = TURTLE_OPS[op];
      return el('button', { class: `tt-key c-${o.color}`, type: 'button', 'data-op': op, 'aria-label': word, onclick: () => add(op) },
        el('span', { class: `ci${o.iconClass ? ` ${o.iconClass}` : ''}` }, o.icon), el('span', { class: 'cw' }, word));
    });
    const closeKey = el('button', { class: 'tt-key tt-close', type: 'button', 'data-op': 'close', onclick: closeBox, hidden: true }, '✅ Close the box');

    // ----- running -----
    const playBtn = el('button', { class: 'btn primary big tt-play', type: 'button', onclick: playStop }, '▶ Play');
    function sync() {
      playBtn.textContent = r.playing ? '⏹ Stop' : '▶ Play';
      stage.closest('.tt-work')?.classList.toggle('running', r.playing);
    }
    function playStop() {
      if (r.playing) { r.stop(); return; }
      if (!program.length) { say('Tap some blocks first!'); return; }
      tune([[523, 70], [659, 70], [784, 90]]);
      r.play();
      sync();
      sc.later(sync, 0);
    }
    function step() {
      if (!program.length) { say('Tap some blocks first!'); return; }
      r.step();
    }
    const r = runner({
      program: () => program,
      async onStart() { say(''); after.replaceChildren(); home(); },
      onActive(item) { strip.setActive(item && item.path); sync(); },
      async exec({ block }) {
        tone(BEEP[block.op] || 500, 70, { gain: 0.05 });
        const from = st;
        const res = stepTurtle(st, block);
        st = res.st;
        if (block.op === 'fwd' || block.op === 'back') {
          const dist = Math.abs(st.x - from.x) + Math.abs(st.y - from.y);
          await animate(speed(150 + dist * 4), (t) => {
            const x = from.x + (st.x - from.x) * t, y = from.y + (st.y - from.y) * t;
            partial = res.seg ? { ...res.seg, x2: x, y2: y } : null;
            place(x, y);
            redraw();
          });
          partial = null;
          if (res.seg) segs.push(res.seg);
          if (res.edge) edge = true;
          redraw();
        } else if (block.op in TURN) {
          const d0 = deg;
          deg += TURN[block.op] * 90;
          const d1 = deg;
          await animate(speed(320), (t) => { deg = d0 + (d1 - d0) * t; place(st.x, st.y); });
          deg = d1;
        } else {
          place(st.x, st.y);
          await wait(speed(200));
        }
        return undefined;
      },
      onEnd(why) {
        sync();
        if (why === 'stopped') { say('Stopped. Press ▶ to draw again.'); return; }
        if (shape) {
          if (matches(target, segs)) {
            award();
            celebrate(root);
            tune([[523, 110], [659, 110], [784, 110], [1047, 220]]);
            const done = new Set(load(DONE_KEY, []));
            done.add(shape.id);
            save(DONE_KEY, [...done]);
            say(`✨ ${cheer()} You drew the ${shape.name.toLowerCase()}!`);
            const i = SHAPES.indexOf(shape);
            after.replaceChildren(...kids(
              SHAPES[i + 1] ? el('button', { class: 'btn primary big', type: 'button', onclick: () => workspace({ shape: SHAPES[i + 1] }) }, 'Next shape ▶') : null,
              el('button', { class: 'btn big', type: 'button', onclick: shapes }, '🎯 All shapes')));
          } else {
            say('Try changing a step!');
          }
        } else if (why === 'capped') {
          say('That is a lot of steps! The turtle took a rest.');
        } else {
          say(edge ? 'Ta-da! (The turtle stopped at the edge.)' : 'Ta-da!');
        }
      },
    });

    // ----- free-draw gallery save -----
    function saveDrawing() {
      if (locked()) return;
      const t = trace(program);
      if (!t.segs.length) { say('Draw something first!'); return; }
      const all = loadGallery();
      if (all.length >= GALLERY_MAX) { say('Your gallery is full. Delete one in 🖼️ My drawings first.'); return; }
      const n = all.reduce((k, g) => Math.max(k, parseInt(String(g.name).replace(/\D/g, ''), 10) || 0), 0) + 1;
      all.push({ id: `d${Date.now()}`, name: `Drawing ${n}`, program: clone(program), thumb: thumb(t.segs) });
      if (!save(GALLERY_KEY, all)) { say('Hmm, there is no room to save on this device.'); return; }
      if (savedAwards < SAVE_AWARDS) { savedAwards++; award(); }
      tune([[659, 90], [880, 120]]);
      say(`Saved as “Drawing ${n}”! 🖼️`);
    }

    const fastBtn = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(fast), onclick: () => {
      fast = !fast; save(FAST_KEY, fast); fastBtn.setAttribute('aria-pressed', String(fast)); fastBtn.textContent = fast ? '🐇 Fast' : '🐢 Slow';
    } }, fast ? '🐇 Fast' : '🐢 Slow');
    const logoBtn = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(showLogo), onclick: () => {
      showLogo = !showLogo; logo.hidden = !showLogo; logoBtn.setAttribute('aria-pressed', String(showLogo));
    } }, '📝 Logo');

    const top = shape
      ? el('div', { class: 'rb-top' }, el('button', { class: 'btn', type: 'button', onclick: shapes }, '‹ Shapes'), el('p', { class: 'prompt' }, `🎯 ${shape.name}`), el('span'))
      : tabs('free');
    view(el('div', { class: 'tt-wrap' },
      top,
      el('div', { class: 'tt-work' }, stage, el('div', { class: 'tt-keys' }, keys, closeKey)),
      strip.el,
      el('div', { class: 'row tt-controls' }, kids(
        playBtn,
        el('button', { class: 'btn', type: 'button', 'data-tool': 'step', onclick: step }, '👣 Step'),
        el('button', { class: 'btn', type: 'button', 'data-tool': 'undo', onclick: undo }, '✕ Undo'),
        el('button', { class: 'btn', type: 'button', 'data-tool': 'clear', onclick: clearAll }, '🧹 Clear'),
        fastBtn, logoBtn,
        shape ? null : el('button', { class: 'btn', type: 'button', 'data-tool': 'save', onclick: saveDrawing }, '💾 Save'))),
      logo, msg, after));
    edited();
    if (drawNow) showAll(); else home();
    leaveView = () => { gone = true; r.reset(); };
  }

  workspace({});
  return () => { leaveView(); closePop(); sc.dispose(); };
}
