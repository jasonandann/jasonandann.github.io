// Study Quest: Oregon Trail-style journeys. Pick a story (js/games/quests/), then walk its trail: meet events,
// pick a way at the forks, shop, answer questions (spelling, math or both) at the stops, and reach the finale,
// where she names what she found (or just collects it). Nothing is ever lost for good: a missed answer costs at
// most one food, running out of food means a stop to find more, shops never refuse, and every trip ends well.
// All story words live in the story files; this file is the engine. Each story's trip is saved as she goes.
import { el, scope, speak, celebrate, textInput, addSpecialPlant } from '../util.js';
import { LEVELS, savedLevel, saveLevel, levelChoice } from '../math.js';
import { choice, openOptions, optionsButton } from '../options.js';
import { problems, ask } from '../challenge.js';
import { STORIES } from './quests/index.js';

const MODE_KEY = 'spelling-games.quest.mode';
const saveKey = (id) => `spelling-games.quest.${id}.save.v2`;
const foundKey = (id) => `spelling-games.quest.${id}.found.v1`;
const MAX_FOUND = 24;
const EVENT_CHANCE = 0.55; // a trail step brings an event this often (else a calm step)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const drop = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
export const loadFound = (id) => { const d = readJSON(foundKey(id), []); return Array.isArray(d) ? d : []; };
export function loadSave(story) {
  const s = readJSON(saveKey(story.id), null);
  if (!s || s.v !== 2 || !Number.isInteger(s.i) || s.i < 0 || s.i >= story.trail.length) return null;
  if (story.order === 'shuffle' && !(Array.isArray(s.order) && s.order.length === story.trail.length)) return null;
  return s;
}

// The first version (Dragon Egg Quest only) kept its trip and dragons under other names: move them once.
export function migrate() {
  const old = readJSON('spelling-games.quest.save.v1', null);
  if (old && old.v === 1 && readJSON(saveKey('dragon'), null) == null) {
    writeJSON(saveKey('dragon'), { v: 2, i: old.i, leg: old.leg, atStop: old.atStop, ways: old.ways || {}, food: old.snacks, money: old.coins,
      token: 0, kind: old.color, seen: old.seen || [], order: null });
  }
  drop('spelling-games.quest.save.v1');
  const dragons = readJSON('spelling-games.quest.dragons.v1', null);
  if (Array.isArray(dragons)) {
    writeJSON(foundKey('dragon'), [...loadFound('dragon'), ...dragons.map((d) => ({ name: d.name, kind: d.color, date: d.date }))].slice(-MAX_FOUND));
    drop('spelling-games.quest.dragons.v1');
  }
}

const kindOf = (story, id) => (story.collect.kinds || []).find((k) => k.id === id) || (story.collect.kinds || [])[0] || { id: '', name: '' };
// The thing she found, drawn as its emoji (tinted when the kind has a hue).
function foundFace(story, kindId, cls = '') {
  const k = kindOf(story, kindId);
  return el('span', { class: `qt-found ${cls}`.trim(), style: k.hue ? `filter: hue-rotate(${k.hue}deg)` : null }, k.icon || story.collect.icon);
}

// A shop question for the math level, in the story's words: what it costs and how much food it buys.
export function storeProblem(story, level, coins, shop) {
  const m = story.money.name, f = story.food.name, pack = story.food.pack;
  if (level === 'add') {
    if (coins >= 12 && Math.random() < 0.5) {
      const p = rnd(5, Math.min(coins - 3, 40));
      return { prompt: `${cap(pack)} costs ${p} ${m}. You give ${shop} all ${coins} of your ${m}. How many ${m} do you get back?`, answer: coins - p, unit: m, cost: p, food: story.food.packSize };
    }
    const [x, y] = story.shop.items;
    const a = rnd(4, 19), b = rnd(4, 19);
    return { prompt: `${cap(x)} costs ${a} ${m}. ${cap(y)} costs ${b} ${m}. How many ${m} for both?`, answer: a + b, unit: m, cost: a + b, food: story.food.packSize };
  }
  if (level === 'div') {
    const pairs = [];
    for (let p = 2; p <= 10; p++) for (let n = 2; n <= 10; n++) if (p * n <= Math.max(coins, 12)) pairs.push([p, n]);
    const [p, n] = pick(pairs);
    return { prompt: `${cap(f)} cost ${p} ${m} each. How many ${f} can you buy with ${p * n} ${m}?`, answer: n, unit: f, cost: p * n, food: n };
  }
  const p = rnd(2, level === 't5' ? 5 : 10), n = rnd(2, 5);
  return { prompt: `You buy ${n} ${f}. Each one costs ${p} ${m}. How many ${m} is that?`, answer: n * p, unit: m, cost: n * p, food: n };
}

