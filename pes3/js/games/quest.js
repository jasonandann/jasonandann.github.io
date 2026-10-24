// Dragon Egg Quest: an Oregon Trail-style journey. Carry a dragon egg from Willow Village to Dragon Mountain
// with Pip the pony: walk the trail, meet events, pick a way at the forks, shop with coins, answer questions
// (spelling, math or both) to get past the troll, light the caves, climb the pass. Nothing is ever lost for
// good: a missed answer costs at most a snack, running out of snacks means a stop to find food, and every
// trip ends with the egg hatching. The story text lives in quest-story.js. The trip is saved as she goes.
import { el, scope, speak, celebrate, textInput } from '../util.js';
import { LEVELS, savedLevel, saveLevel } from '../math.js';
import { problems, ask } from '../challenge.js';
import { START, PACK, FERRY, TRAIL, FORKS, STOPS, EVENTS, FORAGE, CALM, EGG, DRAGON_COLORS, DRAGON_NAMES } from './quest-story.js';

const MODE_KEY = 'spelling-games.quest.mode';
const SAVE_KEY = 'spelling-games.quest.save.v1';
const DRAGONS_KEY = 'spelling-games.quest.dragons.v1';
const MAX_DRAGONS = 24;
const EVENT_CHANCE = 0.55; // a trail step brings an event this often (else a calm step)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
export const loadDragons = () => { const d = readJSON(DRAGONS_KEY, []); return Array.isArray(d) ? d : []; };
function loadSave() {
  const s = readJSON(SAVE_KEY, null);
  return s && s.v === 1 && Number.isInteger(s.i) && s.i >= 0 && s.i < TRAIL.length ? s : null;
}
const dragonColor = (id) => DRAGON_COLORS.find((c) => c.id === id) || DRAGON_COLORS[0];
const dragonFace = (color, cls = '') => el('span', { class: `qt-dragon ${cls}`, style: `filter: hue-rotate(${dragonColor(color).hue}deg)` }, '🐉');

// A shop question for the math level: the coins it costs and the snacks it buys. Small numbers, real sums.
export function storeProblem(level, coins, shop) {
  if (level === 'add') {
    if (coins >= 12 && Math.random() < 0.5) {
      const p = rnd(5, Math.min(coins - 3, 40));
      return { prompt: `A snack pack costs ${p} coins. You give ${shop} all ${coins} of your coins. How many coins do you get back?`, answer: coins - p, unit: 'coins', cost: p, snacks: PACK };
    }
    const a = rnd(4, 19), b = rnd(4, 19);
    return { prompt: `Apples cost ${a} coins. Bread costs ${b} coins. How many coins for both?`, answer: a + b, unit: 'coins', cost: a + b, snacks: PACK };
  }
  if (level === 'div') {
    const pairs = [];
    for (let p = 2; p <= 10; p++) for (let n = 2; n <= 10; n++) if (p * n <= Math.max(coins, 12)) pairs.push([p, n]);
    const [p, n] = pick(pairs);
    return { prompt: `Snacks cost ${p} coins each. How many snacks can you buy with ${p * n} coins?`, answer: n, unit: 'snacks', cost: p * n, snacks: n };
  }
  const p = rnd(2, level === 't5' ? 5 : 10), n = rnd(2, 5);
  return { prompt: `You buy ${n} snacks. Each one costs ${p} coins. How many coins is that?`, answer: n * p, unit: 'coins', cost: n * p, snacks: n };
}

