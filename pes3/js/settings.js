// Grown-up settings (issue #32): one localStorage key, defaults merged on read.
// Not cleared by "Erase history" (like the garden). Later parental controls add fields here.
const KEY = 'spelling-games.parent.v1';
const DEFAULTS = {
  pin: null,       // {salt, hash, iter}: salted PBKDF2 of the passcode (js/passcode.js)
  recovery: null,  // same shape, for the recovery code
  noPasscode: false, // a grown-up chose "Don't use a passcode": the panel opens without asking
  lock: { fails: 0, until: 0 }, // wrong tries in a row, and when the next try is allowed (ms)
  games: {},       // issue #33: {gameId: true|false} only for games a grown-up switched; see gameOn()
};

export function getSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* missing or bad: defaults */ }
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

// Games on/off (issue #33). A game is on unless a grown-up switched it off, or its SECTIONS entry says
// `off: true` (a new game still being tested) and nobody has switched it on. Keyed by the stable game id.
export function gameOn(game) {
  const g = getSettings().games;
  const v = g && typeof g === 'object' ? g[game.id] : undefined;
  return typeof v === 'boolean' ? v : !game.off;
}
export function setGameOn(id, on) {
  const g = getSettings().games;
  return updateSettings({ games: { ...(g && typeof g === 'object' ? g : {}), [id]: !!on } });
}

// Shallow merge: updateSettings({lock: {...}}) replaces the whole lock object.
export function updateSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: ignore */ }
  return next;
}
