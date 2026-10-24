// Guess What (issue #57): Guess Who? with this week's words. The computer hides one word; she asks yes/no
// questions about how it SOUNDS (beats, first sound, last sound, vowel sound) and puts down the words that
// no longer fit, until she can name it. "Take turns" also has the computer guess her word, asking her the
// same kind of questions. Questions are buttons, never typed; answers come from js/sounds.js (CMU dictionary).
import { el, speak, speakWord, chooseWords, celebrate, scope, award, cheer } from '../util.js';
import { loadSounds, knowsSound, splitting, answer, FAMILIES } from '../sounds.js';

const OPTS_KEY = 'spelling-games.guesswhat.options';
const FAST_KEY = 'spelling-games.guesswhat.fast'; // '1' = short pauses (tests)
export const BOARD = 12; // cards on the board
const MIN_WORDS = 4;
const DEFAULTS = { play: 'solo', flip: 'me' };

function loadOptions() {
  let o = { ...DEFAULTS };
  try { o = { ...o, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') }; } catch { /* ignore */ }
  if (!['solo', 'turns'].includes(o.play)) o.play = DEFAULTS.play;
  if (!['me', 'auto'].includes(o.flip)) o.flip = DEFAULTS.flip;
  return o;
}
function saveOptions(o) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify({ play: o.play, flip: o.flip })); } catch { /* ignore */ }
}
function robotName() {
  try { return (localStorage.getItem('spelling-games.robot.name') || '').trim() || 'Robo'; } catch { return 'Robo'; }
}
const fast = () => { try { return localStorage.getItem(FAST_KEY) === '1'; } catch { return false; } };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 'c|a|ke' -> "c<mark>a</mark>ke"
function marked(spec) {
  const [pre, mid, post] = spec.split('|');
  return [pre, el('mark', {}, mid), post];
}
const qLabel = (q) => (q.spec ? marked(q.spec) : q.label);
// replaceChildren prints null as text and arrays as commas: drop the empty slots first.
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter(Boolean));

