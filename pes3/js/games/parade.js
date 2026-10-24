// Monster Parade (issue #67): help monsters get ready for a big parade. Each monster needs something extra
// (wings, a tail, fur), something to wear, something to hold and a way to ride; every right answer lets her pick the next one from three choices (each
// shown on the monster). A miss just means another question. When all the monsters are ready, the parade rolls by.
// All the drawing lives in parade/art.js; this file is the flow. One player (Jason, 2026-10-24).
import { el, scope, celebrate, textInput } from '../util.js';
import { LEVELS, savedLevel, saveLevel } from '../math.js';
import { problems, ask } from '../challenge.js';
import { choice, openOptions, optionsButton } from '../options.js';
import { SLOTS, ITEMS, SLOT_NAMES, randomMonster, scene } from './parade/art.js';

const OPTS_KEY = 'spelling-games.parade.options';
const FAST_KEY = 'spelling-games.parade.fast'; // '1' = short pauses (tests)
export const COUNTS = [3, 4, 5, 6, 7];
const MODES = [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']];
const DEFAULTS = { mode: 'both', count: 4, second: true };
const CHOICES = 3;
export const NAMES = ['Wobble', 'Ziggy', 'Pickle', 'Noodle', 'Bloop', 'Fizz', 'Gumbo', 'Twinkle', 'Mopsy', 'Bubbles',
  'Sprocket', 'Doodle', 'Pip', 'Wiggles', 'Muffin', 'Zuzu', 'Sparkle', 'Bonkers'];

function loadOptions(canSpell) {
  let o = { ...DEFAULTS };
  try { o = { ...o, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') }; } catch { /* ignore */ }
  if (!MODES.some(([m]) => m === o.mode)) o.mode = DEFAULTS.mode;
  if (!canSpell) o.mode = 'math';
  if (!COUNTS.includes(o.count)) o.count = DEFAULTS.count;
  o.second = o.second !== false;
  return o;
}
function saveOptions(o) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify({ mode: o.mode, count: o.count, second: o.second })); } catch { /* ignore */ }
}
const fast = () => { try { return localStorage.getItem(FAST_KEY) === '1'; } catch { return false; } };
const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pickN = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const art = (svg, cls) => { const d = el('div', { class: cls }); d.innerHTML = svg; return d; }; // svg = art.js output only

