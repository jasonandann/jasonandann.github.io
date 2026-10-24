// The computer player in Battle Buddies. It quietly keeps an estimate of how often she gets each kind of
// question right (spelling, and each math level) and plays a bit below that, so she usually has the edge;
// now and then (a "lucky turn") it plays as well as her or slightly better, so a win still feels earned.
// Hidden like the other progress: never shown to her.
const SKILL_KEY = 'spelling-games.battle.skill.v1';
const PRIOR = 0.7; // guess for a kind she hasn't played yet
const FLOOR = 0.15;

// gap = how far below her skill the computer plays (a fraction of her skill, picked at random each turn);
// lucky = chance of a turn where it plays at her level or up to `boost` above it.
export const BOT_LEVELS = {
  easy: { gap: [0.25, 0.4], lucky: 0.05, boost: 0.05 },
  right: { gap: [0.08, 0.2], lucky: 0.12, boost: 0.08 },
  tricky: { gap: [0.02, 0.08], lucky: 0.2, boost: 0.1 },
};

function load() {
  try { const s = JSON.parse(localStorage.getItem(SKILL_KEY)); return s && typeof s === 'object' ? s : {}; } catch { return {}; }
}
export const clearSkill = () => { try { localStorage.removeItem(SKILL_KEY); } catch { /* ignore */ } };

// 'spell' or 'math:<level>'. A weighted average that leans on recent turns (newer answers count more),
// starting from PRIOR; the first few answers move it quickly, later ones about 15% each.
export function skillOf(key) {
  const s = load()[key];
  return s ? Math.max(FLOOR, Math.min(1, s.p)) : PRIOR;
}
// score: 1 = right first time, 0.5 = right on the second chance, 0 = not this time.
export function noteResult(key, score) {
  const all = load();
  const s = all[key] || { p: PRIOR, n: 0 };
  const alpha = Math.max(0.15, 1 / (s.n + 2));
  all[key] = { p: +(s.p + alpha * (score - s.p)).toFixed(4), n: s.n + 1 };
  try { localStorage.setItem(SKILL_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// The chance the computer gets this turn's question right.
export function botChance(skill, level = 'right', rnd = Math.random) {
  const d = BOT_LEVELS[level] || BOT_LEVELS.right;
  if (rnd() < d.lucky) return Math.min(0.97, skill + rnd() * d.boost);
  const gap = d.gap[0] + rnd() * (d.gap[1] - d.gap[0]);
  return Math.max(0.05, skill * (1 - gap));
}
