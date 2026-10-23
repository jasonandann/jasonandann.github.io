// Code Studio (issue #22): a small ScratchJr-style sprite playground (https://www.scratchjr.org/).
// 1-4 emoji sprites on a 20x15 stage; each sprite has scripts that start on 🏁 (▶ tapped) or 👆 (sprite
// tapped). All started scripts run at once (threads() in js/code/engine.js). Editing is by tap (chips
// can also be dragged to reorder). No garden points in v1 (no natural "finished" moment).
import { el, scope, keyboard } from '../util.js';
import { threads } from '../code/engine.js';
import { chipStrip } from '../code/chips.js';
import { STUDIO_OPS, NOTES, halfSeconds } from '../code/blocks.js';
import { tone } from '../code/sound.js';

export const COLS = 20, ROWS = 15;
const MAX_SPRITES = 4;
const MAX_PROJECTS = 12;
const MAX_DEPTH = 2; // a box may hold one more box
const SAY_MS = 2000;
const PROJECTS_KEY = 'spelling-games.studio.projects.v1';
const DRAFT_KEY = 'spelling-games.studio.draft.v1'; // the project she is working on, so Home doesn't lose it
const SPRITES = ['🐱', '🐶', '🦄', '🚀', '🐢', '🤖', '🐸', '🦋', '🐠', '🦖', '🐝', '⚽'];
const PROJECT_ICONS = ['⭐', '🌈', '🎈', '🎮', '🏰', '🌊', '🚀', '🦄', '🎵', '🌸', '🍕', '🎪'];
const PHRASES = ['Hi!', 'Hello!', 'Yay!', "Let's go!", 'Watch me!', 'Ta-da!', "I'm hungry!", 'Bye!'];
export const BACKDROPS = [
  { id: 'plain', icon: '⬜', name: 'Plain' }, { id: 'sky', icon: '☁️', name: 'Sky' },
  { id: 'grass', icon: '🌱', name: 'Grass' }, { id: 'space', icon: '🌌', name: 'Space' },
  { id: 'ocean', icon: '🌊', name: 'Ocean' }, { id: 'city', icon: '🏙️', name: 'City' },
  { id: 'sunset', icon: '🌅', name: 'Sunset' }, { id: 'night', icon: '🌙', name: 'Night' },
];
const CATS = [
  { id: 'motion', icon: '🏃', name: 'Move', ops: [['right', 'right'], ['left', 'left'], ['up', 'up'], ['down', 'down'],
    ['turnL', '¼ counter-clockwise'], ['turnR', '¼ clockwise'], ['turnL2', '½ counter-clockwise'], ['turnR2', '½ clockwise'], ['home', 'go home']] },
  { id: 'looks', icon: '💬', name: 'Looks', ops: [['say', 'say'], ['grow', 'grow'], ['shrink', 'shrink'], ['hide', 'hide'], ['show', 'show']] },
  { id: 'sound', icon: '🎵', name: 'Sound', ops: [['note', 'note'], ['pop', 'pop']] },
  { id: 'control', icon: '🔁', name: 'Control', ops: [['wait', 'wait'], ['repeat', 'repeat'], ['forever', 'forever'], ['stop', 'stop']] },
];
const DEFAULT_ARG = { right: 1, left: 1, up: 1, down: 1, say: 'Hi!', note: 0, wait: 2, repeat: 4 };
const BOXES = new Set(['repeat', 'forever']);
const MOVES = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
const TURNS = { turnL: -1, turnR: 1, turnL2: -2, turnR2: 2 };
const kids = (...a) => a.filter((k) => k != null && k !== false); // replaceChildren() prints null as "null"

let stepsRun = 0; // blocks run since load (tests check that threads really stop)
export const debugSteps = () => stepsRun;

/* ---------- project model (plain JSON; key order fixed so a save reloads byte-identical) ---------- */
function newSprite(emoji, n) {
  return { id: `s${n}`, emoji, x: 3 + ((n - 1) % 4) * 4, y: 10 - Math.floor((n - 1) / 4) * 3, dir: 0, size: 1,
    scripts: [{ event: 'flag', blocks: [] }] };
}
export function newProject() {
  return { v: 1, id: null, icon: '⭐', name: '', backdrop: 'grass', sprites: [newSprite('🐱', 1)] };
}
const clampX = (v) => Math.max(0, Math.min(COLS - 1, v));
const clampY = (v) => Math.max(0, Math.min(ROWS - 1, v));
const round = (v) => Math.round(v * 1000) / 1000;