export function mount(root, entries, api) {
  const canSpell = entries.length > 0;
  const settings = { mode: canSpell ? (readJSON(MODE_KEY, 'both') || 'both') : 'math', level: savedLevel() };
  if (!['spelling', 'math', 'both'].includes(settings.mode)) settings.mode = 'both';
  let sc = scope();
  let st = null; // the trip: {v, i, leg, atStop, ways, snacks, coins, color, seen}
  let next = null; // question maker

  const save = () => { if (st) writeJSON(SAVE_KEY, st); };
  const stopAt = (i) => { const t = TRAIL[i]; return t.fork ? (st.ways[t.fork] == null ? null : t.ways[st.ways[t.fork]]) : t; };
  const stopDef = (i) => { const s = stopAt(i); return s && STOPS[s.stop]; };
  const change = (d) => {
    if (!d) return '';
    if (d.snacks) st.snacks = Math.max(0, st.snacks + d.snacks);
    if (d.coins) st.coins = Math.max(0, st.coins + d.coins);
    const bits = [];
    if (d.snacks) bits.push(`${d.snacks > 0 ? '+' : '−'}${Math.abs(d.snacks)} 🍎`);
    if (d.coins) bits.push(`${d.coins > 0 ? '+' : '−'}${Math.abs(d.coins)} 🪙`);
    return bits.join(' ');
  };

  const seg = (label, key, opts, onPick) =>
    el('div', { class: 'seg' },
      el('p', { class: 'label' }, label),
      el('div', { class: 'row' },
        opts.map(([val, text]) =>
          el('button', {
            class: 'btn' + (settings[key] === val ? ' primary' : ''), type: 'button', 'aria-pressed': String(settings[key] === val),
            onclick: () => { settings[key] = val; onPick(val); setup(); },
          }, text),
        ),
      ),
    );

  function setup() {
    sc.dispose();
    sc = scope();
    const saved = loadSave();
    const dragons = loadDragons();
    root.replaceChildren(
      el('div', { class: 'zt-setup qt-setup' },
        el('h2', {}, '🥚 Dragon Egg Quest'),
        el('p', { class: 'prompt' }, 'A dragon egg needs to get home to Dragon Mountain! Ride with Pip the pony, answer questions on the way, and keep your snacks and coins handy.'),
        canSpell ? seg('Questions', 'mode', [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']], (m) => writeJSON(MODE_KEY, m)) : null,
        settings.mode !== 'spelling' ? seg('Math', 'level', LEVELS.map((l) => [l.id, l.name]), saveLevel) : null,
        dragons.length ? el('div', { class: 'seg' }, el('p', { class: 'label' }, 'Dragons you brought home'),
          el('div', { class: 'qt-shelf' }, dragons.map((d) => el('span', { class: 'qt-pet' }, dragonFace(d.color), el('span', {}, d.name))))) : null,
        el('div', { class: 'row' },
          saved ? el('button', { class: 'btn primary big qt-continue', type: 'button', onclick: () => begin(saved) }, '▶ Continue the quest') : null,
          el('button', { class: 'btn big qt-new' + (saved ? '' : ' primary'), type: 'button', onclick: () => begin(null) }, saved ? 'Start over' : 'Start the quest!'),
        ),
      ),
    );
  }

  // ----- the trip screen: map + bag stay, the scene changes -----
  const mapEl = el('div', { class: 'qt-map', 'aria-label': 'Trail map' });
  const bagEl = el('div', { class: 'qt-bag' });
  const sceneEl = el('div', { class: 'qt-scene' });

  function drawMap() {
    const kids = [];
    TRAIL.forEach((t, i) => {
      if (i > 0) {
        const s = stopAt(i);
        const legs = s ? s.legs : 2;
        const walking = i === st.i + 1 && !st.atStop;
        kids.push(el('div', { class: 'qt-legs' }, Array.from({ length: legs }, (_, k) =>
          el('span', { class: 'qt-dot' + (i <= st.i || (walking && k < st.leg) ? ' done' : '') }, walking && k === st.leg - 1 ? '🐴' : ''))));
      }
      const s = stopAt(i);
      const def = s && STOPS[s.stop];
      kids.push(el('div', { class: 'qt-stop' + (i < st.i || (i === st.i && !st.atStop) ? ' done' : '') + (i === st.i ? ' here' : ''), 'data-i': i, title: def ? def.name : '?' },
        def ? def.icon : '❓', i === st.i && (st.atStop || st.leg === 0) ? el('span', { class: 'qt-pony' }, '🐴') : null));
    });
    mapEl.replaceChildren(...kids);
    const frac = st.i / (TRAIL.length - 1);
    const egg = EGG.filter(([f]) => frac >= f).at(-1)[1];
    bagEl.replaceChildren(
      el('span', { class: 'qt-have', 'data-snacks': st.snacks }, `🍎 ${st.snacks}`),
      el('span', { class: 'qt-have', 'data-coins': st.coins }, `🪙 ${st.coins}`),
      el('span', { class: 'qt-egg' + (frac >= 0.4 ? ' wiggle' : '') }, '🥚'), el('span', { class: 'qt-eggnote' }, egg),
    );
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
  // A question inside the current scene. framing = what it does ("light a glowing mushroom").
  function question(act, done, problem) {
    const p = problem || next();
    const prompt = p.prompt || (act ? `${p.kind === 'spell' ? 'Spell the word' : 'Solve it'} to ${act}.` : null);
    actBox().replaceChildren(ask({ problem: p, entries, later: sc.later, onLeave: sc.onLeave, prompt, done }));
  }

  function begin(saved) {
    next = problems(entries, settings.mode, settings.level);
    st = saved || { v: 1, i: 0, leg: 0, atStop: true, ways: {}, snacks: START.snacks, coins: START.coins, color: pick(DRAGON_COLORS).id, seen: [] };
    root.replaceChildren(el('div', { class: 'qt' }, mapEl, bagEl, sceneEl));
    if (!saved) return arrive();
    if (st.atStop) return arrive();
    const def = stopDef(st.i);
    scene({ icon: '🐴', title: 'Back on the trail', lines: [`You are on your way from ${def.name}. Pip is happy to see you!`], body: [go('Keep going ➜', walk)] });
  }

  // Walk on: pick a way at a fork, take a trail step, or arrive at the next stop.
  function walk() {
    const n = st.i + 1;
    if (n >= TRAIL.length) return;
    const t = TRAIL[n];
    if (t.fork && st.ways[t.fork] == null) return fork(t);
    if (st.leg < stopAt(n).legs) return step();
    st.i = n;
    st.leg = 0;
    arrive();
  }

  function fork(t) {
    const f = FORKS[t.fork];
    scene({ icon: f.icon, title: f.name, lines: f.text, body: f.ways.map((w, k) =>
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': k, onclick: () => { st.ways[t.fork] = k; save(); walk(); } }, w)) });
  }

  // One step along the trail: eat a snack, then maybe something happens.
  function step() {
    st.leg++;
    st.snacks = Math.max(0, st.snacks - 1);
    let ev = null;
    if (st.snacks === 0) ev = FORAGE;
    else if (Math.random() < EVENT_CHANCE) {
      let pool = EVENTS.filter((e) => !st.seen.includes(e.id));
      if (!pool.length) { st.seen = []; pool = EVENTS; }
      ev = pick(pool);
      st.seen.push(ev.id);
    }
    save();
    if (!ev) return scene({ icon: '🐴', title: 'On the trail', lines: [pick(CALM)], body: [go('Keep going ➜', walk)] });
    scene({ icon: ev.icon, title: 'On the trail', lines: [ev.text], body: ev.act ? [] : [go('Keep going ➜', walk)] });
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
    if (def.type === 'store') return scene({ ...head, body: [go('🛒 Buy snacks', () => shop(def)), el('button', { class: 'btn big', type: 'button', onclick: leave }, 'No thanks')] });
    if (def.type === 'questions') return scene({ ...head, body: [go('Let’s go! ➜', () => questions(def, 0))] });
    if (def.type === 'river') return river(head);
    if (def.type === 'rest') return scene({ ...head, body: [go('Keep going ➜', () => { change(def.gift); leave(); })] });
    if (def.type === 'finale') return scene({ ...head, icon: el('span', { class: 'qt-egg big wiggle' }, '🥚'), body: [go('🥚 Hatch!', hatch)] });
  }
  // Done with this stop: on to the trail.
  function leave() {
    st.atStop = false;
    save();
    walk();
  }

  function shop(def) {
    const mathQ = settings.mode === 'math' || !canSpell || (settings.mode === 'both' && Math.random() < 0.5);
    const sp = mathQ ? storeProblem(settings.level, st.coins, def.shop) : null;
    const p = sp ? { kind: 'math', prompt: sp.prompt, answer: sp.answer, unit: sp.unit, text: '' } : next('spell');
    const cost = sp ? sp.cost : 5;
    const snacks = sp ? sp.snacks : PACK;
    scene({ icon: '🛒', title: def.name, lines: [sp ? `${def.shop} adds it up with you.` : `${def.shop} is writing a shopping list. Help her spell it!`] });
    question(null, ({ ok }) => {
      const pay = Math.min(cost, st.coins);
      const short = pay < cost;
      const text = (ok ? 'Right! ' : `${def.shop} helps you count it out. `)
        + (short ? `You only have ${st.coins} coins. “That’s plenty for a hero on a quest!” says ${def.shop}.` : `You pay ${cost} coins.`);
      outcome('🛍️', { text, snacks, coins: -pay }, leave);
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

  function river(head) {
    const ways = [
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': 'wade', onclick: () => {
        scene({ icon: '🦶', title: 'Wading across', lines: ['The water is cold! Step carefully.'] });
        question('wade across', ({ ok }) => outcome('🌊', ok ? { text: 'You wade across. Pip shakes off the water!' } : { text: 'Splash! Some snacks got wet.', snacks: -1 }, leave));
      } }, '🦶 Wade across (1 question)'),
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': 'raft', onclick: () => raft(0) }, '🪵 Build a raft (2 questions)'),
      el('button', { class: 'btn big qt-way', type: 'button', 'data-way': 'ferry', disabled: st.coins < FERRY, onclick: () =>
        outcome('⛴️', { text: 'Captain Otter rows you across. “Hold on to that egg!”', coins: -FERRY }, leave) }, `⛴️ Take the ferry (${FERRY} 🪙)`),
    ];
    scene({ ...head, body: ways });
  }
  function raft(k) {
    scene({ icon: '🪵', title: 'Building a raft', lines: [k ? 'One more log!' : 'Tie the logs together.'] });
    question('tie a log on', () => {
      if (k === 0) return outcome('🪵', { text: 'One log tied on!' }, () => raft(1), 'Next ➜');
      outcome('🛶', { text: 'The raft floats you safely across!' }, leave);
    });
  }

  function hatch() {
    const color = dragonColor(st.color);
    const name = textInput({ max: 12, placeholder: pick(DRAGON_NAMES), label: 'Dragon name', capitalize: 'words' });
    const keep = () => {
      const n = name.value.trim() || name.placeholder;
      const list = loadDragons();
      list.push({ name: n, color: color.id, date: new Date().toLocaleDateString('en-CA') });
      writeJSON(DRAGONS_KEY, list.slice(-MAX_DRAGONS));
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      st = null;
      home(n, color);
    };
    scene({ icon: dragonFace(color.id, 'hatched'), title: 'A baby dragon!', lines: [
      `It’s a little ${color.name} dragon! It sneezes a tiny puff of smoke and snuggles up to you.`, 'What will you name it?',
    ], body: [name, el('div', { class: 'row' }, go('That’s its name!', keep, 'qt-name'))] });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') keep(); });
    try { name.focus(); } catch { /* ignore */ }
    celebrate(root);
  }

  function home(n, color) {
    sc.dispose();
    sc = scope();
    root.replaceChildren(
      el('div', { class: 'finish qt-end' },
        el('div', { class: 'big-emoji' }, dragonFace(color.id), '🏡'),
        el('h2', {}, `${n} is home!`),
        el('p', { class: 'prompt' }, `The dragon family cheers! They give you and Pip a ride home on their backs. ${n} will visit you soon.`),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big', type: 'button', onclick: setup }, 'Another quest'),
          el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
        ),
      ),
    );
    celebrate(root);
  }

  setup();
  return () => { sc.dispose(); };
}
