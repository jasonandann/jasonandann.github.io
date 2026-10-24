// Computer heroes in Crystal Cave (issue #61): what they do on their turn, whether they help, how often
// their answers are right. Levels: 'right' (🌱 Just right: plays a little below her hidden skill, as in
// Battle Buddies), 'normal' (⚔️ fixed chances by tier), 'nomercy' (🔥 No Mercy: plays to win when people compete).
// In the cooperative game every computer hero is on her team: it plays sensibly and always helps.
import { KINDS, shortfall, canPay, explorable, waiting, cardCount, canGive, TIER, useBadge } from './rules.js';
import { botChance } from '../battle-bot.js';

export const LEVELS = [
  { id: 'right', name: '🌱 Just right' },
  { id: 'normal', name: '⚔️ Normal' },
  { id: 'nomercy', name: '🔥 No Mercy' },
];
const NORMAL = { 1: 0.85, 2: 0.75, 3: 0.65 };

// The chance a computer hero answers this question right. skill = her hidden skill for the subject (0..1).
export function answerChance(level, tier, skill, rnd = Math.random) {
  if (level === 'nomercy') return 0.95;
  if (level === 'normal') return NORMAL[tier] || 0.75;
  return Math.max(0.1, Math.min(0.95, botChance(skill, 'right', rnd) + (2 - tier) * 0.08));
}

// Will computer hero h give player i a card? Team players always do; rivals sometimes (helping earns stars).
export function willHelp(st, h, i, rnd = Math.random) {
  if (st.coop) return true;
  const chance = { right: 0.75, normal: 0.6, nomercy: 0.35 }[st.bot] || 0.6;
  return rnd() < chance;
}

// Cards the team's computer heroes could add (cooperative: they always give).
function teamCards(st, i) {
  const sum = { power: 0, wisdom: 0, magic: 0 };
  st.players.forEach((p, j) => { if (j === i || (!st.coop && j !== i) || p.human) return; for (const k of KINDS) sum[k] += p.cards[k]; });
  return sum;
}

// Turn plan: {type: 'fight'|'buy'|'explore'|'pass', tile}.
export function chooseAction(st, i, rnd = Math.random) {
  const p = st.players[i];
  const pool = { ...p.cards };
  const team = teamCards(st, i);
  for (const k of KINDS) pool[k] += team[k];
  const mean = !st.coop && st.bot === 'nomercy';
  const monsters = waiting(st, 'monster').filter((t) => canPay(pool, st.tiles[t].card.needs));
  // No Mercy goes for the bad guys a person uncovered first (the ones she was saving up for), biggest first.
  monsters.sort((a, b) => (mean ? (st.tiles[b].card.stars - st.tiles[a].card.stars) : 0));
  if (monsters.length) return { type: 'fight', tile: monsters[0] };
  const gems = waiting(st, 'item').filter((t) => canPay(p.cards, st.tiles[t].card.needs));
  if (gems.length) return { type: 'buy', tile: gems[0] };
  const open = explorable(st);
  if (!open.length) return { type: 'pass' };
  // Few cards: stay on green/gray. Plenty (or No Mercy): head for red, where the big stars are.
  const bold = mean || cardCount(p) >= 4;
  const want = (t) => {
    const tier = TIER[st.tiles[t].color];
    return bold ? tier : 4 - tier;
  };
  const best = Math.max(...open.map(want));
  const top = open.filter((t) => want(t) === best);
  return { type: 'explore', tile: top[Math.floor(rnd() * top.length)] };
}

// Short after any help: try the harder questions (brave try) or back away (lose a heart).
export function braveTry(st, i, missing) {
  const limit = st.bot === 'nomercy' && !st.coop ? 3 : 2;
  return missing <= limit;
}

// "Any" picks (Lucky Find, Grab Bag): the kinds it has fewest of; a treasure now and then.
export function anyPicks(p, n, rnd = Math.random) {
  const cards = { ...p.cards };
  const out = [];
  for (let k = 0; k < n; k++) {
    if (rnd() < 0.25) { out.push('treasure'); continue; }
    const kind = KINDS.reduce((m, x) => (cards[x] < cards[m] ? x : m), 'power');
    cards[kind]++;
    out.push(kind);
  }
  return out;
}

// Kind Badges: a computer hero uses Treasure Maps at once and an Extra Heart when below 3 hearts; with `needs`
// (a bad guy or gem in front of it) Bonus Cards fill the gap. Returns what it used, for the message line.
export function botBadges(st, i, needs) {
  const p = st.players[i], used = [];
  for (let n = (p.badges || []).length - 1; n >= 0; n--) {
    const b = p.badges[n];
    if (b.effect === 'treasure' || (b.effect === 'heart' && p.hearts < 3)) { used.push(useBadge(st, i, n)); continue; }
    if (b.effect !== 'card' || !needs) continue;
    const miss = shortfall(p.cards, needs);
    if (!miss.total) continue;
    used.push(useBadge(st, i, n, KINDS.find((k) => miss[k] > 0) || 'magic'));
  }
  return used.filter(Boolean);
}

// Can anyone but player i give a card toward `miss`?
export const helpAvailable = (st, i, miss) => st.players.some((p, j) => j !== i && canGive(p.cards, miss));
export { shortfall };