// Where one motion/looks block leaves a sprite (rt = {x, y, dir, size, hidden}; dir = quarter turns, not
// wrapped, so a turn always animates the short way). Off the stage = stays at the edge.
export function stepSprite(rt, home, b) {
  if (MOVES[b.op]) {
    const [dx, dy] = MOVES[b.op];
    return { ...rt, x: clampX(rt.x + dx * b.arg), y: clampY(rt.y + dy * b.arg) };
  }
  if (b.op in TURNS) return { ...rt, dir: rt.dir + TURNS[b.op] };
  if (b.op === 'home') return { ...rt, x: home.x, y: home.y, dir: home.dir };
  if (b.op === 'grow') return { ...rt, size: round(Math.min(3, rt.size * 1.25)) };
  if (b.op === 'shrink') return { ...rt, size: round(Math.max(0.4, rt.size / 1.25)) };
  if (b.op === 'hide') return { ...rt, hidden: true };
  if (b.op === 'show') return { ...rt, hidden: false };
  return rt;
}

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}
const loadProjects = () => (Array.isArray(load(PROJECTS_KEY, [])) ? load(PROJECTS_KEY, []) : []);
const valid = (p) => p && p.v === 1 && Array.isArray(p.sprites) && p.sprites.length > 0;
const nice = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'My project');

