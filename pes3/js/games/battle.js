// Battle Buddies: two buddies take turns. Answer your question right and your buddy sends a sparkle that
// pops one of the other side's hearts; pop all of them to win. Not right this time = no sparkle, nothing lost.
// 💗 Love meter theme (Jason 2026-10-24, the default): a right answer floats a heart into your own meter
// instead, so nothing is ever taken away; first to fill it wins, or (Together) both fill one shared meter.
// 1 player = against the computer (🤖, named after her Robot Course robot), which plays a little below her
// own hidden skill (battle-bot.js) and makes believable mistakes (mistakes.js) that are then explained.
import { el, celebrate, scope, cheer, opKind } from '../util.js';
import { LEVELS, savedLevel, saveLevel, levelChoice } from '../math.js';
import { choice, openOptions, optionsButton } from '../options.js';
import { loadDictionary } from '../dictionary.js';
import { problems, ask } from '../challenge.js';
import { spellingSlip, mathSlip } from '../mistakes.js';
import { skillOf, noteResult, botChance } from './battle-bot.js';

const OPTS_KEY = 'spelling-games.battle.options';
const FAST_KEY = 'spelling-games.battle.fast'; // '1' = short pauses (tests)
export const AVATARS = ['🦄', '🐉', '🦊', '🐼', '🐯', '🦖', '🐙', '🐧'];
export const HEARTS = [3, 5, 7];
const BOT_FACE = '🤖';
const DEFAULTS = { players: 1, mode: 'both', bot: 'right', hearts: 5, avatars: ['🦄', '🐉'], theme: 'love', play: 'race' };
const MODES = [['spelling', 'Spelling'], ['math', 'Math'], ['both', 'Both']];
const BOTS = [['easy', 'Easy'], ['right', 'Just right'], ['tricky', 'Tricky']];