// Trail positions (after shuffling) -> trail entries. Time Machine-style stories shuffle all but the first and last.
export function newOrder(story) {
  const n = story.trail.length;
  if (story.order !== 'shuffle') return null;
  const mid = Array.from({ length: n - 2 }, (_, k) => k + 1);
  for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
  return [0, ...mid, n - 1];
}

export function mount(root, entries, api) {
  migrate();
  const canSpell = entries.length > 0;
  const settings = { mode: canSpell ? (readJSON(MODE_KEY, 'both') || 'both') : 'math', level: savedLevel() };
  if (!['spelling', 'math', 'both'].includes(settings.mode)) settings.mode = 'both';
  let sc = scope();
  let pop = null; // open options pop-up
  let story = null;
  let st = null; // the trip: {v:2, i, leg, atStop, ways, food, money, token, kind, seen, order}
  let next = null; // question maker

  const save = () => { if (st) writeJSON(saveKey(story.id), st); };
  const entryAt = (i) => story.trail[st.order ? st.order[i] : i];
  const stopAt = (i) => { const t = entryAt(i); return t.fork ? (st.ways[t.fork] == null ? null : t.ways[st.ways[t.fork]]) : t; };
  const stopDef = (i) => { const s = stopAt(i); return s && story.stops[s.stop]; };
  const tokens = () => story.trail.filter((t) => (t.fork ? t.ways.some((w) => story.stops[w.stop].prize) : story.stops[t.stop].prize)).length;
  const change = (d) => {
    if (!d) return '';
    const bits = [];
    for (const [key, res] of [['food', story.food], ['money', story.money], ['token', story.token]]) {
      if (!d[key] || !res) continue;
      st[key] = Math.max(0, (st[key] || 0) + d[key]);
      bits.push(`${d[key] > 0 ? '+' : '−'}${Math.abs(d[key])} ${res.icon}`);
    }
    return bits.join(' ');
  };

  // Questions + math level are grown-up options behind ⚙️ (Jason 2026-10-24), shown as a one-line summary.
  const MODES = [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']];
  const summary = () => [canSpell ? MODES.find(([m]) => m === settings.mode)[1] : null,
    settings.mode !== 'spelling' ? LEVELS.find((l) => l.id === settings.level).name : null].filter(Boolean).join(' · ');
  const questionOptions = (redraw) => optionsButton({
    summary: summary(),
    onOpen: () => {
      pop = openOptions({
        onClose: redraw,
        body: (again) => [
          canSpell ? choice('Questions', settings.mode, MODES, (m) => { settings.mode = m; writeJSON(MODE_KEY, m); again(); }) : null,
          settings.mode !== 'spelling' ? levelChoice(settings.level, (v) => { settings.level = v; saveLevel(v); again(); }) : null,
        ],
      });
    },
  });

  // ----- picking a story -----
  function setup() {
    sc.dispose();
    sc = scope();
    root.replaceChildren(
      el('div', { class: 'zt-setup qt-setup' },
        el('h2', {}, '🗺️ Study Quest'),
        el('p', { class: 'prompt' }, 'Pick an adventure! Answer questions along the way to help.'),
        questionOptions(setup),
        el('div', { class: 'qt-picks' }, STORIES.map((s) => {
          const found = loadFound(s.id).length;
          return el('button', { class: 'qt-pick', type: 'button', 'data-story': s.id, onclick: () => storyScreen(s) },
            el('span', { class: 'qt-pick-icon' }, s.icon),
            el('span', { class: 'qt-pick-name' }, s.name),
            el('span', { class: 'qt-pick-blurb' }, s.tagline),
            loadSave(s) ? el('span', { class: 'qt-badge' }, '▶ On the way') : found ? el('span', { class: 'qt-badge done' }, `${s.collect.icon} × ${found}`) : null,
          );
        })),
      ),
    );
  }

  function storyScreen(s) {
    sc.dispose();
    sc = scope();
    story = s;
    const saved = loadSave(s);
    const found = loadFound(s.id);
    const redraw = () => storyScreen(s);
    root.replaceChildren(
      el('div', { class: 'zt-setup qt-setup', 'data-story': s.id },
        el('h2', {}, `${s.icon} ${s.name}`),
        el('p', { class: 'prompt' }, s.blurb),
        questionOptions(redraw),
        found.length ? el('div', { class: 'seg' }, el('p', { class: 'label' }, s.collect.label),
          el('div', { class: 'qt-shelf' }, found.map((d) => el('span', { class: 'qt-pet' }, foundFace(s, d.kind), el('span', {}, d.name))))) : null,
        el('div', { class: 'row' },
          saved ? el('button', { class: 'btn primary big qt-continue', type: 'button', onclick: () => begin(saved) }, '▶ Continue the quest') : null,
          el('button', { class: 'btn big qt-new' + (saved ? '' : ' primary'), type: 'button', onclick: () => begin(null) }, saved ? 'Start over' : 'Start the quest!'),
        ),
        el('button', { class: 'btn qt-all', type: 'button', onclick: setup }, '‹ All quests'),
      ),
    );
  }

  // ----- the trip screen: map + bag stay, the scene changes -----
  const mapEl = el('div', { class: 'qt-map', 'aria-label': 'Trail map' });
  const bagEl = el('div', { class: 'qt-bag' });
  const sceneEl = el('div', { class: 'qt-scene' });

  function drawMap() {
    const hero = story.hero.icon;
    const kids = [];
    story.trail.forEach((_, i) => {
      if (i > 0) {
        const s = stopAt(i);
        const legs = s ? s.legs : 2;
        const walking = i === st.i + 1 && !st.atStop;
        kids.push(el('div', { class: 'qt-legs' }, Array.from({ length: legs }, (_, k) =>
          el('span', { class: 'qt-dot' + (i <= st.i || (walking && k < st.leg) ? ' done' : '') }, walking && k === st.leg - 1 ? hero : ''))));
      }
      const def = stopDef(i);
      const known = def && (story.order !== 'shuffle' || i <= st.i); // shuffled stories keep the next stops a surprise
      kids.push(el('div', { class: 'qt-stop' + (i < st.i || (i === st.i && !st.atStop) ? ' done' : '') + (i === st.i ? ' here' : ''), 'data-i': i, title: known ? def.name : '?' },
        known ? def.icon : '❓', i === st.i && (st.atStop || st.leg === 0) ? el('span', { class: 'qt-pony' }, hero) : null));
    });
    mapEl.replaceChildren(...kids);
    const frac = st.i / (story.trail.length - 1);
    const note = story.cargo.notes.filter(([f]) => frac >= f).at(-1)[1];
    bagEl.replaceChildren(...[
      el('span', { class: 'qt-have', 'data-food': st.food }, `${story.food.icon} ${st.food}`),
      el('span', { class: 'qt-have', 'data-money': st.money }, `${story.money.icon} ${st.money}`),
      story.token ? el('span', { class: 'qt-have', 'data-token': st.token }, `${story.token.icon} ${st.token}/${tokens()}`) : null,
      el('span', { class: 'qt-egg' + (story.cargo.wiggle != null && frac >= story.cargo.wiggle ? ' wiggle' : '') }, story.cargo.icon),
      el('span', { class: 'qt-eggnote' }, note),
    ].filter(Boolean));
  }

  // One scene: art, title, story lines (🔊 reads them aloud), then whatever comes next.
  function scene({ icon, title, lines = [], body = [] }) {
    sc.dispose();
    sc = scope();
    drawMap();
    const text = lines.filter(Boolean);
    sceneEl.replaceChildren(...[
      el('div', { class: 'qt-art' }, icon),
      title ? el('h2', { class: 'qt-title' }, title) : null,
      ...text.map((t) => el('p', { class: 'qt-text' }, t)),
      text.length ? el('button', { class: 'btn speaker qt-read', type: 'button', onclick: () => speak(text.join(' ')) }, '🔊 Read to me') : null,
      el('div', { class: 'qt-act' }, body),
    ].filter(Boolean)); // replaceChildren prints null and arrays as text
  }
  const go = (label, fn, cls = '') => el('button', { class: `btn primary big ${cls}`.trim(), type: 'button', onclick: fn }, label);
  const actBox = () => sceneEl.querySelector('.qt-act');
  // A question inside the current scene. act = what it does ("light a glowing mushroom"). Stories with
  // `blanks` show a spelling word's list sentence with the word missing (a torn page) when it has one.
  function question(act, done, problem) {
    const p = problem || next();
    let prompt = p.prompt || (act ? `${p.kind === 'spell' ? 'Spell the word' : 'Solve it'} to ${act}.` : null);
    if (story.blanks && p.kind === 'spell' && p.entry.sentence) {
      const safe = p.entry.word.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
      const re = new RegExp('\\b' + safe + '\\b', 'i');
      if (re.test(p.entry.sentence)) prompt = `A word is missing: “${p.entry.sentence.replace(re, '_____')}” Spell it to ${act || 'fix the page'}.`;
    }
    actBox().replaceChildren(ask({ problem: p, entries, later: sc.later, onLeave: sc.onLeave, prompt, done }));
  }

  function begin(saved) {
    next = problems(entries, settings.mode, settings.level);
    const kinds = story.collect.kinds || [];
    st = saved || { v: 2, i: 0, leg: 0, atStop: true, ways: {}, food: story.food.start, money: story.money.start, token: 0,
      kind: kinds.length ? pick(kinds).id : '', seen: [], order: newOrder(story) };
    root.replaceChildren(el('div', { class: 'qt', 'data-story': story.id }, mapEl, bagEl, sceneEl));
    if (!saved || st.atStop) return arrive();
    scene({ icon: story.hero.icon, title: story.backTitle, lines: [fill(story.back, { from: stopDef(st.i).name })], body: [go('Keep going ➜', walk)] });
  }

  // Walk on: pick a way at a fork, take a step, or arrive at the next stop.
  function walk() {
    const n = st.i + 1;
    if (n >= story.trail.length) return;
    const t = entryAt(n);
    if (t.fork && st.ways[t.fork] == null) return fork(t);
    if (st.leg < stopAt(n).legs) return step();
    st.i = n;
    st.leg = 0;
    arrive();
  }

  function fork(t) {
    const f = story.forks[t.fork];
    scene({ icon: f.icon, title: f.name, lines: f.text, body: f.ways.map((w, k) =>
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': k, onclick: () => { st.ways[t.fork] = k; save(); walk(); } }, w)) });
  }

  // One step on the way: eat one food, then maybe something happens.
  function step() {
    st.leg++;
    st.food = Math.max(0, st.food - 1);
    let ev = null;
    if (st.food === 0) ev = story.forage;
    else if (Math.random() < EVENT_CHANCE) {
      let pool = story.events.filter((e) => !st.seen.includes(e.id));
      if (!pool.length) { st.seen = []; pool = story.events; }
      ev = pick(pool);
      st.seen.push(ev.id);
    }
    save();
    if (!ev) return scene({ icon: story.hero.icon, title: story.onTheWay, lines: [pick(story.calm)], body: [go('Keep going ➜', walk)] });
    scene({ icon: ev.icon, title: story.onTheWay, lines: [ev.text], body: ev.act ? [] : [go('Keep going ➜', walk)] });
    if (ev.act) question(ev.act, ({ ok }) => outcome(ev.icon, ok ? ev.good : ev.meh, walk));
  }

  function outcome(icon, res, then, label = 'Keep going ➜') {
    const delta = change(res);
    save();
    scene({ icon, lines: [res.text, delta], body: [go(label, then)] });
  }

  function arrive() {
    st.atStop = true;
    save();
    const def = stopDef(st.i);
    const head = { icon: def.icon, title: def.name, lines: def.text };
    if (def.type === 'store') return scene({ ...head, body: [go(story.shop.button, () => shop(def)), el('button', { class: 'btn big', type: 'button', onclick: leave }, 'No thanks')] });
    if (def.type === 'questions') return scene({ ...head, body: [go('Let’s go! ➜', () => questions(def, 0))] });
    if (def.type === 'crossing') return scene({ ...head, body: def.ways.map((w) =>
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': w.id, disabled: w.cost ? st.money < w.cost : null, onclick: () => cross(w, 0, true) }, w.label)) });
    if (def.type === 'rest') return scene({ ...head, body: [go('Keep going ➜', () => { change(def.gift); leave(); })] });
    if (def.type === 'finale') {
      const f = story.finale;
      return scene({ ...head, icon: el('span', { class: 'qt-egg big' + (story.cargo.wiggle != null ? ' wiggle' : '') }, story.cargo.icon), body: [go(f.button, reveal, 'qt-finale')] });
    }
  }
  // Done with this stop (its prize, if any, is given here, so a stop replayed after a reload pays once): on to the trail.
  function leave() {
    const def = stopDef(st.i);
    if (def.prize) change(def.prize);
    st.atStop = false;
    save();
    walk();
  }

  function shop(def) {
    const mathQ = settings.mode === 'math' || !canSpell || (settings.mode === 'both' && Math.random() < 0.5);
    const sp = mathQ ? storeProblem(story, settings.level, st.money, def.shop) : null;
    const p = sp ? { kind: 'math', prompt: sp.prompt, answer: sp.answer, unit: sp.unit, text: '' } : next('spell');
    const cost = sp ? sp.cost : 5;
    const food = sp ? sp.food : story.food.packSize;
    const m = story.money.name;
    scene({ icon: '🛒', title: def.name, lines: [sp ? `${def.shop} adds it up with you.` : (def.spell || `${def.shop} is writing a list. Help spell it!`)] });
    question(null, ({ ok }) => {
      const pay = Math.min(cost, st.money);
      const text = (ok ? 'Right! ' : `${def.shop} helps you count it out. `)
        + (pay < cost ? `You only have ${st.money} ${m}. “That’s plenty for a hero on a quest!” says ${def.shop}.` : `You pay ${cost} ${m}.`);
      outcome('🛍️', { text, food, money: -pay }, leave);
    }, p);
  }

  function questions(def, k) {
    question(def.act, ({ ok }) => {
      const last = k + 1 >= def.count;
      const res = ok ? { text: def.right, ...def.reward } : { text: 'Good try! Let’s keep going.' };
      if (!last) return outcome(def.icon, res, () => questions(def, k + 1), 'Next ➜');
      outcome(def.icon, { ...res, text: `${res.text} ${def.end}` }, leave);
    });
  }

  // A crossing: each way is free (cost, no questions) or takes `count` questions; `meh` (if any) when one was missed.
  function cross(w, k, allOk) {
    if (!w.count) return outcome(w.icon, { ...w.good, money: (w.good.money || 0) - (w.cost || 0) }, leave);
    scene({ icon: w.icon, title: w.title, lines: k ? [w.again] : w.lines });
    question(w.act, ({ ok }) => {
      const all = allOk && ok;
      if (k + 1 < w.count) return outcome(w.icon, { text: w.step }, () => cross(w, k + 1, all), 'Next ➜');
      outcome(w.icon, all || !w.meh ? w.good : w.meh, leave);
    });
  }

  function reveal() {
    const f = story.finale;
    const kind = kindOf(story, st.kind);
    const vars = { kind: kind.name };
    const name = f.ask ? textInput({ max: 14, placeholder: pick(f.ask.names), label: f.ask.label, capitalize: 'words' }) : null;
    const keep = () => {
      const n = name ? name.value.trim() || name.placeholder : fill(story.collect.itemName, vars);
      const list = loadFound(story.id);
      list.push({ name: n, kind: kind.id, date: new Date().toLocaleDateString('en-CA') });
      writeJSON(foundKey(story.id), list.slice(-MAX_FOUND));
      if (story.collect.garden) addSpecialPlant({ icon: kind.icon || story.collect.icon, name: n });
      drop(saveKey(story.id));
      st = null;
      end(n, kind);
    };
    scene({ icon: foundFace(story, kind.id, 'hatched'), title: fill(f.title, vars), lines: f.lines.map((l) => fill(l, vars)),
      body: name ? [name, el('div', { class: 'row' }, go(f.keep, keep, 'qt-name'))] : [go(f.keep, keep, 'qt-name')] });
    if (name) {
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') keep(); });
      try { name.focus(); } catch { /* ignore */ }
    }
    celebrate(root);
  }

  function end(n, kind) {
    sc.dispose();
    sc = scope();
    const f = story.finale;
    const vars = { name: n, kind: kind.name };
    const s = story;
    root.replaceChildren(
      el('div', { class: 'finish qt-end' },
        el('div', { class: 'big-emoji' }, foundFace(s, kind.id), f.endIcon),
        el('h2', {}, fill(f.endTitle, vars)),
        el('p', { class: 'prompt' }, fill(f.endText, vars)),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big', type: 'button', onclick: () => storyScreen(s) }, 'Go again'),
          el('button', { class: 'btn big', type: 'button', onclick: setup }, 'Another quest'),
          el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
        ),
      ),
    );
    celebrate(root);
  }

  setup();
  return () => { sc.dispose(); if (pop) pop.dispose(); };
}