export function mount(root, entries, api) {
  let sc = scope();
  let alive = true;
  const settings = loadOptions();
  const bot = robotName();
  const ms = (n) => (fast() ? Math.round(n / 8) : n);
  const hooks = {};
  root.__gw = hooks;

  root.replaceChildren(el('p', { class: 'note' }, 'Getting the word sounds ready…'));
  loadSounds().then(() => { if (alive) setup(); });

  const seg = (label, key, opts) =>
    el('div', { class: 'seg' },
      el('p', { class: 'label' }, label),
      el('div', { class: 'row' },
        opts.map(([val, text]) =>
          el('button', {
            class: 'btn' + (settings[key] === val ? ' primary' : ''), type: 'button', 'aria-pressed': String(settings[key] === val),
            'data-opt': `${key}:${val}`,
            onclick: () => { settings[key] = val; saveOptions(settings); setup(); },
          }, text),
        ),
      ),
    );

  function setup() {
    sc.dispose();
    sc = scope();
    const known = entries.filter((e) => knowsSound(e.word));
    if (known.length < MIN_WORDS) {
      root.replaceChildren(el('p', { class: 'note' },
        `Guess What needs at least ${MIN_WORDS} words it knows how to say. This list has ${known.length}.`));
      return;
    }
    root.replaceChildren(
      el('div', { class: 'zt-setup gw-setup' },
        el('h2', {}, '❓ Guess What'),
        el('p', { class: 'prompt' }, 'The computer hides one of your words. Ask how it sounds, put down the words that don’t fit, and find it!'),
        seg('Play', 'play', [['solo', '🔎 Just me'], ['turns', `🤖 Take turns with ${bot}`]]),
        seg('Putting cards down', 'flip', [['me', '✋ I do it'], ['auto', '🪄 Help me']]),
        el('button', { class: 'btn primary big gw-start', type: 'button', onclick: () => start(known) }, 'Start!'),
      ),
    );
  }

  function start(known) {
    sc.dispose();
    sc = scope();
    const { later } = sc;
    const words = chooseWords(known, BOARD).map((e) => e.word).sort();
    const turns = settings.play === 'turns';
    const st = {
      phase: turns ? 'pick' : 'ask',
      secret: pick(words), // the computer's word
      mine: null, // her word (Take turns)
      possible: new Set(words), // words still consistent with the computer's answers
      down: new Set(), // cards she has put down
      botPossible: new Set(words),
      pending: new Set(), // put down during this flip, not yet checked
      tries: 0,
      q: null,
      tab: FAMILIES[0].id,
    };
    hooks.state = () => ({ ...st, possible: [...st.possible], down: [...st.down], botPossible: [...st.botPossible], pending: [...st.pending], words });
    const cards = new Map();
    const board = el('div', { class: 'gw-board' },
      words.map((w) => {
        const c = el('button', { class: 'gw-card', type: 'button', 'data-w': w, onclick: () => cardTap(w) }, w);
        cards.set(w, c);
        return c;
      }));
    const history = el('div', { class: 'gw-history', 'aria-label': 'Questions so far' });
    const top = el('div', { class: 'gw-top' });
    const panel = el('div', { class: 'gw-panel' });
    const msg = el('div', { class: 'msg', 'aria-live': 'polite' });
    const say = (t) => { msg.textContent = t; };
    root.replaceChildren(el('div', { class: 'gw' }, top, board, history, panel));

    function paint() {
      for (const [w, c] of cards) {
        c.classList.toggle('down', st.down.has(w) || st.pending.has(w));
        c.classList.toggle('mine', w === st.mine);
      }
      put(top,
        st.mine ? el('button', { class: 'btn gw-mine', type: 'button', onclick: () => speakWord(st.mine) }, 'Your word: ', el('b', {}, st.mine), ' 🔊') : null,
        turns && st.mine ? el('div', { class: 'gw-bot', 'aria-label': `${bot}'s cards` },
          el('span', { class: 'gw-bot-face' }, '🤖'),
          words.map((w) => el('span', { class: 'gw-bot-tile' + (st.botPossible.has(w) ? '' : ' down') }))) : null,
      );
    }
    function addHistory(q, yes, who) {
      const fam = FAMILIES.find((f) => f.id === q.family);
      history.prepend(el('span', { class: 'gw-chip' + (who ? ' bot' : '') },
        who ? '🤖 ' : '', q.spec ? fam.tab.split(' ')[0] + ' ' : '', qLabel(q), yes ? ' · Yes' : ' · No'));
      while (history.children.length > 8) history.lastChild.remove();
    }

    function cardTap(w) {
      speakWord(w);
      if (st.phase === 'pick') {
        st.mine = w;
        st.secret = pick(words.filter((x) => x !== w)); // a different word, so the two words never get mixed up
        paint();
        say(`Your secret word is ${w}. ${bot} will try to guess it!`);
        put(panel, msg, el('button', { class: 'btn primary big gw-next', type: 'button', onclick: herTurn }, '▶ Your turn'));
        return;
      }
      if (st.phase === 'flip' && !st.down.has(w)) {
        if (st.pending.has(w)) st.pending.delete(w); else st.pending.add(w);
        paint();
        return;
      }
      if (st.phase === 'guess' && !st.down.has(w)) guess(w);
    }

    // ---- her turn: pick a question
    function herTurn() {
      st.phase = 'ask';
      st.q = null;
      say('');
      paint();
      if (st.possible.size === 1 || splitting([...st.possible]).length === 0) return guessMode(true);
      askPanel();
    }
    function askPanel() {
      const qs = splitting([...st.possible]);
      const fams = FAMILIES.filter((f) => qs.some((q) => q.family === f.id));
      if (!fams.some((f) => f.id === st.tab)) st.tab = fams[0].id;
      const fam = FAMILIES.find((f) => f.id === st.tab);
      put(panel,
        el('div', { class: 'row gw-tabs' },
          FAMILIES.map((f) => el('button', {
            class: 'btn gw-tab' + (f.id === st.tab ? ' primary' : ''), type: 'button', 'data-tab': f.id,
            disabled: !fams.includes(f), onclick: () => { st.tab = f.id; askPanel(); },
          }, f.tab))),
        el('p', { class: 'prompt' }, fam.head),
        el('div', { class: 'row gw-qs' },
          qs.filter((q) => q.family === st.tab).map((q) =>
            el('button', { class: 'btn gw-q', type: 'button', 'data-q': q.id, onclick: () => ask(q) }, qLabel(q)))),
        el('div', { class: 'row' },
          el('button', { class: 'btn gw-know', type: 'button', onclick: () => guessMode(false) }, '💡 I know it!')),
        msg,
      );
    }
    function ask(q) {
      const yes = answer(q, st.secret);
      speak(`${q.ask('your word')} ... ${yes ? 'Yes!' : 'No.'}`);
      st.q = { q, yes };
      addHistory(q, yes, false);
      st.possible = new Set([...st.possible].filter((w) => answer(q, w) === yes));
      st.phase = 'flip';
      st.pending.clear();
      st.tries = 0;
      const what = yes ? `Yes! Put down the words that don’t ${q.fits}.` : `No. Put down the words that ${q.fits}.`;
      if (settings.flip === 'auto') {
        say(what.replace('Put down', 'Down go'));
        for (const w of words) if (!st.possible.has(w) && !st.down.has(w)) st.down.add(w);
        paint();
        put(panel, msg, el('button', { class: 'btn primary big gw-done', type: 'button', onclick: afterFlip }, '▶ Next'));
        award();
        return;
      }
      say(what);
      paint();
      put(panel, msg,
        el('p', { class: 'gw-hint' }, 'Tap a word to hear it and put it down. Tap again to stand it up.'),
        el('button', { class: 'btn primary big gw-done', type: 'button', onclick: checkFlip }, '✔ Done'));
    }
    // She put cards down: stand up any that still fit, then check nothing was missed.
    function checkFlip() {
      const { q, yes } = st.q;
      const upAgain = [...st.pending].filter((w) => st.possible.has(w));
      if (upAgain.length) {
        upAgain.forEach((w) => st.pending.delete(w));
        paint();
        const w = upAgain[0];
        speak(`${w}.`);
        say(`Listen: “${w}” ${yes ? 'does' : 'doesn’t'} ${q.fits}, so it stays up.`);
        upAgain.forEach((x) => cards.get(x).classList.add('nudge'));
        later(() => upAgain.forEach((x) => cards.get(x).classList.remove('nudge')), 900);
        return;
      }
      const missed = words.filter((w) => !st.possible.has(w) && !st.down.has(w) && !st.pending.has(w));
      if (missed.length && st.tries === 0) {
        st.tries++;
        say(`Look again: ${missed.length === 1 ? 'one more word' : 'some more words'} can go down.`);
        return;
      }
      for (const w of st.pending) st.down.add(w);
      st.pending.clear();
      if (missed.length) {
        missed.forEach((w) => { st.down.add(w); cards.get(w).classList.add('nudge'); });
        say(`${missed.join(', ')} ${missed.length === 1 ? 'goes' : 'go'} down too.`);
        later(() => missed.forEach((w) => cards.get(w).classList.remove('nudge')), 900);
      } else say(cheer());
      paint();
      award();
      st.phase = 'wait';
      later(afterFlip, ms(missed.length ? 1600 : 700));
    }
    function afterFlip() {
      if (st.possible.size === 1) return guessMode(true);
      if (turns) return botIntro();
      herTurn();
    }

    // ---- guessing
    function guessMode(forced) {
      st.phase = 'guess';
      paint();
      const one = st.possible.size === 1;
      say(one ? 'Only one word left. Tap it!' : forced ? 'These words sound alike to the questions. Tap the one you think it is!' : 'Tap the word you think it is.');
      put(panel, msg, forced ? null
        : el('button', { class: 'btn gw-back', type: 'button', onclick: herTurn }, '↩ Ask another question'));
    }
    function guess(w) {
      if (w === st.secret) return over(true);
      speak('Not that one.');
      st.down.add(w);
      st.possible.delete(w);
      paint();
      say(`Not ${w}!`);
      st.phase = 'wait';
      put(panel, msg);
      later(() => (turns ? botIntro() : herTurn()), ms(900));
    }

    // ---- the computer's turn (Take turns): it asks about her word
    function botIntro() {
      st.phase = 'bot';
      paint();
      put(panel, el('p', { class: 'prompt' }, `🤖 ${bot}’s turn`),
        el('button', { class: 'btn primary big gw-botgo', type: 'button', onclick: botTurn }, `▶ Hear ${bot}’s question`));
    }
    function botTurn() {
      const left = [...st.botPossible];
      const qs = splitting(left);
      if (left.length === 1 || !qs.length) return botGuess(pick(left));
      const q = pick(qs);
      const truth = answer(q, st.mine);
      let misses = 0;
      speak(`${q.ask('your word')}`);
      const reply = (yes) => {
        if (yes !== truth && misses === 0) {
          misses++;
          speak(`Listen again. ${st.mine}. ${q.ask('your word')}`);
          say(`Hmm, say “${st.mine}” out loud and listen again.`);
          return;
        }
        award();
        say(yes === truth ? cheer() : `It’s ${truth ? 'yes' : 'no'}: “${st.mine}” ${truth ? 'does' : 'doesn’t'} ${q.fits}.`);
        st.botPossible = new Set(left.filter((w) => answer(q, w) === truth));
        addHistory(q, truth, true);
        paint();
        put(panel, msg, el('button', { class: 'btn primary big gw-next', type: 'button', onclick: herTurn }, '▶ Your turn'));
      };
      say('');
      put(panel,
        el('p', { class: 'prompt gw-botq' }, `🤖 ${q.ask('your word')}`),
        el('div', { class: 'row' },
          el('button', { class: 'btn big gw-yes', type: 'button', onclick: () => reply(true) }, '👍 Yes'),
          el('button', { class: 'btn big gw-no', type: 'button', onclick: () => reply(false) }, '👎 No')),
        msg);
    }
    function botGuess(w) {
      speak(`Is your word ${w}?`);
      if (w === st.mine) return over(false);
      st.botPossible.delete(w);
      paint();
      say(`${bot} guessed “${w}”. Not it!`);
      put(panel, msg, el('button', { class: 'btn primary big gw-next', type: 'button', onclick: herTurn }, '▶ Your turn'));
    }

    function over(won) {
      st.phase = 'over';
      for (const [w, c] of cards) c.classList.toggle('found', w === st.secret);
      paint();
      const again = el('div', { class: 'row' },
        el('button', { class: 'btn primary big gw-again', type: 'button', onclick: () => start(known) }, 'Play again'),
        el('button', { class: 'btn big', type: 'button', onclick: api.home }, 'Home'));
      if (won) {
        speak(`Yes! It was ${st.secret}!`);
        put(panel, el('p', { class: 'prompt gw-end' }, `🎉 You found it: ${st.secret}!`), again);
        celebrate(root);
      } else {
        put(panel, el('p', { class: 'prompt gw-end' }, `🤖 ${bot} guessed your word, ${st.mine}! ${bot}’s word was ${st.secret}.`), again);
      }
    }

    paint();
    if (turns) {
      put(panel, el('p', { class: 'prompt' }, `Pick your secret word. ${bot} will try to guess it!`), msg);
    } else herTurn();
  }

  return () => { alive = false; sc.dispose(); };
}
