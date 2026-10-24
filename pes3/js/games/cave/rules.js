// Crystal Cave rules (issue #61). No DOM: the game state is plain JSON (it is saved as it is), and every
// function here works on it, so the tests can drive whole games without the screen.
import { TILES, TREASURE, KIND, QUESTS, START } from './deck.js';

export const KINDS = ['power', 'wisdom', 'magic']; // card kinds; power = math, wisdom = spelling, magic = either
export const SUBJECT = { power: 'math', wisdom: 'spell', magic: 'either', treasure: 'either' };
export const TIER = { green: 1, gray: 2, red: 3 };

// Heroes: the four types players pick from. Each starts with one card of its kind.
export const HEROES = [
  { id: 'viking', name: 'Brynja', title: 'the brave viking', start: 'power' },
  { id: 'knight', name: 'Sir Pip', title: 'the clever knight', start: 'power' },
  { id: 'elf', name: 'Fern', title: 'the quick elf', start: 'wisdom' },
  { id: 'wizard', name: 'Ziggy', title: 'the young wizard', start: 'magic' },
];
export const heroOf = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

// Boards: one digit per square = its room. Rooms in `red` get red tiles; the rest get green and gray.
// doors = [x1, y1, x2, y2] pairs of neighbouring squares in different rooms that you can walk between.
// The way in is below the bottom-left square. Long matches the board game's 42 tiles (12 green, 12 gray, 18 red).
export const LAYOUTS = {
  short: {
    name: 'Short', grid: ['1444', '1444', '2233', '2233'], red: [4],
    doors: [[0, 1, 0, 2], [1, 3, 2, 3], [0, 0, 1, 0], [2, 2, 2, 1]],
  },
  medium: {
    name: 'Medium', grid: ['11255', '11255', '33266', '33466', '33466'], red: [5, 6],
    doors: [[0, 1, 0, 2], [1, 0, 2, 0], [1, 3, 2, 3], [2, 2, 2, 3], [2, 1, 3, 1], [2, 4, 3, 4], [4, 1, 4, 2]],
  },
  long: {
    name: 'Long', grid: ['1122777', '1122777', '1122666', '3344666', '3344555', '3344555'], red: [5, 6, 7],
    doors: [[0, 2, 0, 3], [1, 0, 2, 0], [1, 4, 2, 4], [3, 2, 3, 3], [3, 5, 4, 5], [3, 1, 4, 1], [5, 3, 5, 4], [6, 1, 6, 2], [3, 3, 4, 3]],
  },
};

const shuffle = (a, rnd = Math.random) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};
const expand = (rows) => rows.flatMap(({ count = 1, ...row }) => Array.from({ length: count }, () => ({ ...row })));

export function boardOf(layoutId) {
  const L = LAYOUTS[layoutId] || LAYOUTS.short;
  const rows = L.grid.length, cols = L.grid[0].length;
  const cells = [];
  L.grid.forEach((line, y) => [...line].forEach((ch, x) => cells.push({ x, y, room: +ch })));
  return { cols, rows, cells, doors: L.doors, red: L.red, entry: (rows - 1) * cols };
}
const idx = (b, x, y) => (x < 0 || y < 0 || x >= b.cols || y >= b.rows ? -1 : y * b.cols + x);
const isDoor = (b, a, c) => b.doors.some(([x1, y1, x2, y2]) => {
  const p = idx(b, x1, y1), q = idx(b, x2, y2);
  return (p === a && q === c) || (p === c && q === a);
});
// Squares you can step to from square i: up/down/left/right, inside the room or through a door.
export function neighbours(b, i) {
  const { x, y, room } = b.cells[i];
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => idx(b, x + dx, y + dy))
    .filter((j) => j >= 0 && (b.cells[j].room === room || isDoor(b, i, j)));
}
// Which sides of square i have a wall (for drawing): {t, r, b, l}.
export function walls(b, i) {
  const { x, y, room } = b.cells[i];
  const side = (dx, dy) => {
    const j = idx(b, x + dx, y + dy);
    if (j < 0) return true;
    return b.cells[j].room !== room && !isDoor(b, i, j);
  };
  return { t: side(0, -1), r: side(1, 0), b: side(0, 1), l: side(-1, 0) };
}

