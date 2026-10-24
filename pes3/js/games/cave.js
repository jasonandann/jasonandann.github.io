// Crystal Cave (working title; issue #61): a dungeon crawl inspired by the board game The Quest Kids
// (mechanics only; names and art are our own). 2-4 heroes explore a cave of face-down tiles. Ability tiles
// give cards, but each card is earned by answering a question: Power = math, Wisdom = spelling, Magic = either.
// Bad guys are scared away by spending cards (friends can give cards and earn a Kind Badge to use later; a "brave try"
// answers harder questions for the missing ones). Gems are bought with cards. Stars win.
// One person (with or without computer heroes) = one team against the cave; two or more people = most stars.
// Rules live in cave/rules.js (plain JSON state, saved as it goes), computer heroes in cave/bot.js.
import { el, scope, celebrate, textInput, cheer, opKind } from '../util.js';
import { LEVELS as MATH_LEVELS, savedLevel } from '../math.js';
import { loadDictionary } from '../dictionary.js';
import { ask } from '../challenge.js';
import { questioner, SPELL_SOURCES } from '../questions.js';
import { spellingSlip, mathSlip } from '../mistakes.js';
import { skillOf, noteResult } from './battle-bot.js';
import * as R from './cave/rules.js';
import * as B from './cave/bot.js';
import { heroSvg, monsterSvg, gemSvg, cardSvg, heartSvg, starSvg, CARD } from './cave/art.js';

const OPTS_KEY = 'spelling-games.cave.options';
const SAVE_KEY = 'spelling-games.cave.save.v1';
const FAST_KEY = 'spelling-games.cave.fast'; // '1' = short pauses (tests)
const SEAT_TYPES = ['off', 'person', 'bot'];
const LENGTHS = ['short', 'medium', 'long'];
const DEFAULTS = {
  seats: [
    { type: 'me', hero: 'elf', name: '', spell: 'list', math: null },
    { type: 'bot', hero: 'viking', name: '', spell: 'list', math: null },
    { type: 'off', hero: 'knight', name: '', spell: 'starter', math: null },
    { type: 'off', hero: 'wizard', name: '', spell: 'starter', math: null },
  ],
  bot: 'right', length: 'short', second: true,
};