export function mount(root, entries, api) {
  const canSpell = entries.length > 0;
  const settings = { ...loadOptions(canSpell), level: savedLevel() };
  let sc = scope();
  let pop = null;
  const ms = (n) => (fast() ? Math.round(n / 8) : n);
  const hooks = {};
  root.__parade = hooks;

  const summary = () => [
    canSpell ? MODES.find(([m]) => m === settings.mode)[1] : null,
    settings.mode !== 'spelling' ? LEVELS.find((l) => l.id === settings.level).name : null,
    `${settings.count} monsters`,
    `second chance ${settings.second ? 'on' : 'off'}`,
  ].filter(Boolean).join(' · ');

  function openMore() {
    pop = openOptions({
      onClose: setup,
      body: (redraw) => {
        const set = (key, after) => (v) => { settings[key] = v; if (after) after(v); saveOptions(settings); redraw(); };
        return [
          canSpell ? choice('Questions', settings.mode, MODES, set('mode')) : null,
          settings.mode !== 'spelling' ? choice('Math', settings.level, LEVELS.map((l) => [l.id, l.name]), set('level', saveLevel)) : null,
          choice('Monsters in the parade', settings.count, COUNTS.map((n) => [n, String(n)]), set('count')),
          choice('Second chance (try once more)', settings.second, [[true, 'On'], [false, 'Off']], set('second')),
        ];
      },
    });
  }

  function setup() {
    sc.dispose();
    sc = scope();
    root.replaceChildren(
      el('div', { class: 'zt-setup pd-setup' },
        el('h2', {}, '🎈 Monster Parade'),
        el('p', { class: 'prompt' }, 'The monsters are getting ready for the big parade! Answer questions to help them pick something extra, something to wear, something to hold and a way to ride.'),
        optionsButton({ summary: summary(), onOpen: openMore }),
        el('button', { class: 'btn primary big pd-start', type: 'button', onclick: start }, 'Start!'),
      ),
    );
  }

  function start() {
    sc.dispose();
    sc = scope();
    const next = problems(entries, settings.mode, settings.level);
    const ready = []; // [{monster, items, name}]
    const used = Object.fromEntries(SLOTS.map((k) => [k, new Set()])); // items already used in this parade, per slot
    let cur = null; // {monster, items, name}
    let slotIx = 0;

    const line = el('div', { class: 'pd-line', 'aria-label': 'Ready for the parade' });
    const stage = el('div', { class: 'pd-stage' });
    const panel = el('div', { class: 'pd-panel' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const say = (t) => { msg.textContent = t; };
    root.replaceChildren(el('div', { class: 'pd' }, line, el('div', { class: 'pd-main' }, stage, panel)));
    hooks.state = () => ({
      ready: ready.map((r) => ({ name: r.name, items: { ...r.items } })),
      current: cur && { name: cur.name, items: { ...cur.items }, monster: { ...cur.monster } },
      slot: cur ? SLOTS[slotIx] || null : null, count: settings.count, mode: settings.mode,
    });

    const draw = () => { stage.innerHTML = cur ? scene(cur.monster, cur.items) : ''; };
    const drawLine = () => line.replaceChildren(...Array.from({ length: settings.count }, (_, i) => {
      const r = ready[i];
      return r ? el('div', { class: 'pd-spot done' }, art(scene(r.monster, r.items), 'pd-mini'), el('span', { class: 'pd-name' }, r.name))
        : el('div', { class: 'pd-spot' + (i === ready.length ? ' now' : '') }, el('span', { class: 'pd-empty' }, i === ready.length ? '⭐' : '?'));
    }));

    function newMonster() {
      cur = { monster: randomMonster(), items: {}, name: '' };
      slotIx = 0;
      draw();
      drawLine();
      const sample = NAMES[Math.floor(Math.random() * NAMES.length)];
      const box = textInput({ max: 12, placeholder: sample, label: 'Monster name', capitalize: 'words' });
      const go = (name) => { cur.name = (name || '').trim() || sample; slotIx = 0; intro(); };
      say('');
      panel.replaceChildren(
        el('p', { class: 'prompt' }, ready.length ? 'Here comes another monster!' : 'A monster is here for the parade!'),
        el('p', { class: 'pd-hint' }, 'Give it a name, or skip.'),
        box,
        el('div', { class: 'row' },
          el('button', { class: 'btn primary big pd-named', type: 'button', onclick: () => go(box.value) }, 'That’s its name!'),
          el('button', { class: 'btn big pd-skip', type: 'button', onclick: () => go('') }, 'Skip')),
      );
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(box.value); });
    }

    // Before each question: a tap, so a spelling word can be spoken (iOS).
    function intro(line1) {
      const slot = SLOTS[slotIx];
      draw();
      say(line1 || '');
      panel.replaceChildren(
        el('p', { class: 'prompt pd-need' }, `${cur.name} needs ${SLOT_NAMES[slot]}.`),
        msg,
        el('button', { class: 'btn primary big pd-go', type: 'button', onclick: question }, '▶ Next question'),
      );
    }

    function question() {
      const p = next();
      say('');
      panel.replaceChildren(ask({
        problem: p, entries, later: sc.later, onLeave: sc.onLeave, second: settings.second,
        done: ({ ok }) => (ok ? choose() : intro('Let’s try another question!')),
      }));
    }

    function choose() {
      const slot = SLOTS[slotIx];
      const all = ITEMS[slot];
      const fresh = all.filter((it) => !used[slot].has(it.id));
      const opts = pickN(fresh.length >= CHOICES ? fresh : all, CHOICES);
      panel.replaceChildren(
        el('p', { class: 'prompt' }, `Pick ${SLOT_NAMES[slot]} for ${cur.name}!`),
        el('div', { class: 'pd-choices' }, opts.map((it) =>
          el('button', { class: 'btn pd-choice', type: 'button', 'data-id': it.id, onclick: () => apply(slot, it) },
            art(scene(cur.monster, { ...cur.items, [slot]: it.id }), 'pd-preview'),
            el('span', { class: 'pd-label' }, it.name)))),
      );
    }

    function apply(slot, it) {
      cur.items[slot] = it.id;
      used[slot].add(it.id);
      draw();
      stage.classList.remove('pop');
      void stage.offsetWidth;
      stage.classList.add('pop');
      slotIx++;
      if (slotIx < SLOTS.length) return intro(`${cur.name} loves the ${it.name}!`);
      ready.push(cur);
      drawLine();
      say('');
      const last = ready.length >= settings.count;
      panel.replaceChildren(
        el('p', { class: 'prompt' }, `${cur.name} is ready for the parade! 🎉`),
        el('button', { class: 'btn primary big pd-next', type: 'button', onclick: last ? finale : newMonster },
          last ? '🎺 Start the parade!' : '➜ Next monster'),
      );
      if (!last) celebrate(root);
    }

    function finale() {
      cur = null;
      sc.dispose();
      sc = scope();
      // Left to right, the first monster ready leads: it is rightmost in the row, so it appears first.
      const moving = !still();
      const marchers = [...ready].reverse().map((r) => el('div', { class: 'pd-marcher' },
        art(scene(r.monster, r.items, { moving }), 'pd-big'), el('span', { class: 'pd-name' }, r.name)));
      const road = el('div', { class: 'pd-road' }, el('div', { class: 'pd-row' }, marchers));
      root.replaceChildren(
        el('div', { class: 'pd-parade' },
          el('h2', {}, '🎉 Hooray! The parade is here!'),
          el('div', { class: 'pd-crowd', 'aria-hidden': 'true' }, '🙋 👏 🧒 🎈 👧 👏 🙌 🧑 🎈 👦 👏 🙋'),
          road,
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big pd-again', type: 'button', onclick: start }, 'New parade'),
            el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'))),
      );
      celebrate(root);
      const row = road.firstChild;
      if (still() || !row.animate) { road.classList.add('still'); return; }
      // Roll in from off the left edge and out past the right edge, again and again.
      const go = () => {
        const w = road.clientWidth;
        const anim = row.animate([{ transform: `translateX(-${row.scrollWidth}px)` }, { transform: `translateX(${w}px)` }],
          { duration: ms(4000 + 2500 * ready.length), iterations: Infinity, easing: 'linear' });
        sc.onLeave(() => anim.cancel());
      };
      requestAnimationFrame(go);
    }

    newMonster();
  }

  setup();
  return () => { sc.dispose(); if (pop) pop.dispose(); delete root.__parade; };
}