// players: [{name, hero, human, me, spell, math}] in seat order (seat 0 is her). Returns the saved game state.
export function newGame({ players, layout = 'short', bot = 'right', rnd = Math.random }) {
  const b = boardOf(layout);
  const pools = {};
  for (const color of ['green', 'gray', 'red']) pools[color] = shuffle(expand(TILES.filter((t) => t.color === color)), rnd);
  const redCells = b.cells.map((c, i) => i).filter((i) => b.red.includes(b.cells[i].room));
  const easyCells = b.cells.map((c, i) => i).filter((i) => !b.red.includes(b.cells[i].room));
  const easyColors = shuffle(easyCells.map((_, k) => (k % 2 === 0 ? 'green' : 'gray')), rnd);
  const tiles = b.cells.map((c) => ({ x: c.x, y: c.y, room: c.room, color: null, card: null, state: 'down' }));
  let id = 0;
  const deal = (i, color) => {
    let card = pools[color].pop();
    if (!card) { pools[color] = shuffle(expand(TILES.filter((t) => t.color === color)), rnd); card = pools[color].pop(); }
    tiles[i].color = color;
    tiles[i].card = { ...card, id: ++id };
  };
  easyCells.forEach((i, k) => deal(i, easyColors[k]));
  redCells.forEach((i) => deal(i, 'red'));

  const humans = players.filter((p) => p.human).length;
  const st = {
    v: 1, layout, bot, coop: humans <= 1, turn: 0, final: null, over: false, turns: 0,
    tiles,
    bag: shuffle(expand(TREASURE), rnd),
    kindDeck: shuffle(expand(KIND), rnd),
    questDeck: shuffle(expand(QUESTS), rnd),
    players: players.map((p) => ({
      name: p.name, hero: p.hero, human: !!p.human, me: !!p.me, spell: p.spell || 'list', math: p.math || 't10',
      hearts: START.hearts, cards: { power: 0, wisdom: 0, magic: 0 }, skip: false, at: null,
      gain: { monsters: 0, items: 0, treasure: 0, quests: 0, kind: 0 },
      scared: 0, gems: [], found: [], kindCards: 0, quest: null, done: [],
    })),
  };
  for (const p of st.players) { p.cards[heroOf(p.hero).start]++; p.quest = st.questDeck.pop() || null; }
  st.goal = goals(st);
  return st;
}

// Team targets for the cooperative game (bronze, silver, gold). From 300 simulated computer-only games per
// size (answers right 70% of the time) the team scores about E = 0.7 × board + (players − 1) × (3 + 0.09 × board),
// where board = monster + gem stars + 1.75 per treasure draw. Bronze 0.8 E, silver E, gold 1.15 E: guesses
// until tried with her (a real player who answers better scores higher).
export function goals(st) {
  let board = 0;
  for (const t of st.tiles) {
    const c = t.card;
    if (c.kind === 'monster' || c.kind === 'item') board += c.stars;
    board += 1.75 * ((c.gives && c.gives.treasure) || 0);
  }
  const e = 0.7 * board + (st.players.length - 1) * (3 + 0.09 * board);
  return [0.8, 1, 1.15].map((f) => Math.max(1, Math.round(e * f)));
}

export const opened = (t) => t.state !== 'down';
// Face-down squares you may explore: next to an explored square (or the way in), never through a wall.
export function explorable(st) {
  const b = boardOf(st.layout);
  const out = [];
  st.tiles.forEach((t, i) => {
    if (t.state !== 'down') return;
    if (i === b.entry || neighbours(b, i).some((j) => opened(st.tiles[j]))) out.push(i);
  });
  return out;
}
// Revealed bad guys and gems still waiting.
export const waiting = (st, kind) => st.tiles.map((t, i) => i).filter((i) => st.tiles[i].state === 'up' && (!kind || st.tiles[i].card.kind === kind));

// What's still missing to pay `needs` from `cards`: {power, wisdom, magic, any, total}.
export function shortfall(cards, needs) {
  const miss = { power: 0, wisdom: 0, magic: 0, any: 0, total: 0 };
  let spare = 0;
  for (const k of KINDS) {
    const n = needs[k] || 0, have = cards[k] || 0;
    miss[k] = Math.max(0, n - have);
    spare += Math.max(0, have - n);
  }
  miss.any = Math.max(0, (needs.any || 0) - spare);
  miss.total = miss.power + miss.wisdom + miss.magic + miss.any;
  return miss;
}
export const canPay = (cards, needs) => shortfall(cards, needs).total === 0;
// Spends the cards (the "any" part from whatever kind you have most of). Returns what was spent.
export function pay(cards, needs) {
  const spent = { power: 0, wisdom: 0, magic: 0 };
  for (const k of KINDS) { const n = needs[k] || 0; cards[k] -= n; spent[k] += n; }
  for (let a = needs.any || 0; a > 0; a--) {
    const k = KINDS.reduce((m, x) => (cards[x] > cards[m] ? x : m), 'power');
    cards[k]--; spent[k]++;
  }
  return spent;
}
export const cardCount = (p) => KINDS.reduce((n, k) => n + p.cards[k], 0);
// A card kind that would help with `miss` (a missing kind first, else any kind for an "any" gap).
export function usefulKind(cards, miss) {
  for (const k of KINDS) if (miss[k] > 0 && cards[k] > 0) return k;
  if (miss.any > 0) return KINDS.reduce((m, x) => (cards[x] > cards[m] ? x : m), 'power');
  return null;
}
export const canGive = (cards, miss) => { const k = usefulKind(cards, miss); return !!k && cards[k] > 0; };

