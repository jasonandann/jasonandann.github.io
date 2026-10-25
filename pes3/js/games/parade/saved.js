// Saved parades (Monster Parade): kept in this browser, and exported to / imported from a small JSON file.
// A parade = { name, made, monsters: [{ name, monster, items }] }. Anything read back is checked against art.js,
// so a hand-edited or damaged file can't put a bad value into the drawing code.
import { COLORS, EYES, TOPS, MOUTHS, PATTERNS, SLOTS, ITEMS } from './art.js';

const KEY = 'spelling-games.parade.saved.v1';
export const MAX_SAVED = 30;
export const MAX_MONSTERS = 12;
const FORMAT = 'monster-parade';

const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);

// Returns a clean parade, or null if there is no usable monster in it.
export function sanitize(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.monsters)) return null;
  const monsters = p.monsters.slice(0, MAX_MONSTERS).map((r) => {
    if (!r || typeof r !== 'object' || !r.monster || typeof r.monster !== 'object') return null;
    const m = r.monster, items = {};
    for (const slot of SLOTS) if (ITEMS[slot].some((it) => it.id === r.items?.[slot])) items[slot] = r.items[slot];
    return {
      name: String(r.name || '').slice(0, 12),
      monster: { color: oneOf(COLORS.map((c) => c.id), m.color, COLORS[0].id), eyes: oneOf(EYES, m.eyes, EYES[0]),
        top: oneOf(TOPS, m.top, 'none'), mouth: oneOf(MOUTHS, m.mouth, MOUTHS[0]), pattern: oneOf(PATTERNS, m.pattern, 'none') },
      items,
    };
  }).filter(Boolean);
  if (!monsters.length) return null;
  return { name: String(p.name || 'My parade').slice(0, 30), made: Number(p.made) || 0, monsters };
}

export function loadSaved() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return (Array.isArray(a) ? a : []).map(sanitize).filter(Boolean);
  } catch { return []; }
}
function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return localStorage.getItem(KEY) !== null; } catch { return false; }
}
// Newest first. Returns false if the browser wouldn't keep it.
export function addSaved(p) {
  const clean = sanitize(p);
  if (!clean) return false;
  return store([clean, ...loadSaved()].slice(0, MAX_SAVED));
}
export function removeSaved(index) {
  const list = loadSaved();
  list.splice(index, 1);
  return store(list);
}

export const fileText = (p) => JSON.stringify({ format: FORMAT, version: 1, ...p }, null, 2);
export const fileName = (p) => `${(p.name || 'parade').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parade'}.parade.json`;
// Returns a clean parade, or null if the text isn't a parade file.
export function parseFile(text) {
  try {
    const o = JSON.parse(text);
    return o && o.format === FORMAT ? sanitize(o) : null;
  } catch { return null; }
}
export function download(p) {
  const url = URL.createObjectURL(new Blob([fileText(p)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName(p) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