/* ---------- the game ---------- */
export function mount(root, _entries, api) {
  const sc = scope();
  let gone = false;
  let overlay = null;
  let project = valid(load(DRAFT_KEY, null)) ? load(DRAFT_KEY, null) : newProject();
  let selId = project.sprites[0].id; // selected sprite
  let sel = 0; // selected script (blocks from the palette go here)
  let open = null; // path of the repeat/forever box blocks go into
  let cat = 'motion';
  const rts = new Map(); // sprite id -> {x, y, dir, size, hidden}; runtime only, never saved
  const nodes = new Map(); // sprite id -> {node, body, bubble}
  let strips = [];
  const say = (t) => { if (msg) msg.textContent = t; };
  root.__studio = () => project; // tests read the live project

  const sprite = () => project.sprites.find((s) => s.id === selId) || project.sprites[0];
  const script = () => sprite().scripts[sel];
  const rtOf = (s) => {
    if (!rts.has(s.id)) rts.set(s.id, { x: s.x, y: s.y, dir: s.dir, size: s.size, hidden: false });
    return rts.get(s.id);
  };
  function changed() { save(DRAFT_KEY, project); }

  /* ----- pop-ups ----- */
  function closePop() { if (overlay) { overlay.remove(); overlay = null; } }
  function pop(label, ...content) {
    closePop();
    const card = el('div', { class: 'panel tt-pop' }, ...content);
    overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': label,
      onclick: (e) => { if (e.target === overlay) closePop(); } }, card);
    document.body.append(overlay);
  }
  function ask(text, yesLabel, onYes) {
    pop(text, el('h2', {}, text), el('div', { class: 'row' },
      el('button', { class: 'btn primary big', type: 'button', onclick: () => { closePop(); onYes(); } }, yesLabel),
      el('button', { class: 'btn big', type: 'button', onclick: closePop }, 'No, keep it')));
  }

  /* ----- running ----- */
  function animate(ms, frame, alive) {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = (now) => {
        if (gone || !alive()) return res();
        const t = Math.min(1, (now - t0) / ms);
        frame(t);
        if (t < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }
  function sleep(ms, alive) {
    return new Promise((res) => {
      const end = performance.now() + ms;
      const check = () => (gone || !alive() || performance.now() >= end ? res() : setTimeout(check, Math.min(50, end - performance.now())));
      check();
    });
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  async function exec({ block: b }, ctx, alive) {
    stepsRun++;
    const s = ctx.sprite;
    const rt = rtOf(s);
    const to = stepSprite(rt, s, b);
    const from = { ...rt };
    const tween = async (ms) => {
      await animate(ms, (t) => {
        Object.assign(rt, { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), dir: lerp(from.dir, to.dir, t), size: lerp(from.size, to.size, t) });
        draw(s);
      }, alive);
      if (alive()) { Object.assign(rt, to); draw(s); }
    };
    if (MOVES[b.op]) await tween(150 + 200 * Math.max(1, Math.abs(to.x - from.x) + Math.abs(to.y - from.y)));
    else if (b.op in TURNS || b.op === 'home') await tween(300);
    else if (b.op === 'grow' || b.op === 'shrink') await tween(250);
    else if (b.op === 'hide' || b.op === 'show') { Object.assign(rt, to); draw(s); await sleep(250, alive); }
    else if (b.op === 'say') {
      const n = nodes.get(s.id);
      const token = {};
      n.bubble.textContent = b.arg;
      n.bubble.hidden = false;
      n.sayToken = token;
      await sleep(SAY_MS, alive);
      if (n.sayToken === token) n.bubble.hidden = true;
    } else if (b.op === 'note') { tone(NOTES[b.arg].hz, 380, { type: 'triangle', gain: 0.15 }); await sleep(420, alive); }
    else if (b.op === 'pop') { tone(900, 50, { type: 'square', gain: 0.08 }); tone(300, 90, { gain: 0.1, at: 40 }); await sleep(160, alive); }
    else if (b.op === 'wait') await sleep(b.arg * 500, alive);
    else if (b.op === 'stop') return 'stop';
    else await sleep(16, alive);
    return undefined;
  }
  const th = threads({
    exec,
    onActive(key, item) {
      const [sid, idx] = key.split('|');
      if (sid === selId && strips[+idx]) strips[+idx].setActive(item ? item.path : null);
    },
    onChange: () => sync(),
  });
  const busy = () => th.running();
  function startFlag() {
    th.stopAll();
    closePop();
    for (const s of project.sprites) {
      rts.set(s.id, { x: s.x, y: s.y, dir: s.dir, size: s.size, hidden: false });
      const n = nodes.get(s.id);
      if (n) n.bubble.hidden = true;
      draw(s);
    }
    let any = false;
    project.sprites.forEach((s) => s.scripts.forEach((sc2, i) => {
      if (sc2.event === 'flag' && sc2.blocks.length) { any = true; th.start(`${s.id}|${i}`, sc2.blocks, { sprite: s }); }
    }));
    say(any ? '' : 'Put some blocks in a 🏁 script first!');
  }
  function stopAll() {
    th.stopAll();
    for (const n of nodes.values()) n.bubble.hidden = true;
  }
  function tapSprite(s) {
    if (s.id !== selId) { selId = s.id; sel = 0; open = null; drawEditor(); }
    s.scripts.forEach((sc2, i) => {
      if (sc2.event === 'tap' && sc2.blocks.length) th.start(`${s.id}|${i}`, sc2.blocks, { sprite: s });
    });
  }

  /* ----- stage ----- */
  const stage = el('div', { class: 'st-stage', 'aria-label': 'stage' });
  function draw(s) {
    const n = nodes.get(s.id);
    if (!n) return;
    const rt = rtOf(s);
    n.node.style.left = `${((rt.x + 0.5) / COLS) * 100}%`;
    n.node.style.top = `${((rt.y + 0.5) / ROWS) * 100}%`;
    n.body.style.transform = `rotate(${rt.dir * 90}deg) scale(${rt.size})`;
    n.node.classList.toggle('hidden', !!rt.hidden);
    n.node.classList.toggle('sel', s.id === selId);
    Object.assign(n.node.dataset, { x: round(rt.x), y: round(rt.y), dir: round(rt.dir), size: round(rt.size), hidden: rt.hidden ? '1' : '0' });
  }
  function drawStage() {
    stage.className = `st-stage bd-${project.backdrop}`;
    stage.replaceChildren();
    nodes.clear();
    for (const s of project.sprites) {
      const body = el('span', { class: 'st-body' }, s.emoji);
      const bubble = el('span', { class: 'st-bubble', hidden: true });
      const node = el('div', { class: 'st-sprite', role: 'button', tabindex: '0', 'aria-label': `sprite ${s.emoji}`, 'data-id': s.id,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapSprite(s); } } }, body, bubble);
      nodes.set(s.id, { node, body, bubble });
      stage.append(node);
      draw(s);
    }
  }
  // Tap a sprite = select it + run its 👆 scripts. Drag a sprite (not while running) = move its home.
  // Tap empty stage (not while running) = move the selected sprite's home there.
  let press = null;
  const cellAt = (e) => {
    const r = stage.getBoundingClientRect();
    return [clampX(Math.floor(((e.clientX - r.left) / r.width) * COLS)), clampY(Math.floor(((e.clientY - r.top) / r.height) * ROWS))];
  };
  stage.addEventListener('pointerdown', (e) => {
    const node = e.target.closest('.st-sprite');
    press = { id: node ? node.dataset.id : null, x0: e.clientX, y0: e.clientY, moved: false };
    try { stage.setPointerCapture(e.pointerId); } catch { /* ok */ }
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!press || !press.id || busy()) return;
    if (!press.moved && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < 10) return;
    press.moved = true;
    const s = project.sprites.find((q) => q.id === press.id);
    [s.x, s.y] = cellAt(e);
    rts.set(s.id, { ...rtOf(s), x: s.x, y: s.y });
    draw(s);
  });
  stage.addEventListener('pointerup', (e) => {
    const p = press;
    press = null;
    if (!p) return;
    const s = p.id && project.sprites.find((q) => q.id === p.id);
    if (p.moved) { changed(); if (s && s.id !== selId) { selId = s.id; sel = 0; open = null; drawEditor(); } return; }
    if (s) { tapSprite(s); return; }
    if (busy()) return;
    const t = sprite();
    [t.x, t.y] = cellAt(e);
    rts.set(t.id, { ...rtOf(t), x: t.x, y: t.y });
    draw(t);
    changed();
  });
  stage.addEventListener('pointercancel', () => { press = null; });

  /* ----- editing ----- */
  const getBlock = (path) => path.reduce((b, i, k) => (k ? b.body[i] : script().blocks[i]), null);
  const containerOf = (path) => (path ? getBlock(path).body : script().blocks);
  const locked = () => {
    if (!busy()) return false;
    say('Tap ⏹ to change the code.');
    return true;
  };
  function add(op) {
    if (locked()) return;
    if (!script()) { sprite().scripts.push({ event: 'flag', blocks: [] }); sel = sprite().scripts.length - 1; }
    if (BOXES.has(op) && open && open.length >= MAX_DEPTH) return;
    const b = { op };
    if (op in DEFAULT_ARG) b.arg = DEFAULT_ARG[op];
    if (BOXES.has(op)) b.body = [];
    const into = containerOf(open);
    into.push(b);
    const path = [...(open || []), into.length - 1];
    if (BOXES.has(op)) open = path;
    say(BOXES.has(op) ? 'Tap blocks to put them in the box. Tap ✅ when the box is done.' : '');
    tone(op === 'note' ? NOTES[0].hz : 520, 70, { gain: 0.06 });
    edited();
    if (op === 'say' || op === 'note') editChip(sel, path, b);
  }
  function closeBox() {
    if (!open) return;
    open = open.length > 1 ? open.slice(0, -1) : null;
    say('');
    edited();
  }
  function removeAt(i, path) {
    if (locked()) return;
    selectScript(i);
    const list = path.length > 1 ? getBlock(path.slice(0, -1)).body : script().blocks;
    const k = path[path.length - 1];
    if (open && path.every((v, d) => open[d] === v)) open = path.length > 1 ? path.slice(0, -1) : null;
    else if (open && open.length >= path.length && path.slice(0, -1).every((v, d) => open[d] === v) && open[path.length - 1] > k) {
      open = [...open];
      open[path.length - 1]--;
    }
    list.splice(k, 1);
    edited();
  }
  function pathOf(target, list, base = []) {
    for (let i = 0; i < list.length; i++) {
      if (list[i] === target) return [...base, i];
      const inner = list[i].body && pathOf(target, list[i].body, [...base, i]);
      if (inner) return inner;
    }
    return null;
  }
  function moveStep(i, parent, from, to) {
    if (locked()) return;
    selectScript(i);
    const list = containerOf(parent.length ? parent : null);
    const openBlock = open && getBlock(open);
    const [b] = list.splice(from, 1);
    list.splice(to, 0, b);
    open = openBlock ? pathOf(openBlock, script().blocks) : null;
    edited();
  }
  function selectScript(i) {
    if (i === sel) return;
    sel = i;
    open = null;
  }
  // Tap a chip: change its number / phrase / note, open its box for more steps, or remove it.
  function editChip(i, path, b) {
    if (locked()) return;
    selectScript(i);
    const o = STUDIO_OPS[b.op];
    const word = typeof o.word === 'function' ? o.word(b) : o.word;
    const set = (arg) => { b.arg = arg; closePop(); edited(); };
    const grid = (vals, label, fmt = String, onPick = set) => el('div', { class: 'tt-nums', role: 'group', 'aria-label': label }, vals.map((v) =>
      el('button', { class: `btn tt-num${v === b.arg ? ' on' : ''}`, type: 'button', 'data-v': v, onclick: () => onPick(v) }, fmt(v))));
    const parts = [el('h2', {}, `${o.icon} ${word}`)];
    if (MOVES[b.op]) parts.push(el('p', { class: 'label' }, 'How many squares?'), grid([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'How far'));
    if (b.op === 'repeat') parts.push(el('p', { class: 'label' }, 'How many times?'), grid([2, 3, 4, 5, 6, 7, 8, 9, 10], 'How many times'));
    if (b.op === 'wait') parts.push(el('p', { class: 'label' }, 'How long? (seconds)'), grid([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'How long', (v) => `${halfSeconds(v)}`));
    if (b.op === 'note') {
      parts.push(el('p', { class: 'label' }, 'Pick a note'), el('div', { class: 'st-notes', role: 'group', 'aria-label': 'Notes' }, NOTES.map((nt, k) =>
        el('button', { class: `btn tt-num${k === b.arg ? ' on' : ''}`, type: 'button', 'data-v': k,
          onclick: () => { tone(nt.hz, 300, { type: 'triangle', gain: 0.15 }); set(k); } }, nt.name))));
    }
    if (b.op === 'say') {
      parts.push(el('p', { class: 'label' }, 'What should it say?'), el('div', { class: 'st-phrases', role: 'group', 'aria-label': 'Phrases' }, PHRASES.map((ph) =>
        el('button', { class: `btn tt-num${ph === b.arg ? ' on' : ''}`, type: 'button', 'data-v': ph, onclick: () => set(ph) }, ph))),
      el('button', { class: 'btn', type: 'button', 'data-act': 'type', onclick: () => typeSay(b) }, '⌨️ Type my own'));
    }
    if (BOXES.has(b.op) && !(open && open.join('.') === path.join('.'))) {
      parts.push(el('button', { class: 'btn', type: 'button', onclick: () => { open = path; closePop(); say('Tap blocks to put them in the box.'); edited(); } }, '➕ Put more steps in this box'));
    }
    parts.push(el('div', { class: 'row' },
      el('button', { class: 'btn', type: 'button', 'data-act': 'remove', onclick: () => { closePop(); removeAt(i, path); } }, BOXES.has(b.op) ? '🗑️ Remove box and its steps' : '🗑️ Remove'),
      el('button', { class: 'btn primary', type: 'button', onclick: closePop }, 'Done')));
    pop(word, ...parts);
  }
  function typeSay(b) {
    let text = '';
    const shown = el('div', { class: 'typed st-typed' }, ' ');
    const show = () => { shown.textContent = text || ' '; };
    const done = () => { b.arg = text.trim() ? text.trim().charAt(0).toUpperCase() + text.trim().slice(1) : b.arg; closePop(); edited(); };
    pop('Type what it says', el('h2', {}, '💬 Type it'), shown,
      keyboard({ onKey: (ch) => { if (text.length < 24) { text += ch; show(); } }, onBack: () => { text = text.slice(0, -1); show(); }, extras: [' ', '!', '?'] }),
      el('div', { class: 'row' }, el('button', { class: 'btn primary big', type: 'button', onclick: done }, '✔ Done'),
        el('button', { class: 'btn big', type: 'button', onclick: closePop }, 'Cancel')));
  }
  function eventPop(i) {
    if (locked()) return;
    selectScript(i);
    edited();
    const s = sprite().scripts[i];
    const pick = (ev) => { s.event = ev; closePop(); edited(); };
    pop('Start this script', el('h2', {}, 'Start this script…'),
      el('div', { class: 'row' },
        el('button', { class: `btn big${s.event === 'flag' ? ' primary' : ''}`, type: 'button', 'data-ev': 'flag', onclick: () => pick('flag') }, '🏁 when ▶ is tapped'),
        el('button', { class: `btn big${s.event === 'tap' ? ' primary' : ''}`, type: 'button', 'data-ev': 'tap', onclick: () => pick('tap') }, '👆 when I am tapped')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', 'data-act': 'remove-script', onclick: () => ask('Remove this script?', 'Yes, remove it', () => {
          sprite().scripts.splice(i, 1);
          sel = Math.max(0, Math.min(sel, sprite().scripts.length - 1));
          open = null;
          edited();
        }) }, '🗑️ Remove this script'),
        el('button', { class: 'btn primary', type: 'button', onclick: closePop }, 'Done')));
  }
  function newScript() {
    if (locked()) return;
    sprite().scripts.push({ event: 'flag', blocks: [] });
    sel = sprite().scripts.length - 1;
    open = null;
    edited();
    eventPop(sel);
  }

  /* ----- sprites ----- */
  function spritePop(s) {
    if (locked()) return;
    pop('Sprite', el('h2', {}, `${s.emoji} Change sprite`),
      el('div', { class: 'st-emojis', role: 'group', 'aria-label': 'Sprites' }, SPRITES.map((e) =>
        el('button', { class: `btn tt-num${e === s.emoji ? ' on' : ''}`, type: 'button', 'data-v': e, onclick: () => { s.emoji = e; closePop(); drawAll(); changed(); } }, e))),
      el('div', { class: 'row' },
        project.sprites.length > 1 ? el('button', { class: 'btn', type: 'button', 'data-act': 'remove-sprite', onclick: () => ask(`Remove ${s.emoji}?`, 'Yes, remove it', () => {
          project.sprites = project.sprites.filter((q) => q.id !== s.id);
          rts.delete(s.id);
          selId = project.sprites[0].id; sel = 0; open = null;
          drawAll(); changed();
        }) }, '🗑️ Remove sprite') : null,
        el('button', { class: 'btn primary', type: 'button', onclick: closePop }, 'Done')));
  }
  function addSprite() {
    if (locked()) return;
    if (project.sprites.length >= MAX_SPRITES) { say('Four sprites is the most. Remove one to add another.'); return; }
    pop('Add a sprite', el('h2', {}, '➕ Add a sprite'),
      el('div', { class: 'st-emojis', role: 'group', 'aria-label': 'Sprites' }, SPRITES.map((e) =>
        el('button', { class: 'btn tt-num', type: 'button', 'data-v': e, onclick: () => {
          const n = project.sprites.reduce((k, q) => Math.max(k, parseInt(q.id.slice(1), 10) || 0), 0) + 1;
          const s = newSprite(e, n);
          project.sprites.push(s);
          selId = s.id; sel = 0; open = null;
          closePop(); drawAll(); changed();
        } }, e))));
  }
  function backdropPop() {
    pop('Backdrop', el('h2', {}, '🖼️ Backdrop'),
      el('div', { class: 'st-backdrops', role: 'group', 'aria-label': 'Backdrops' }, BACKDROPS.map((bd) =>
        el('button', { class: `st-bd bd-${bd.id}${bd.id === project.backdrop ? ' on' : ''}`, type: 'button', 'data-v': bd.id,
          onclick: () => { project.backdrop = bd.id; closePop(); stage.className = `st-stage bd-${bd.id}`; changed(); } }, el('span', {}, bd.name)))));
  }

  /* ----- projects ----- */
  function savePop() {
    if (locked()) return;
    let icon = project.icon;
    let name = project.name;
    const shown = el('div', { class: 'typed st-typed' });
    const icons = el('div', { class: 'st-emojis', role: 'group', 'aria-label': 'Project picture' });
    const drawIcons = () => icons.replaceChildren(...PROJECT_ICONS.map((e) =>
      el('button', { class: `btn tt-num${e === icon ? ' on' : ''}`, type: 'button', 'data-v': e, onclick: () => { icon = e; drawIcons(); show(); } }, e)));
    const show = () => { shown.textContent = `${icon} ${nice(name)}`; };
    drawIcons(); show();
    const store = (asNew) => {
      const all = loadProjects();
      const i = !asNew && project.id ? all.findIndex((q) => q.id === project.id) : -1;
      if (i < 0 && all.length >= MAX_PROJECTS) { closePop(); say('Your project shelf is full. Delete one in 📂 first.'); return; }
      const next = { ...project, id: i >= 0 ? project.id : `p${Date.now()}`, icon, name };
      if (i >= 0) all[i] = next; else all.push(next);
      if (!save(PROJECTS_KEY, all)) { closePop(); say('Hmm, there is no room to save on this device.'); return; }
      project = next;
      changed();
      closePop();
      drawTop();
      say(`Saved “${icon} ${nice(name)}”!`);
    };
    pop('Save project', el('h2', {}, '💾 Save your project'), el('p', { class: 'label' }, 'Pick a picture, and type a name if you like.'), icons, shown,
      keyboard({ onKey: (ch) => { if (name.length < 16) { name += ch; show(); } }, onBack: () => { name = name.slice(0, -1); show(); }, extras: [' '] }),
      el('div', { class: 'row' }, kids(
        el('button', { class: 'btn primary big', type: 'button', 'data-act': 'save', onclick: () => store(false) }, project.id ? '💾 Save' : '💾 Save project'),
        project.id ? el('button', { class: 'btn big', type: 'button', 'data-act': 'save-new', onclick: () => store(true) }, '📄 Save as new') : null,
        el('button', { class: 'btn big', type: 'button', onclick: closePop }, 'Cancel'))));
  }
  function openProject(p) {
    stopAll();
    project = p;
    rts.clear();
    selId = project.sprites[0].id; sel = 0; open = null;
    changed();
    workspace();
  }
  function projectsView() {
    stopAll();
    const all = loadProjects();
    root.replaceChildren(el('div', { class: 'rb-pick' },
      el('div', { class: 'rb-top' }, el('button', { class: 'btn', type: 'button', onclick: workspace }, '‹ Back'), el('p', { class: 'prompt' }, '📂 My projects'), el('span')),
      el('div', { class: 'tt-tiles' },
        el('button', { class: 'tt-tile st-new', type: 'button', onclick: () => openProject(newProject()) }, el('span', { class: 'st-icon' }, '➕'), el('span', { class: 'rb-nm' }, 'New project')),
        all.map((p) => el('div', { class: 'rb-mine-wrap tt-gal' },
          el('button', { class: 'tt-tile st-proj', type: 'button', 'data-id': p.id, onclick: () => openProject(JSON.parse(JSON.stringify(p))) },
            el('span', { class: 'st-icon' }, p.icon), el('span', { class: 'rb-nm' }, nice(p.name)), el('span', { class: 'st-cast' }, p.sprites.map((s) => s.emoji).join(' '))),
          el('button', { class: 'rb-del', type: 'button', 'aria-label': `Delete ${nice(p.name)}`, onclick: () => ask(`Delete “${p.icon} ${nice(p.name)}”?`, 'Yes, delete it', () => {
            save(PROJECTS_KEY, loadProjects().filter((q) => q.id !== p.id));
            if (project.id === p.id) { project = { ...project, id: null }; changed(); }
            projectsView();
          }) }, '🗑️'))))));
  }

  /* ----- workspace layout ----- */
  let msg = null;
  const top = el('div', { class: 'st-top' });
  const palette = el('div', { class: 'st-palette' });
  const spriteBar = el('div', { class: 'st-spritebar' });
  const scriptsBox = el('div', { class: 'st-scripts' });
  const flagBtn = el('button', { class: 'btn primary st-flag', type: 'button', 'aria-label': 'Start', onclick: startFlag }, '▶ 🏁');
  const stopBtn = el('button', { class: 'btn st-stop', type: 'button', 'aria-label': 'Stop', onclick: stopAll }, '⏹');
  function sync() {
    const run = busy();
    stopBtn.classList.toggle('on', run);
    root.querySelector('.st-wrap')?.classList.toggle('running', run);
  }
  function drawTop() {
    top.replaceChildren(flagBtn, stopBtn,
      el('button', { class: 'btn', type: 'button', onclick: backdropPop }, '🖼️'),
      el('span', { class: 'st-title' }, `${project.icon} ${nice(project.name)}`),
      el('button', { class: 'btn', type: 'button', 'data-tool': 'save', onclick: savePop }, '💾 Save'),
      el('button', { class: 'btn', type: 'button', 'data-tool': 'projects', onclick: projectsView }, '📂'));
  }
  function drawPalette() {
    const c = CATS.find((q) => q.id === cat);
    const tooDeep = open && open.length >= MAX_DEPTH;
    palette.replaceChildren(
      el('div', { class: 'st-cats', role: 'tablist' }, CATS.map((q) =>
        el('button', { class: `st-cat cat-${q.id}`, type: 'button', role: 'tab', 'aria-selected': String(q.id === cat), 'data-cat': q.id,
          onclick: () => { cat = q.id; drawPalette(); } }, el('span', { class: 'ci' }, q.icon), el('span', { class: 'cw' }, q.name)))),
      el('div', { class: 'tt-keys st-keys' }, c.ops.map(([op, word]) => {
        const o = STUDIO_OPS[op];
        return el('button', { class: `tt-key c-${o.color}`, type: 'button', 'data-op': op, 'aria-label': word, disabled: BOXES.has(op) && tooDeep, onclick: () => add(op) },
          el('span', { class: 'ci' }, o.icon), el('span', { class: 'cw' }, word));
      }),
      open ? el('button', { class: 'tt-key tt-close', type: 'button', 'data-op': 'close', onclick: closeBox }, '✅ Close the box') : null));
  }
  function drawSprites() {
    spriteBar.replaceChildren(...project.sprites.map((s) =>
      el('button', { class: `st-pick${s.id === selId ? ' sel' : ''}`, type: 'button', 'data-id': s.id, 'aria-label': `select ${s.emoji}`,
        onclick: () => { if (s.id === selId) spritePop(s); else { selId = s.id; sel = 0; open = null; drawEditor(); } } }, s.emoji)),
    project.sprites.length < MAX_SPRITES ? el('button', { class: 'st-pick st-add', type: 'button', 'data-act': 'add-sprite', onclick: addSprite }, '➕') : el('span'));
  }
  function drawScripts() {
    const s = sprite();
    strips = s.scripts.map((sc2, i) => {
      const strip = chipStrip({ ops: STUDIO_OPS, onTap: (path, b) => editChip(i, path, b), onMove: (parent, from, to) => moveStep(i, parent, from, to),
        canDrag: () => !busy(), empty: i === sel ? 'Tap blocks to add them here.' : 'Tap here, then tap blocks.' });
      strip.render(sc2.blocks, i === sel ? open : null);
      return strip;
    });
    scriptsBox.replaceChildren(...s.scripts.map((sc2, i) => el('div', { class: `st-script${i === sel ? ' sel' : ''}`, 'data-i': i,
      onclick: (e) => { if (e.target.closest('.code-chip, .st-event') || i === sel) return; if (locked()) return; selectScript(i); edited(); } },
    el('button', { class: 'st-event', type: 'button', 'data-ev': sc2.event, 'aria-label': sc2.event === 'flag' ? 'when ▶ is tapped' : 'when I am tapped', onclick: () => eventPop(i) },
      sc2.event === 'flag' ? '🏁' : '👆'),
    strips[i].el)),
    el('button', { class: 'btn st-newscript', type: 'button', 'data-act': 'new-script', onclick: newScript }, '➕ New script'));
  }
  function drawEditor() {
    drawPalette();
    drawSprites();
    drawScripts();
    for (const s of project.sprites) draw(s);
  }
  function drawAll() { drawStage(); drawEditor(); }
  function edited() { drawPalette(); drawScripts(); changed(); }

  function workspace() {
    closePop();
    msg = el('div', { class: 'msg', 'aria-live': 'polite' }, 'Pick blocks for your sprite, then tap ▶!');
    drawTop();
    drawAll();
    root.replaceChildren(el('div', { class: 'st-wrap' }, top,
      el('div', { class: 'st-main' }, el('div', { class: 'st-left' }, stage, spriteBar), palette),
      scriptsBox, msg));
    sync();
  }

  workspace();
  return () => { gone = true; th.stopAll(); closePop(); sc.dispose(); };
}