// Helpers are asked counter-clockwise, starting with the player before you (as in the board game).
export function helpOrder(st, i) {
  const n = st.players.length;
  return Array.from({ length: n - 1 }, (_, k) => (i - 1 - k + n * 2) % n);
}
// One card from helper h to player i; the helper takes a Kind Kid card. Returns {kind, kid}.
export function give(st, h, i, kind) {
  const from = st.players[h], to = st.players[i];
  from.cards[kind]--;
  to.cards[kind]++;
  return { kind, kid: drawKind(st, h) };
}

export function drawTreasure(st, i) {
  const t = st.bag.pop();
  if (!t) return null;
  const p = st.players[i];
  p.found.push(t);
  p.gain.treasure += t.stars;
  return t;
}
// A Kind Kid card, used at once: a heart, a card of the kind you have fewest of, a star, or a treasure.
export function drawKind(st, i) {
  const k = st.kindDeck.pop();
  const p = st.players[i];
  p.kindCards++;
  if (!k) return { name: 'Kind Kid', effect: 'none' };
  const out = { name: k.name, effect: k.effect };
  if (k.effect === 'heart') p.hearts = Math.min(START.maxHearts, p.hearts + 1);
  else if (k.effect === 'card') { const kind = KINDS.reduce((m, x) => (p.cards[x] < p.cards[m] ? x : m), 'power'); p.cards[kind]++; out.kind = kind; }
  else if (k.effect === 'star') p.gain.kind += 1;
  else if (k.effect === 'treasure') out.treasure = drawTreasure(st, i);
  return out;
}

// Not scared away: lose a heart. With none left you rest next turn and get one heart back (board game rule).
export function loseHeart(st, i) {
  const p = st.players[i];
  if (p.hearts > 0) { p.hearts--; return 'heart'; }
  p.skip = true;
  p.hearts = 1;
  return 'rest';
}
export function scare(st, i, tileIndex) {
  const t = st.tiles[tileIndex], p = st.players[i];
  pay(p.cards, t.card.needs);
  p.scared++;
  p.gain.monsters += t.card.stars;
  t.state = 'done';
  t.by = i;
}
export function buy(st, i, tileIndex) {
  const t = st.tiles[tileIndex], p = st.players[i];
  pay(p.cards, t.card.needs);
  p.gems.push(t.card.name);
  p.gain.items += t.card.stars;
  t.state = 'done';
  t.by = i;
}

export function questDone(p) {
  const q = p.quest;
  if (!q) return false;
  const have = { ...p.cards, cards: cardCount(p), scared: p.scared, kind: p.kindCards, treasure: p.found.length, gems: p.gems.length, hearts: p.hearts };
  return Object.entries(q.need).every(([k, n]) => (have[k] || 0) >= n);
}
// At the end of your turn: one quest at most; then a new one if any are left.
export function checkQuest(st, i) {
  const p = st.players[i];
  if (!questDone(p)) return null;
  const q = p.quest;
  p.done.push(q.name);
  p.gain.quests += q.stars;
  p.quest = st.questDeck.pop() || null;
  return q;
}

export function score(p) {
  const hearts = p.hearts * START.heartStars;
  const g = p.gain;
  return { total: g.monsters + g.items + g.treasure + g.quests + g.kind + hearts, ...g, hearts };
}
export const teamScore = (st) => st.players.reduce((n, p) => n + score(p).total, 0);
export function medal(st) {
  const s = teamScore(st);
  return s >= st.goal[2] ? 'gold' : s >= st.goal[1] ? 'silver' : s >= st.goal[0] ? 'bronze' : null;
}
// Competitive: most stars, then most Kind Kid cards. Returns player indexes, best first.
export function ranking(st) {
  return st.players.map((p, i) => i).sort((a, b) => {
    const pa = st.players[a], pb = st.players[b];
    return score(pb).total - score(pa).total || pb.kindCards - pa.kindCards || a - b;
  });
}

// After a turn: next player. Once every tile is explored, everyone gets two more turns (unless nothing is left).
export function endTurn(st) {
  st.turns++;
  const down = st.tiles.some((t) => t.state === 'down');
  if (!down) {
    if (st.final == null) st.final = st.players.length * 2;
    else st.final--;
    if (st.final <= 0 || !waiting(st).length) { st.over = true; return st; }
  }
  st.turn = (st.turn + 1) % st.players.length;
  return st;
}