const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const drop = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
const fast = () => { try { return localStorage.getItem(FAST_KEY) === '1'; } catch { return false; } };
const html = (cls, svg) => { const s = el('span', { class: cls }); s.innerHTML = svg; return s; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function loadOptions(canSpell) {
  const o = { ...DEFAULTS, ...readJSON(OPTS_KEY, {}) };
  const seats = Array.isArray(o.seats) && o.seats.length === 4 ? o.seats : DEFAULTS.seats;
  o.seats = seats.map((s, i) => {
    const d = DEFAULTS.seats[i];
    const seat = { ...d, ...(s && typeof s === 'object' ? s : {}) };
    seat.type = i === 0 ? 'me' : SEAT_TYPES.includes(seat.type) ? seat.type : d.type;
    if (!R.HEROES.some((h) => h.id === seat.hero)) seat.hero = d.hero;
    if (!SPELL_SOURCES.some((x) => x.id === seat.spell) || (!canSpell && seat.spell === 'list')) seat.spell = canSpell ? d.spell : 'starter';
    if (!MATH_LEVELS.some((l) => l.id === seat.math)) seat.math = savedLevel();
    seat.name = typeof seat.name === 'string' ? seat.name.slice(0, 12) : '';
    return seat;
  });
  if (!B.LEVELS.some((l) => l.id === o.bot)) o.bot = 'right';
  if (!LENGTHS.includes(o.length)) o.length = 'short';
  o.second = o.second !== false;
  return o;
}
const saveOptions = (o) => writeJSON(OPTS_KEY, { seats: o.seats, bot: o.bot, length: o.length, second: o.second });

export function loadGame() {
  const s = readJSON(SAVE_KEY, null);
  if (!s || !s.st || s.st.v !== 1 || !R.LAYOUTS[s.st.layout] || !Array.isArray(s.st.players) || s.st.over) return null;
  for (const p of s.st.players) if (!Array.isArray(p.badges)) p.badges = []; // saved before badges were kept
  return s;
}

export function mount(root, entries, api) {
  const canSpell = entries.length > 0;
  const settings = loadOptions(canSpell);
  let sc = scope();
  let st = null; // game state (rules.js)
  let holder = 0; // the person holding the device (pass-and-play)
  let asks = []; // question makers per player
  let choosing = false; // a person may tap a tile
  const hooks = { botNext: null }; // tests: root.__cave.botNext = true/false decides the computer's next answer
  root.__cave = hooks;
  const ms = (n) => (fast() ? Math.round(n / 10) : n);

  /* ---------------- setup ---------------- */
  const taken = (hero, except) => settings.seats.some((s, i) => i !== except && s.type !== 'off' && s.hero === hero);
  const freeHero = (i) => (R.HEROES.find((h) => !taken(h.id, i)) || R.HEROES[0]).id;
  const humansIn = () => settings.seats.filter((s) => s.type === 'me' || s.type === 'person').length;
  const botsIn = () => settings.seats.filter((s) => s.type === 'bot').length;

  const choice = (label, opts, cur, onPick, cls = '') =>
    el('div', { class: `seg ${cls}`.trim() },
      label ? el('p', { class: 'label' }, label) : null,
      el('div', { class: 'row' },
        opts.map(([val, text]) =>
          el('button', {
            class: 'btn' + (cur === val ? ' primary' : ''), type: 'button', 'aria-pressed': String(cur === val), 'data-v': String(val),
            onclick: () => { onPick(val); saveOptions(settings); setup(); },
          }, text),
        ),
      ),
    );
  const select = (cls, label, opts, cur, onPick) => {
    const s = el('select', { class: cls, 'aria-label': label, onchange: () => { onPick(s.value); saveOptions(settings); } },
      opts.map(([v, t]) => el('option', { value: v, selected: v === cur }, t)));
    return el('label', { class: 'cv-pick' }, label, s);
  };

  function seatCard(seat, i) {
    const on = seat.type !== 'off';
    const human = seat.type === 'me' || seat.type === 'person';
    const head = i === 0
      ? el('p', { class: 'cv-seat-title' }, 'You')
      : el('div', { class: 'row cv-types' },
        [['off', 'Nobody'], ['person', '🙂 Person'], ['bot', '🤖 Computer']].map(([t, text]) =>
          el('button', {
            class: 'btn' + (seat.type === t ? ' primary' : ''), type: 'button', 'data-type': t, 'aria-pressed': String(seat.type === t),
            onclick: () => { seat.type = t; if (t !== 'off' && taken(seat.hero, i)) seat.hero = freeHero(i); saveOptions(settings); setup(); },
          }, text)));
    if (!on) return el('div', { class: 'cv-seat off', 'data-seat': i }, el('p', { class: 'cv-seat-n' }, `Seat ${i + 1}`), head);
    const heroes = el('div', { class: 'row cv-heroes' },
      R.HEROES.map((h) => {
        const btn = el('button', {
          class: 'btn cv-heropick' + (seat.hero === h.id ? ' primary' : ''), type: 'button', 'data-hero': h.id,
          'aria-pressed': String(seat.hero === h.id), disabled: taken(h.id, i), 'aria-label': h.title,
          onclick: () => { seat.hero = h.id; saveOptions(settings); setup(); },
        });
        btn.append(html('cv-pick-art', heroSvg(h.id)));
        return btn;
      }));
    const parts = [el('p', { class: 'cv-seat-n' }, `Seat ${i + 1}`), head, heroes];
    if (human) {
      const name = textInput({ value: seat.name, max: 12, placeholder: i === 0 ? 'Your name' : `Player ${i + 1}`, label: `Seat ${i + 1} name`, capitalize: 'words' });
      name.classList.add('cv-name');
      name.addEventListener('input', () => { seat.name = name.value.trim().slice(0, 12); saveOptions(settings); });
      const words = SPELL_SOURCES.filter((s) => canSpell || s.id !== 'list').map((s) => [s.id, i > 0 && s.id === 'list' ? `Same as ${settings.seats[0].name || 'seat 1'}` : s.name]);
      parts.push(name, el('div', { class: 'row cv-levels' },
        select('cv-math', 'Math', MATH_LEVELS.map((l) => [l.id, l.name]), seat.math, (v) => { seat.math = v; }),
        select('cv-spell', 'Words', words, seat.spell, (v) => { seat.spell = v; })));
    } else {
      parts.push(el('p', { class: 'cv-botname' }, `${R.heroOf(seat.hero).name} ${R.heroOf(seat.hero).title}`));
    }
    return el('div', { class: 'cv-seat', 'data-seat': i }, parts);
  }

  function options() {
    const box = el('div', { class: 'overlay cv-opts-wrap' });
    const close = () => { box.remove(); setup(); };
    const draw = () => box.replaceChildren(el('div', { class: 'panel zt-options cv-opts' },
      el('h2', {}, '⚙️ More options'),
      el('div', { class: 'seg' }, el('p', { class: 'label' }, 'How big is the cave?'),
        el('div', { class: 'row' }, LENGTHS.map((l) => el('button', {
          class: 'btn' + (settings.length === l ? ' primary' : ''), type: 'button', 'data-len': l,
          onclick: () => { settings.length = l; saveOptions(settings); draw(); },
        }, `${R.LAYOUTS[l].name} (${R.LAYOUTS[l].grid.join('').length} tiles)`)))),
      el('div', { class: 'seg' }, el('p', { class: 'label' }, 'Second chance on a question'),
        el('div', { class: 'row' }, [[true, 'On'], [false, 'Off']].map(([v, t]) => el('button', {
          class: 'btn' + (settings.second === v ? ' primary' : ''), type: 'button',
          onclick: () => { settings.second = v; saveOptions(settings); draw(); },
        }, t)))),
      el('button', { class: 'btn primary big', type: 'button', onclick: close }, 'Done'),
    ));
    draw();
    root.append(box);
  }

  function setup() {
    sc.dispose();
    sc = scope();
    choosing = false;
    const saved = loadGame();
    const people = humansIn(), bots = botsIn();
    const mode = people > 1 ? 'Most stars wins! Pass the device when it’s someone’s turn.'
      : bots ? 'Team game: you and the computer heroes explore together!' : 'Solo dive: just you and the cave!';
    root.replaceChildren(
      el('div', { class: 'zt-setup cv-setup' },
        el('h2', {}, '💎 Crystal Cave'),
        el('p', { class: 'prompt' }, 'Explore the cave, earn cards by answering questions, and scare away silly bad guys!'),
        saved ? el('button', { class: 'btn primary big cv-continue', type: 'button', onclick: () => resume(saved) }, '▶ Continue our adventure') : null,
        el('div', { class: 'cv-seats' }, settings.seats.map(seatCard)),
        el('p', { class: 'cv-mode' }, mode),
        bots ? choice('Computer heroes', B.LEVELS.map((l) => [l.id, l.name]), settings.bot, (v) => { settings.bot = v; }, 'cv-botlevel') : null,
        bots && settings.bot === 'nomercy' && people < 2 ? el('p', { class: 'zt-summary' }, 'No Mercy plays to win when people compete. On your team, computer heroes always help.') : null,
        el('div', { class: 'row' },
          el('button', { class: 'btn cv-more', type: 'button', onclick: options }, '⚙️ More options'),
          el('button', { class: 'btn primary big cv-start', type: 'button', onclick: newAdventure }, saved ? 'New adventure' : 'Start!'),
        ),
        el('p', { class: 'zt-summary' }, `${R.LAYOUTS[settings.length].name} cave · second chance ${settings.second ? 'on' : 'off'}`),
      ),
    );
  }

  /* ---------------- game ---------------- */
  function newAdventure() {
    const several = humansIn() > 1; // with other people, an unnamed seat 1 is "Player 1", not "You"
    const players = settings.seats.map((s, i) => ({ ...s, i })).filter((s) => s.type !== 'off').map((s) => {
      const human = s.type !== 'bot';
      const h = R.heroOf(s.hero);
      return { name: human ? (s.name || (s.i === 0 && !several ? 'You' : `Player ${s.i + 1}`)) : h.name, hero: s.hero, human, me: s.i === 0, spell: s.spell, math: s.math };
    });
    st = R.newGame({ players, layout: settings.length, bot: settings.bot });
    holder = 0;
    begin();
    startTurn();
  }
  function resume(saved) {
    st = saved.st;
    holder = saved.holder || 0;
    begin();
    const p = st.players[st.turn];
    if (p.human && humans() > 1 && holder !== st.turn) return passTo(st.turn, startTurn);
    startTurn();
  }
  const save = () => { if (st && !st.over) writeJSON(SAVE_KEY, { st, holder }); };
  const humans = () => st.players.filter((p) => p.human).length;
  const me = () => st.players.findIndex((p) => p.me);
  const myMath = () => (st.players[me()] || st.players[0]).math;
  const skillKey = (prob) => (prob.kind === 'spell' ? 'spell' : `math:${myMath()}`);

  // Screen parts, rebuilt by drawAll().
  let boardEl, playersEl, statusEl, workEl, msgEl, topEl, wrapEl;
  function begin() {
    sc.dispose();
    sc = scope();
    loadDictionary(); // Grown-up words, and keeps real words out of the computer's misspellings
    asks = st.players.map((p) => questioner({ spell: p.spell, math: p.math, entries }));
    boardEl = el('div', { class: 'cv-board' });
    playersEl = el('div', { class: 'cv-players' });
    statusEl = el('div', { class: 'cv-status' });
    workEl = el('div', { class: 'cv-work' });
    msgEl = el('div', { class: 'msg cv-msg', 'aria-live': 'polite' });
    topEl = el('div', { class: 'cv-top' });
    wrapEl = el('div', { class: 'cv' }, topEl,
      el('div', { class: 'cv-main' },
        el('div', { class: 'cv-board-wrap' }, boardEl),
        el('div', { class: 'cv-side' }, playersEl, el('div', { class: 'cv-panel' }, statusEl, msgEl, workEl))));
    root.replaceChildren(wrapEl);
    hooks.state = () => st;
  }
  const say = (t) => { msgEl.textContent = t || ''; };
  const work = (...kids) => { wrapEl.classList.remove('asking'); workEl.replaceChildren(...kids.flat().filter(Boolean)); };
  // Each action button works once (a quick double tap must not end a turn twice).
  const once = (fn) => { let used = false; return (e) => { if (used) return; used = true; if (e && e.currentTarget) e.currentTarget.disabled = true; fn(e); }; };
  const button = (text, onclick, cls = '') => el('button', { class: `btn primary big ${cls}`.trim(), type: 'button', onclick: once(onclick) }, text);
  const plain = (text, onclick, cls = '') => el('button', { class: `btn big ${cls}`.trim(), type: 'button', onclick: once(onclick) }, text);
  const cardIcons = (needs) => el('span', { class: 'cv-needs' },
    ['power', 'wisdom', 'magic', 'any'].flatMap((k) => Array.from({ length: needs[k] || 0 }, () => html('cv-need', cardSvg(k)))));

  function drawAll() {
    drawTop();
    drawBoard();
    drawPlayers();
  }
  function drawTop() {
    if (!st.coop) { topEl.replaceChildren(el('span', { class: 'cv-goal' }, st.final != null ? '⏳ Last turns!' : 'Most stars wins!')); return; }
    const s = st.over ? R.teamScore(st) : st.players.reduce((n, p) => n + live(p), 0);
    topEl.replaceChildren(...[
      el('span', { class: 'cv-team' }, html('cv-ic-w', starSvg()), ` Team stars: ${s}`),
      el('span', { class: 'cv-goal' }, `🥉 ${st.goal[0]}  🥈 ${st.goal[1]}  🥇 ${st.goal[2]}`),
      st.final != null ? el('span', { class: 'cv-goal' }, '⏳ Last turns!') : null,
    ].filter(Boolean));
  }
  // Stars so far; hearts left count at the end.
  const live = (p) => { const s = R.score(p); return s.total - s.hearts; };
  function drawBoard() {
    const b = R.boardOf(st.layout);
    // Glowing = what she may tap now: tiles to explore, waiting bad guys, and gems she can pay for.
    const cards = st.players[st.turn].cards;
    const can = new Set(choosing ? [...R.explorable(st), ...R.waiting(st, 'monster'), ...R.waiting(st, 'item').filter((t) => R.canPay(cards, st.tiles[t].card.needs))] : []);
    boardEl.style.setProperty('--cols', b.cols);
    boardEl.style.setProperty('--rows', b.rows);
    const cells = st.tiles.map((t, i) => {
      const w = R.walls(b, i);
      const cls = ['cv-tile', t.state, t.state === 'down' ? t.color : '', `room${t.room}`, can.has(i) ? 'can' : '',
        w.t ? 'wt' : '', w.r ? 'wr' : '', w.b ? 'wb' : '', w.l ? 'wl' : ''].filter(Boolean).join(' ');
      const kids = [];
      if (t.state === 'up') {
        const c = t.card;
        kids.push(html('cv-face', c.kind === 'monster' ? monsterSvg(c.look, c.name) : gemSvg(c.look.color, c.name)), cardIcons(c.needs));
      } else if (t.state === 'down') kids.push(el('span', { class: 'cv-crystal', 'aria-hidden': 'true' }));
      const here = st.players.map((p, j) => (p.at === i ? j : -1)).filter((j) => j >= 0);
      if (here.length) kids.push(el('span', { class: 'cv-tokens' }, here.map((j) => html(`cv-token${j === st.turn ? ' on' : ''}`, heroSvg(st.players[j].hero)))));
      return el('button', {
        class: cls, type: 'button', 'data-i': i, 'data-state': t.state, 'data-color': t.color, 'data-kind': t.state === 'up' ? t.card.kind : null,
        'aria-label': t.state === 'down' ? `${t.color} tile` : t.state === 'up' ? t.card.name : 'explored',
        onclick: () => { if (choosing && can.has(i)) onTile(i); },
      }, kids);
    });
    const start = st.players.map((p, j) => (p.at == null ? j : -1)).filter((j) => j >= 0);
    boardEl.replaceChildren(
      el('div', { class: 'cv-grid' }, cells),
      el('div', { class: 'cv-entry' }, el('span', {}, '⬆ Way in'), start.map((j) => html('cv-token', heroSvg(st.players[j].hero)))),
    );
  }
  function drawPlayers() {
    playersEl.replaceChildren(...st.players.map((p, i) => {
      return el('div', { class: `cv-player${i === st.turn ? ' on' : ''}`, 'data-p': i },
        html('cv-ava', heroSvg(p.hero)),
        el('div', { class: 'cv-pinfo' },
          el('div', { class: 'cv-pname' }, p.name, p.human ? null : ' 🤖'),
          el('div', { class: 'cv-stats' },
            el('span', { class: 'cv-hearts', 'data-n': p.hearts }, html('cv-ic-w', heartSvg()), String(p.hearts)),
            R.KINDS.map((k) => el('span', { class: `cv-count c-${k}`, 'data-k': k, 'data-n': p.cards[k] }, html('cv-ic-w', cardSvg(k)), String(p.cards[k]))),
            st.coop ? null : el('span', { class: 'cv-stars', 'data-n': live(p) }, html('cv-ic-w', starSvg()), String(live(p))),
          ),
          p.badges && p.badges.length ? el('div', { class: 'cv-badges', 'aria-label': 'Kind Badges' },
            p.badges.map((b) => el('span', { class: 'cv-badge', 'data-effect': b.effect, title: `${b.name}: ${b.text}` }, `${b.icon} ${b.name}`))) : null,
          p.quest ? el('div', { class: 'cv-quest' }, `📜 ${p.quest.text} (+${p.quest.stars}⭐)`) : null,
        ));
    }));
  }
  const status = (i, text) => statusEl.replaceChildren(html('cv-mini', heroSvg(st.players[i].hero)), el('span', {}, text));
  const whose = (i) => (st.players[i].name === 'You' ? 'Your turn' : `${st.players[i].name}’s turn`);

  // Pass-and-play: the next person taps their own button (also lets their spelling word be spoken on iOS).
  function passTo(i, then, text) {
    choosing = false;
    drawAll();
    status(i, whose(i));
    work(el('p', { class: 'prompt cv-pass' }, text || `Pass the device to ${st.players[i].name}.`),
      button(`I’m ${st.players[i].name} ▶`, () => { holder = i; save(); then(); }, 'cv-me'));
  }

  function startTurn() {
    save();
    if (st.over) return finale();
    const i = st.turn, p = st.players[i];
    choosing = false;
    drawAll();
    status(i, whose(i));
    if (p.skip) {
      p.skip = false;
      say(`${p.name} rests this turn (and has a heart back).`);
      if (!p.human) return sc.later(() => finishTurn(i, true), ms(1400));
      return work(button('OK ➜', () => finishTurn(i, true), 'cv-ok'));
    }
    if (!p.human) { work(el('p', { class: 'prompt cv-think' }, 'Thinking…')); return sc.later(() => botTurn(i), ms(900)); }
    humanTurn(i);
  }

  function humanTurn(i) {
    holder = i;
    choosing = true;
    drawAll();
    status(i, whose(i));
    const open = R.explorable(st).length;
    work(
      el('p', { class: 'prompt' }, open ? 'Tap a glowing tile to explore it, or a bad guy or gem to try it.' : 'Every tile is explored! Try a bad guy or a gem, or pass.'),
      st.final != null || !open ? plain('Pass ➜', () => finishTurn(i), 'cv-passturn') : null,
      badgeBar(i, () => humanTurn(i)),
    );
  }

  function onTile(t) {
    const i = st.turn, p = st.players[i], tile = st.tiles[t];
    if (tile.state === 'up' && tile.card.kind === 'item' && !R.canPay(p.cards, tile.card.needs)) {
      say(`${tile.card.name} needs more cards. Come back when you have them!`);
      return;
    }
    choosing = false;
    p.at = t;
    if (tile.state === 'down') return reveal(i, t, true);
    if (tile.card.kind === 'monster') return encounter(i, t, true, true);
    return tryGem(i, t, true, true);
  }

  // A face-down tile turns over.
  function reveal(i, t, inTap) {
    const tile = st.tiles[t], c = tile.card, p = st.players[i];
    if (c.kind === 'monster' || c.kind === 'item') tile.state = 'up';
    drawAll();
    if (c.kind === 'monster') { say(`A bad guy! It’s ${c.name}!`); return encounter(i, t, inTap, false); }
    if (c.kind === 'item') { say(`A gem: ${c.name}!`); return tryGem(i, t, inTap); }
    if (c.kind === 'treasure') {
      tile.state = 'done';
      const got = [];
      for (let n = 0; n < c.gives.treasure; n++) { const x = R.drawTreasure(st, i); if (x) got.push(x); }
      drawAll();
      say(got.length ? `${p.name} found ${got.map((x) => `${x.icon} ${x.name}`).join(' and ')}!` : 'The treasure was all gone.');
      work(el('div', { class: 'cv-found' }, got.map((x) => el('span', { class: 'cv-treasure' }, x.icon, el('small', {}, `+${x.stars}⭐`)))),
        p.human ? button('OK ➜', () => finishTurn(i), 'cv-ok') : null);
      if (!p.human) sc.later(() => finishTurn(i), ms(1500));
      return;
    }
    // ability: a list of cards to earn, one question each (the "any" ones are picked first)
    const picks = [];
    for (const k of R.KINDS) for (let n = 0; n < (c.gives[k] || 0); n++) picks.push(k);
    const free = c.gives.treasure || 0;
    tile.state = 'done';
    drawAll();
    say(`${c.name}!`);
    const go = (all) => earn(i, t, all, free, inTap);
    if (c.gives.any) {
      if (!p.human) return go([...picks, ...B.anyPicks(p, c.gives.any)]);
      return pickAny(i, c, picks, go);
    }
    return go(picks);
  }

  // Lucky Find / Grab Bag: she picks which kinds to try for (treasure counts too).
  function pickAny(i, c, fixed, then) {
    const chosen = [];
    const draw = () => {
      say(`${c.name}! Pick ${plural(c.gives.any - chosen.length, 'more card')} to try for.`);
      work(
        el('p', { class: 'prompt' }, `${c.name}: choose ${c.gives.any}. Power = math, Wisdom = spelling, Magic or treasure = either.`),
        el('div', { class: 'row cv-anypicks' }, [...R.KINDS, 'treasure'].map((k) =>
          el('button', { class: 'btn cv-anypick', type: 'button', 'data-k': k, onclick: () => {
            chosen.push(k);
            if (chosen.length < c.gives.any) return draw();
            then([...fixed, ...chosen]);
          } }, k === 'treasure' ? '💰' : html('cv-ic-w', cardSvg(k)), ` ${k === 'treasure' ? 'Treasure' : CARD[k].name}`))),
        chosen.length ? el('p', { class: 'zt-summary' }, `So far: ${chosen.map((k) => (k === 'treasure' ? 'Treasure' : CARD[k].name)).join(', ')}`) : null,
      );
    };
    draw();
  }

  // One question per card: right = the card. Then any free treasure, then the turn ends.
  function earn(i, t, picks, freeTreasure, inTap) {
    const tile = st.tiles[t], p = st.players[i], tier = R.TIER[tile.color];
    let got = 0;
    const next = (k, tap) => {
      if (k >= picks.length) {
        const extra = [];
        for (let n = 0; n < freeTreasure; n++) { const x = R.drawTreasure(st, i); if (x) extra.push(x); }
        drawAll();
        const line = `${p.name} earned ${plural(got, 'card')}${extra.length ? ` and found ${extra.map((x) => x.icon).join(' ')}` : ''}!`;
        say(got || extra.length ? line : 'No cards this time. Keep exploring!');
        if (!p.human) return sc.later(() => finishTurn(i), ms(1400));
        return work(button('OK ➜', () => finishTurn(i), 'cv-ok'));
      }
      const kind = picks[k];
      question(i, R.SUBJECT[kind], tier, `${tile.card.name}: earn ${kind === 'treasure' ? 'a treasure' : `a ${CARD[kind].name} card`} (${k + 1} of ${picks.length})`, tap, (ok) => {
        if (ok) {
          got += kind === 'treasure' ? 0 : 1;
          if (kind === 'treasure') { const x = R.drawTreasure(st, i); if (x) say(`${x.icon} ${x.name}!`); } else p.cards[kind]++;
          drawPlayers(); drawTop();
        }
        next(k + 1, false);
      });
    };
    next(0, inTap);
  }

  // Ask player i a question. inTap = we are inside a tap now (a spelling word may be spoken straight away);
  // otherwise a spelling question waits for a "Next" tap first (iOS speech rule). cb(ok).
  function question(i, subject, tier, title, inTap, cb) {
    const p = st.players[i];
    const prob = asks[i](subject, tier);
    if (!p.human) return botAnswer(i, prob, title, cb);
    const show = () => {
      wrapEl.classList.add('asking');
      const record = !p.me ? 'none' : prob.kind === 'spell' && prob.source !== 'list' ? 'garden' : 'all';
      const box = ask({
        problem: prob, entries: prob.source === 'list' ? entries : [], later: sc.later, onLeave: sc.onLeave, second: settings.second, record,
        prompt: prob.kind === 'spell' ? 'Listen, then spell the word.' : null,
        done: ({ ok, firstTry }) => {
          wrapEl.classList.remove('asking');
          if (p.me) noteResult(skillKey(prob), ok ? (firstTry ? 1 : 0.5) : 0);
          if (ok) say(cheer(prob.kind === 'spell' ? 'spell' : opKind(prob.text)));
          else say('Not this time.');
          cb(ok);
        },
      });
      workEl.replaceChildren(el('p', { class: 'cv-qtitle' }, `${humans() > 1 ? `${p.name}: ` : ''}${title}`), box);
    };
    if (prob.kind === 'spell' && !inTap) {
      return work(el('p', { class: 'prompt' }, `${title}: a spelling word.`), button('Next question ➜', show, 'cv-nextq'));
    }
    show();
  }

  // A computer hero answers: typed key by key; a slip is shown kindly with what went wrong.
  function botAnswer(i, prob, title, cb) {
    const p = st.players[i];
    const ok = hooks.botNext != null ? hooks.botNext : Math.random() < B.answerChance(st.bot, prob.tier, skillOf(skillKey(prob)));
    hooks.botNext = null;
    const right = prob.kind === 'spell' ? prob.entry.word : String(prob.answer);
    const slip = ok ? null : prob.kind === 'spell' ? { value: spellingSlip(right, new Set(entries.map((e) => e.word))) } : mathSlip(prob.text, prob.answer);
    const wrote = ok ? right : String(slip.value);
    const typed = el('div', { class: 'typed cv-typed' }, ' ');
    work(el('p', { class: 'cv-qtitle' }, `${p.name}: ${title}`),
      prob.kind === 'spell' ? el('p', { class: 'prompt' }, `${p.name} is spelling a word…`) : el('div', { class: 'bigword' }, `${prob.text} = ?`),
      typed);
    let n = 0;
    const tick = () => {
      typed.textContent = wrote.slice(0, ++n);
      if (n < wrote.length) return sc.later(tick, ms(160));
      sc.later(() => {
        if (ok) { typed.classList.add('good'); say(`${p.name} got it!`); }
        else {
          typed.classList.add('bt-oops');
          if (prob.kind === 'spell') { typed.replaceChildren(...[...wrote].map((c, k) => el('span', { class: c === right[k] ? 'ok' : 'off' }, c))); say(`Oops! ${p.name} wrote “${wrote}”. It’s spelled ${right}.`); }
          else say(`Oops! ${p.name} wrote ${wrote}: ${slip.why}. ${prob.text} = ${right}.`);
        }
        sc.later(() => cb(ok), ms(ok ? 900 : 2200));
      }, ms(400));
    };
    sc.later(tick, ms(300));
  }

  /* ----- bad guys ----- */
  const monsterCard = (c) => el('div', { class: 'cv-card' },
    html('cv-big', monsterSvg(c.look, c.name)),
    el('div', { class: 'cv-card-text' }, el('strong', {}, c.name), el('span', {}, 'Needs '), cardIcons(c.needs), el('span', {}, ` · ${plural(c.stars, 'star')}`)));

  // revisit = she chose an already-revealed bad guy (she may still change her mind).
  function encounter(i, t, inTap, revisit) {
    const p = st.players[i], c = st.tiles[t].card;
    drawAll();
    const miss = R.shortfall(p.cards, c.needs);
    if (!miss.total) {
      if (!p.human) return sc.later(() => scared(i, t), ms(1000));
      return work(monsterCard(c), button('✨ Scare it away!', () => scared(i, t), 'cv-scare'));
    }
    if (!p.human) {
      const used = B.botBadges(st, i, c.needs);
      if (used.length) { drawAll(); say(`${p.name} used ${used.map((u) => `${u.badge.icon} ${u.badge.name}`).join(' and ')}.`); }
      if (R.canPay(p.cards, c.needs)) return sc.later(() => scared(i, t), ms(1000));
      if (B.helpAvailable(st, i, R.shortfall(p.cards, c.needs))) return askHelp(i, t, () => afterHelp(i, t));
      return afterHelp(i, t);
    }
    const helpers = B.helpAvailable(st, i, miss);
    work(monsterCard(c),
      el('p', { class: 'prompt' }, `You need ${missingText(miss)} more.`),
      el('div', { class: 'cv-choices' },
        helpers ? button('🤝 Ask for help', () => askHelp(i, t, () => afterHelp(i, t)), 'cv-help') : null,
        braveButton(i, t, miss),
        plain('🏃 Back away (lose a heart)', () => backAway(i, t), 'cv-back'),
        revisit ? el('button', { class: 'btn cv-notnow', type: 'button', onclick: () => humanTurn(i) }, '↩ Not now') : null,
      ),
      badgeBar(i, () => encounter(i, t, false, revisit), c.needs));
  }
  const missingText = (miss) => ['power', 'wisdom', 'magic', 'any'].filter((k) => miss[k]).map((k) => `${miss[k]} ${CARD[k].name}`).join(', ');
  // Her Kind Badges she can use right now, as buttons; redo() redraws the screen she was on afterwards.
  // A Bonus Card asks which card it becomes (the missing kind first when `needs` is given).
  function badgeBar(i, redo, needs) {
    const p = st.players[i];
    const list = (p.badges || []).map((b, n) => ({ b, n })).filter(({ b }) => R.usable(p, b));
    if (!list.length) return null;
    const use = (n, kind) => {
      const r = R.useBadge(st, i, n, kind);
      if (!r) return;
      drawAll();
      say(r.badge.effect === 'heart' ? `${p.name} used ${r.badge.icon} ${r.badge.name}: +1 heart!`
        : r.badge.effect === 'card' ? `${p.name} used ${r.badge.icon} ${r.badge.name}: +1 ${CARD[r.kind].name} card!`
          : r.treasure ? `${p.name} used ${r.badge.icon} ${r.badge.name} and found ${r.treasure.icon} ${r.treasure.name}!` : 'The treasure bag is empty.');
      redo();
    };
    const pickKind = (n) => {
      const miss = needs ? R.shortfall(p.cards, needs) : null;
      work(el('p', { class: 'prompt' }, 'Which card should your Bonus Card be?'),
        el('div', { class: 'row cv-anypicks' }, R.KINDS.map((k) =>
          el('button', { class: `btn cv-bonuspick${miss && miss[k] ? ' primary' : ''}`, type: 'button', 'data-k': k, onclick: once(() => use(n, k)) },
            html('cv-ic-w', cardSvg(k)), ` ${CARD[k].name}`))),
        plain('↩ Back', redo, 'cv-notnow'));
    };
    return el('div', { class: 'cv-badgebar' },
      el('p', { class: 'label' }, '🏅 Your Kind Badges'),
      el('div', { class: 'row' }, list.map(({ b, n }) =>
        el('button', { class: 'btn cv-usebadge', type: 'button', 'data-effect': b.effect, title: b.text,
          onclick: once(() => (b.effect === 'card' ? pickKind(n) : use(n))) }, `Use ${b.icon} ${b.name}`))));
  }

  const braveButton = (i, t, miss) => plain(`💪 Brave try (${plural(miss.total, 'harder question')})`, () => brave(i, t, true), 'cv-brave');

  function afterHelp(i, t) {
    const p = st.players[i], c = st.tiles[t].card;
    const miss = R.shortfall(p.cards, c.needs);
    drawAll();
    if (!miss.total) {
      say('Thanks, friends! Now there are enough cards.');
      if (!p.human) return sc.later(() => scared(i, t), ms(900));
      const go = () => work(monsterCard(c), button('✨ Scare it away!', () => scared(i, t), 'cv-scare'));
      return humans() > 1 && holder !== i ? passTo(i, go, `Pass the device back to ${p.name}.`) : go();
    }
    if (!p.human) {
      if (B.braveTry(st, i, miss.total)) { say(`${p.name} makes a brave try!`); return sc.later(() => brave(i, t, false), ms(900)); }
      return sc.later(() => backAway(i, t), ms(900));
    }
    const go = () => work(monsterCard(c),
      el('p', { class: 'prompt' }, `Still ${missingText(miss)} short.`),
      el('div', { class: 'cv-choices' }, braveButton(i, t, miss),
        plain('🏃 Back away (lose a heart)', () => backAway(i, t), 'cv-back')),
      badgeBar(i, () => afterHelp(i, t), c.needs));
    return humans() > 1 && holder !== i ? passTo(i, go, `Pass the device back to ${p.name}.`) : go();
  }

  // Friends are asked counter-clockwise, one card at a time, round and round, until it's enough or nobody gives.
  function askHelp(i, t, then) {
    const c = st.tiles[t].card;
    const order = R.helpOrder(st, i);
    let pos = 0, gave = false;
    const step = () => {
      const miss = R.shortfall(st.players[i].cards, c.needs);
      if (!miss.total) return then();
      if (pos >= order.length) { if (!gave) return then(); pos = 0; gave = false; }
      const h = order[pos++], helper = st.players[h];
      if (!R.canGive(helper.cards, miss)) return step();
      const kind = R.usefulKind(helper.cards, miss);
      const doGive = () => {
        const r = R.give(st, h, i, kind);
        gave = true;
        drawAll();
        say(`${helper.name} gave ${st.players[i].name} a ${CARD[kind].name} card! ${badgeLine(helper, r.kid)}`);
      };
      if (!helper.human) {
        if (!B.willHelp(st, h, i)) { say(`${helper.name} keeps their cards this time.`); return sc.later(step, ms(900)); }
        doGive();
        return sc.later(step, ms(1400));
      }
      const offer = () => {
        holder = h;
        status(h, `${helper.name}, can you help?`);
        work(monsterCard(c),
          el('p', { class: 'prompt' }, `Give ${st.players[i].name === 'You' ? 'your teammate' : st.players[i].name} a ${CARD[kind].name} card? You’ll earn a Kind Badge to use later.`),
          el('div', { class: 'cv-choices' },
            button(`🎁 Give a ${CARD[kind].name} card`, () => { doGive(); sc.later(step, ms(1200)); work(); }, 'cv-give'),
            plain('Not this time', () => { say(`${helper.name} keeps their cards this time.`); work(); sc.later(step, ms(500)); }, 'cv-nogive')));
      };
      if (humans() > 1 && holder !== h) return passTo(h, offer, `${st.players[i].name} needs help! Pass the device to ${helper.name}.`);
      return offer();
    };
    say(`${st.players[i].name} asks for help!`);
    work(monsterCard(c), el('p', { class: 'prompt cv-asking' }, 'Asking friends for help…'));
    step();
  }
  const badgeLine = (p, b) => (b ? `${p.name} earns a Kind Badge: ${b.icon} ${b.name} (${b.text}).` : `${p.name} earns a Kind Badge.`);

  // Brave try: one harder question (a tier up) per missing card. All right = scared away; a miss = lose a heart.
  // Right answers keep their cards either way.
  function brave(i, t, inTap) {
    const p = st.players[i], tile = st.tiles[t], c = tile.card;
    const miss = R.shortfall(p.cards, c.needs);
    const kinds = [];
    for (const k of R.KINDS) for (let n = 0; n < miss[k]; n++) kinds.push(k);
    for (let n = 0; n < miss.any; n++) kinds.push('magic');
    const tier = Math.min(3, R.TIER[tile.color] + 1);
    const next = (k, tap) => {
      if (k >= kinds.length) return scared(i, t, true);
      const kind = kinds[k];
      question(i, R.SUBJECT[kind], tier, `Brave try: a ${CARD[kind].name} card (${k + 1} of ${kinds.length})`, tap, (ok) => {
        if (!ok) return backAway(i, t, true);
        p.cards[kind]++;
        drawPlayers();
        next(k + 1, false);
      });
    };
    next(0, inTap);
  }

  function scared(i, t, braveWin) {
    const p = st.players[i], c = st.tiles[t].card;
    R.scare(st, i, t);
    drawAll();
    say(`${braveWin ? 'So brave! ' : ''}${p.name} scared away ${c.name}! +${plural(c.stars, 'star')}`);
    work(el('div', { class: 'cv-poof' }, html('cv-big gone', monsterSvg(c.look, c.name))), p.human ? button('OK ➜', () => finishTurn(i), 'cv-ok') : null);
    if (!p.human) sc.later(() => finishTurn(i), ms(1500));
  }

  function backAway(i, t, fromBrave) {
    const p = st.players[i], c = st.tiles[t].card;
    const r = R.loseHeart(st, i);
    drawAll();
    say(r === 'rest'
      ? `${c.name} is still here. ${p.name} needs a rest next turn (and gets a heart back).`
      : `${fromBrave ? 'Good try! ' : ''}${c.name} is still here. ${p.name} loses a heart.`);
    if (!p.human) return sc.later(() => finishTurn(i), ms(1600));
    work(button('OK ➜', () => finishTurn(i), 'cv-ok'));
  }

  /* ----- gems ----- */
  // revisit = she chose a gem that was already waiting (she may change her mind and pick something else).
  function tryGem(i, t, inTap, revisit) {
    const p = st.players[i], c = st.tiles[t].card;
    const card = el('div', { class: 'cv-card' }, html('cv-big', gemSvg(c.look.color, c.name)),
      el('div', { class: 'cv-card-text' }, el('strong', {}, c.name), el('span', {}, 'Costs '), cardIcons(c.needs), el('span', {}, ` · ${plural(c.stars, 'star')}`)));
    if (!p.human && !R.canPay(p.cards, c.needs)) B.botBadges(st, i, c.needs);
    drawAll();
    if (!R.canPay(p.cards, c.needs)) {
      say(`${c.name} needs more cards. It waits here until someone has them.`);
      if (!p.human) return sc.later(() => finishTurn(i), ms(1400));
      return work(card, button('OK ➜', () => finishTurn(i), 'cv-ok'), badgeBar(i, () => tryGem(i, t, false, revisit), c.needs));
    }
    const take = () => {
      R.buy(st, i, t);
      drawAll();
      say(`${p.name} got ${c.name}! +${plural(c.stars, 'star')}`);
      if (!p.human) return sc.later(() => finishTurn(i), ms(1400));
      work(button('OK ➜', () => finishTurn(i), 'cv-ok'));
    };
    if (!p.human) return sc.later(take, ms(900));
    work(card, el('div', { class: 'cv-choices' },
      button('💎 Get it!', take, 'cv-buy'),
      revisit ? plain('↩ Not now', () => humanTurn(i), 'cv-notnow')
        : plain('Save my cards', () => { say('Saving cards for later.'); finishTurn(i); }, 'cv-keep')));
  }

  /* ----- computer turn ----- */
  function botTurn(i) {
    const p = st.players[i];
    const used = B.botBadges(st, i);
    if (used.length) say(`${p.name} used ${used.map((u) => `${u.badge.icon} ${u.badge.name}`).join(' and ')}.`);
    const plan = B.chooseAction(st, i);
    if (plan.type === 'pass') { say(`${p.name} waits.`); return sc.later(() => finishTurn(i), ms(900)); }
    p.at = plan.tile;
    drawAll();
    const tile = st.tiles[plan.tile];
    if (plan.type === 'explore') { say(`${p.name} explores a ${tile.color} tile…`); return sc.later(() => reveal(i, plan.tile, false), ms(900)); }
    if (plan.type === 'fight') { say(`${p.name} goes after ${tile.card.name}!`); return sc.later(() => encounter(i, plan.tile, false, true), ms(900)); }
    say(`${p.name} goes for ${tile.card.name}.`);
    sc.later(() => tryGem(i, plan.tile, false), ms(900));
  }

  /* ----- end of a turn ----- */
  function finishTurn(i, rested) {
    const p = st.players[i];
    choosing = false;
    work();
    const q = rested ? null : R.checkQuest(st, i);
    R.endTurn(st);
    save();
    drawAll();
    if (q) say(`Quest done: ${q.name}! ${p.name} gets ${plural(q.stars, 'star')}.`);
    if (st.over) return sc.later(finale, ms(q ? 1500 : 600));
    const n = st.players[st.turn];
    if (!n.human) return sc.later(startTurn, ms(q ? 1600 : 700));
    const label = humans() > 1 && st.turn !== holder ? `Pass to ${n.name} ➜` : n.name === 'You' ? 'Your turn ➜' : `${n.name}’s turn ➜`;
    const go = () => { holder = st.turn; save(); startTurn(); };
    status(st.turn, whose(st.turn));
    // Straight after her own turn in a team game: no need to pass anything.
    work(button(label, go, 'cv-next'));
  }

  function finale() {
    drop(SAVE_KEY);
    choosing = false;
    drawAll();
    const rows = (order) => el('div', { class: 'cv-results' }, order.map((j, k) => {
      const p = st.players[j], s = R.score(p);
      return el('div', { class: 'cv-result', 'data-p': j },
        st.coop ? null : el('span', { class: 'cv-place' }, ['🥇', '🥈', '🥉', '4'][k]),
        html('cv-mini', heroSvg(p.hero)),
        el('strong', {}, p.name),
        el('span', { class: 'cv-total' }, `${s.total} ⭐`),
        el('small', {}, `bad guys ${s.monsters} · gems ${s.items} · treasure ${s.treasure} · quests ${s.quests} · badges ${s.kind} · hearts ${s.hearts}`));
    }));
    let title, line, party;
    if (st.coop) {
      const m = R.medal(st), team = R.teamScore(st);
      title = m ? `${{ gold: '🥇 Gold', silver: '🥈 Silver', bronze: '🥉 Bronze' }[m]} adventure!` : 'The cave is explored!';
      line = `Your team found ${team} stars together (a star for every heart left counts too).${m === 'gold' ? ' Amazing!' : m ? ' Great teamwork!' : ` ${st.goal[0]} stars gets a medal next time.`}`;
      party = true;
      status(me() >= 0 ? me() : 0, 'Adventure over!');
      work(el('div', { class: 'finish cv-finish', 'data-medal': m || 'none' }, el('h2', {}, title), el('p', { class: 'prompt' }, line), rows(st.players.map((p, j) => j)), endButtons()));
    } else {
      const order = R.ranking(st), w = st.players[order[0]];
      title = w.human ? `${w.name} wins!` : `${w.name} wins this time!`;
      line = w.human ? 'What an adventure! Great exploring, everyone.' : 'That was close. Another adventure?';
      party = w.human;
      status(order[0], 'Adventure over!');
      work(el('div', { class: 'finish cv-finish' }, el('h2', {}, title), el('p', { class: 'prompt' }, line), rows(order), endButtons()));
    }
    say('');
    if (party) celebrate(root);
  }
  const endButtons = () => el('div', { class: 'row' },
    el('button', { class: 'btn primary big cv-again', type: 'button', onclick: newAdventure }, 'Play again'),
    el('button', { class: 'btn big cv-change', type: 'button', onclick: setup }, 'Change heroes'),
    el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'));

  setup();
  return () => { sc.dispose(); delete root.__cave; };
}