function loadOptions(canSpell) {
  let o = { ...DEFAULTS };
  try { o = { ...o, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') }; } catch { /* ignore */ }
  if (![1, 2].includes(o.players)) o.players = 1;
  if (!['spelling', 'math', 'both'].includes(o.mode)) o.mode = 'both';
  if (!canSpell) o.mode = 'math';
  if (!['easy', 'right', 'tricky'].includes(o.bot)) o.bot = 'right';
  if (!HEARTS.includes(o.hearts)) o.hearts = 5;
  if (!['love', 'battle'].includes(o.theme)) o.theme = DEFAULTS.theme;
  if (!['race', 'together'].includes(o.play)) o.play = DEFAULTS.play;
  if (!Array.isArray(o.avatars) || o.avatars.length !== 2 || !o.avatars.every((a) => AVATARS.includes(a)) || o.avatars[0] === o.avatars[1]) o.avatars = [...DEFAULTS.avatars];
  return o;
}
function saveOptions(o) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify({ players: o.players, mode: o.mode, bot: o.bot, hearts: o.hearts, avatars: o.avatars, theme: o.theme, play: o.play })); } catch { /* ignore */ }
}
function robotName() {
  try { return (localStorage.getItem('spelling-games.robot.name') || '').trim() || 'Robo'; } catch { return 'Robo'; }
}
const fast = () => { try { return localStorage.getItem(FAST_KEY) === '1'; } catch { return false; } };
const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount(root, entries, api) {
  loadDictionary(); // keeps real words out of the computer's misspellings
  const canSpell = entries.length > 0;
  const settings = { ...loadOptions(canSpell), level: savedLevel() };
  const listWords = new Set(entries.map((e) => e.word));
  let sc = scope();
  let pop = null; // open options pop-up
  const ms = (n) => (fast() ? Math.round(n / 8) : n);
  const hooks = { botNext: null }; // tests: set root.__battle.botNext = true/false to decide the computer's next answer
  root.__battle = hooks;

  const seg = (label, key, opts, after) =>
    el('div', { class: 'seg' },
      el('p', { class: 'label' }, label),
      el('div', { class: 'row' },
        opts.map(([val, text]) =>
          el('button', {
            class: 'btn' + (settings[key] === val ? ' primary' : ''), type: 'button', 'aria-pressed': String(settings[key] === val),
            onclick: () => { settings[key] = val; if (after) after(val); saveOptions(settings); setup(); },
          }, text),
        ),
      ),
    );
  const avatarRow = (who) =>
    el('div', { class: 'seg' },
      el('p', { class: 'label' }, settings.players === 1 ? 'Pick your buddy' : `Player ${who + 1}'s buddy`),
      el('div', { class: 'row bt-picks' },
        AVATARS.map((a) => {
          const taken = settings.players === 2 && settings.avatars[1 - who] === a;
          return el('button', {
            class: 'btn bt-pick' + (settings.avatars[who] === a ? ' primary' : ''), type: 'button', disabled: taken,
            'aria-pressed': String(settings.avatars[who] === a), 'data-a': a,
            onclick: () => { settings.avatars[who] = a; saveOptions(settings); setup(); },
          }, a);
        }),
      ),
    );

  // Players, buddies and theme are chosen on the start screen; the rest are grown-up options behind ⚙️.
  const summary = () => [
    canSpell ? MODES.find(([m]) => m === settings.mode)[1] : null,
    settings.mode !== 'spelling' ? LEVELS.find((l) => l.id === settings.level).name : null,
    settings.players === 1 ? `${robotName()}: ${BOTS.find(([b]) => b === settings.bot)[1]}` : null,
    `${settings.hearts} hearts`,
    settings.theme === 'love' ? (settings.play === 'together' ? 'Together' : 'Race') : null,
  ].filter(Boolean).join(' · ');
  function openMore() {
    pop = openOptions({
      onClose: setup,
      body: (redraw) => {
        const set = (key, after) => (v) => { settings[key] = v; if (after) after(v); saveOptions(settings); redraw(); };
        const love = settings.theme === 'love';
        return [
          love ? choice('How to play', settings.play, [['race', '🏁 Race: first to fill'], ['together', '🤝 Together: one meter']], set('play')) : null,
          canSpell ? choice('Questions', settings.mode, MODES, set('mode')) : null,
          settings.mode !== 'spelling' ? levelChoice(settings.level, set('level', saveLevel)) : null,
          settings.players === 1 ? choice(`How tricky is ${robotName()}?`, settings.bot, BOTS, set('bot')) : null,
          choice(love ? 'Hearts to fill' : 'Hearts each', settings.hearts, HEARTS.map((n) => [n, String(n)]), set('hearts')),
        ];
      },
    });
  }

  function setup() {
    sc.dispose();
    sc = scope();
    const love = settings.theme === 'love';
    root.replaceChildren(
      el('div', { class: 'zt-setup bt-setup' },
        el('h2', {}, love ? '💗 Battle Buddies' : '🛡️ Battle Buddies'),
        el('p', { class: 'prompt' }, !love ? 'Take turns answering. Get yours right and your buddy sends a sparkle that pops a heart!'
          : settings.play === 'together' ? 'Take turns answering. Every right answer floats a heart into the love meter. Fill it together!'
            : 'Take turns answering. Get yours right and a heart floats into your love meter. Fill it first!'),
        seg('Players', 'players', [[1, `1 player (vs ${BOT_FACE})`], [2, '2 players']]),
        avatarRow(0),
        settings.players === 2 ? avatarRow(1) : null,
        seg('Theme', 'theme', [['love', '💗 Love meter'], ['battle', '⚔️ Battle']]),
        optionsButton({ summary: summary(), onOpen: openMore }),
        el('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Start!'),
      ),
    );
  }

  function start() {
    sc.dispose();
    sc = scope();
    const { later } = sc;
    const next = problems(entries, settings.mode, settings.level);
    const vsBot = settings.players === 1;
    const sides = [
      { name: vsBot ? 'You' : 'Player 1', face: settings.avatars[0], hearts: settings.hearts, bot: false },
      vsBot ? { name: robotName(), face: BOT_FACE, hearts: settings.hearts, bot: true }
        : { name: 'Player 2', face: settings.avatars[1], hearts: settings.hearts, bot: false },
    ];
    let turn = 0;
    const love = settings.theme === 'love';
    const together = love && settings.play === 'together';
    const goal = together ? settings.hearts * 2 : settings.hearts; // Together: about as many turns as a race
    let shared = 0;
    sides.forEach((s) => { s.love = 0; });
    const meter = (n, label) => el('div', { class: 'bt-hearts bt-meter', 'aria-label': label },
      Array.from({ length: n }, () => el('span', { class: 'bt-heart' }, '🤍')));

    const fighter = (s, i) => {
      s.heartsEl = love ? (together ? null : meter(goal, `${s.name}: love meter`))
        : el('div', { class: 'bt-hearts', 'aria-label': `${s.name}: hearts` },
          Array.from({ length: settings.hearts }, () => el('span', { class: 'bt-heart' }, '❤️')));
      s.faceEl = el('div', { class: 'bt-face' }, s.face);
      s.el = el('div', { class: `bt-side s${i}`, 'data-hearts': love ? null : s.hearts, 'data-love': love && !together ? 0 : null },
        s.heartsEl, el('div', { class: 'bt-ava' }, s.faceEl), el('div', { class: 'bt-name' }, s.name));
      return s.el;
    };
    const sharedEl = together ? meter(goal, 'Our love meter') : null;
    if (sharedEl) { sharedEl.classList.add('bt-shared'); sharedEl.dataset.love = 0; }
    const arena = el('div', { class: 'bt-arena' + (love ? ' love' : '') }, fighter(sides[0], 0),
      el('div', { class: 'bt-vs' }, love ? '💞' : 'VS'), fighter(sides[1], 1));
    const panel = el('div', { class: 'bt-panel' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const say = (t) => { msg.textContent = t; };
    root.replaceChildren(el('div', { class: 'bt' }, arena, sharedEl, panel));
    hooks.state = () => ({ turn, hearts: sides.map((s) => s.hearts), love: sides.map((s) => s.love), shared, goal, theme: settings.theme, play: settings.play });

    const whose = (s) => (s.name === 'You' ? 'Your turn' : `${s.name}’s turn`);
    const status = (s) => el('div', { class: 'bt-status' }, el('span', { class: 'bt-mini' }, s.face), whose(s));
    sides.forEach((s, i) => s.el.classList.toggle('on', i === turn));

    // Before each person's turn: a tap, so the spelling word can be spoken (iOS).
    function intro() {
      const s = sides[turn];
      sides.forEach((x, i) => x.el.classList.toggle('on', i === turn));
      say('');
      if (s.bot) {
        panel.replaceChildren(status(s), el('p', { class: 'prompt bt-think' }, 'Thinking…'), msg);
        later(botTurn, ms(900));
        return;
      }
      panel.replaceChildren(status(s), el('button', { class: 'btn primary big bt-go', type: 'button', onclick: humanTurn }, '▶ Go!'), msg);
    }

    function humanTurn() {
      const s = sides[turn];
      const p = next();
      panel.replaceChildren(status(s), ask({
        problem: p, entries, later, onLeave: sc.onLeave,
        done: ({ ok, firstTry }) => {
          if (vsBot) noteResult(p.kind === 'spell' ? 'spell' : `math:${settings.level}`, ok ? (firstTry ? 1 : 0.5) : 0);
          if (ok) hit(turn, cheer(p.kind === 'spell' ? 'spell' : opKind(p.text)));
          else { say(love ? 'No heart this time.' : 'No sparkle this time.'); pass(); }
        },
      }), msg);
    }

    // The computer types its answer one key at a time, then it's checked like anyone's.
    function botTurn() {
      const s = sides[turn];
      const p = next();
      const key = p.kind === 'spell' ? 'spell' : `math:${settings.level}`;
      const ok = hooks.botNext != null ? hooks.botNext : Math.random() < botChance(skillOf(key), settings.bot);
      hooks.botNext = null;
      const right = p.kind === 'spell' ? p.entry.word : String(p.answer);
      const slip = ok ? null : p.kind === 'spell' ? { value: spellingSlip(right, listWords) } : mathSlip(p.text, p.answer);
      const wrote = ok ? right : String(slip.value);
      const typed = el('div', { class: 'typed bt-typed' }, ' ');
      panel.replaceChildren(status(s),
        p.kind === 'spell' ? el('p', { class: 'prompt' }, `${s.name} is spelling a word…`) : el('div', { class: 'bigword' }, `${p.text} = ?`),
        typed, msg);
      let n = 0;
      const tick = () => {
        typed.textContent = wrote.slice(0, ++n);
        if (n < wrote.length) return later(tick, ms(220));
        later(() => {
          if (ok) {
            typed.classList.add('good');
            if (p.kind === 'spell') typed.textContent = right;
            return hit(turn, `${s.name} got it!`);
          }
          // Show what went wrong, kindly: the letters that differ, or why the sum slipped.
          typed.classList.add('bt-oops');
          if (p.kind === 'spell') {
            typed.replaceChildren(...compare(wrote, right));
            say(`Oops! ${s.name} wrote “${wrote}”. It’s spelled ${right}.`);
          } else {
            say(`Oops! ${s.name} wrote ${wrote}: ${slip.why}. ${p.text} = ${right}.`);
          }
          pass(true);
        }, ms(500));
      };
      later(tick, ms(400));
    }

    function hit(from, line) {
      if (love) return fill(from, line);
      const to = 1 - from;
      say(line);
      fly('✨', sides[from].faceEl, sides[to].faceEl, () => {
        const d = sides[to];
        d.hearts--;
        d.el.dataset.hearts = d.hearts;
        const h = d.heartsEl.children[d.hearts];
        if (h) { h.classList.add('pop'); h.textContent = '🤍'; }
        d.faceEl.classList.remove('hit');
        void d.faceEl.offsetWidth; // restart the wobble
        d.faceEl.classList.add('hit');
        if (d.hearts <= 0) return later(() => win(from), ms(700));
        pass();
      });
    }

    // Next person: a button (a tap starts their turn), except before the computer's turn.
    function pass(afterBot) {
      turn = 1 - turn;
      const s = sides[turn];
      if (s.bot) return later(intro, ms(1200));
      const label = afterBot || vsBot ? 'Your turn ➜' : `${s.name}’s turn ➜`;
      panel.append(el('button', { class: 'btn primary big bt-next', type: 'button', onclick: () => { intro(); humanTurn(); } }, label));
    }

    // Love meter: a heart floats from the buddy into the next empty spot of their meter (or the shared one).
    function fill(from, line) {
      say(line);
      const s = sides[from];
      const box = together ? sharedEl : s.heartsEl;
      const n = together ? shared : s.love;
      const spot = box.children[n];
      fly('💗', s.faceEl, spot, () => {
        if (together) { shared++; sharedEl.dataset.love = shared; } else { s.love++; s.el.dataset.love = s.love; }
        spot.textContent = '💗';
        spot.classList.add('pop');
        s.faceEl.classList.remove('happy');
        void s.faceEl.offsetWidth;
        s.faceEl.classList.add('happy');
        if ((together ? shared : s.love) >= goal) return later(() => (together ? hugWin() : win(from)), ms(700));
        pass();
      });
    }

    // Something flies from one element to another (its own element, so the buddies' styles never change mid-flight).
    function fly(glyph, fromEl, toEl, cb) {
      if (still() || !arena.animate) return later(cb, ms(300));
      const host = root.querySelector('.bt');
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(), box = host.getBoundingClientRect();
      const zap = el('div', { class: 'bt-zap', 'aria-hidden': 'true' }, glyph);
      host.append(zap);
      const x0 = a.left + a.width / 2 - box.left, y0 = a.top + a.height / 2 - box.top;
      const x1 = b.left + b.width / 2 - box.left, y1 = b.top + b.height / 2 - box.top;
      const lift = Math.min(80, box.height / 3);
      zap.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.6)` },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1.3)` },
        { transform: `translate(${x1}px, ${y1}px) scale(1)` },
      ], { duration: ms(650), easing: 'ease-in-out' });
      later(() => { zap.remove(); cb(); }, ms(650));
    }

    function win(w) {
      const s = sides[w];
      const botWon = s.bot;
      const title = love ? (botWon ? `${s.name} filled the love meter first!` : vsBot ? 'You filled your love meter!' : `${s.name} filled the love meter!`)
        : botWon ? `${s.name} wins this time!` : vsBot ? 'You win!' : `${s.name} wins!`;
      const line = love ? (botWon ? 'So close! Play again?' : vsBot ? `${sides[1].name} says “Thank you for all the hearts!”` : 'Lovely playing, both of you!')
        : botWon ? 'That was a close one. Rematch?' : vsBot ? `Great battle! ${sides[1].name} says “Well played!”` : 'Great battle, both of you!';
      panel.replaceChildren(
        el('div', { class: 'finish bt-finish' },
          el('div', { class: 'big-emoji' }, s.face, botWon ? '' : love ? '💖' : '🏆'),
          el('h2', {}, title),
          el('p', { class: 'prompt' }, line),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big', type: 'button', onclick: start }, love ? 'Play again' : 'Rematch'),
            el('button', { class: 'btn big', type: 'button', onclick: setup }, 'Change buddies'),
            el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
          ),
        ),
      );
      if (!botWon) celebrate(root);
    }

    // Together: everyone filled the meter, so everyone gets the celebration.
    function hugWin() {
      panel.replaceChildren(
        el('div', { class: 'finish bt-finish' },
          el('div', { class: 'big-emoji' }, sides[0].face, '💖', sides[1].face),
          el('h2', {}, 'You filled the love meter together!'),
          el('p', { class: 'prompt' }, vsBot ? `${sides[1].name} says “What a team!”` : 'What a team!'),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Play again'),
            el('button', { class: 'btn big', type: 'button', onclick: setup }, 'Change buddies'),
            el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'),
          ),
        ),
      );
      celebrate(root);
    }

    intro();
  }

  setup();
  return () => { sc.dispose(); if (pop) pop.dispose(); delete root.__battle; };
}

// Letters of what was written, marked where they differ from the right spelling (same idea as LCWC).
function compare(wrote, right) {
  return [...wrote].map((c, i) => el('span', { class: c === right[i] ? 'ok' : 'off' }, c));
}
