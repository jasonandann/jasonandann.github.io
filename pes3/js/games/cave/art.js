// Crystal Cave pictures, drawn as inline SVG (Jason: SVG, not emoji, for the characters). Our own simple
// cartoon designs: four hero types (viking, knight, elf, wizard), silly bad guys built from a few shapes,
// gems, and the three card kinds. All strings are fixed here (colours come from deck.js), never user text.
const wrap = (inner, cls, label) =>
  `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const eyes = (y = 44, dx = 8, cx = 50, r = 3.2) =>
  `<circle cx="${cx - dx}" cy="${y}" r="${r}" fill="#1f2340"/><circle cx="${cx + dx}" cy="${y}" r="${r}" fill="#1f2340"/>` +
  `<circle cx="${cx - dx + 1}" cy="${y - 1}" r="1" fill="#fff"/><circle cx="${cx + dx + 1}" cy="${y - 1}" r="1" fill="#fff"/>`;
const smile = (y = 52) => `<path d="M43 ${y} q7 6 14 0" stroke="#1f2340" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
const cheeks = (y = 50) => `<circle cx="37" cy="${y}" r="3.5" fill="#fb7185" opacity=".45"/><circle cx="63" cy="${y}" r="3.5" fill="#fb7185" opacity=".45"/>`;

const HERO_ART = {
  viking: () =>
    `<path d="M26 40 q-4 30 6 46 l8 -2 q-6 -18 -2 -40z M74 40 q4 30 -6 46 l-8 -2 q6 -18 2 -40z" fill="#4c1d95"/>` +
    `<path d="M30 98 q2 -26 20 -28 q18 2 20 28z" fill="#7e22ce"/><path d="M40 74 l10 10 l10 -10" stroke="#facc15" stroke-width="3" fill="none"/>` +
    `<rect x="78" y="44" width="4" height="50" rx="2" fill="#92400e"/><path d="M80 46 q14 2 14 14 q-8 -4 -14 -2z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>` +
    `<circle cx="50" cy="46" r="21" fill="#a8704f"/>` + eyes(48) + smile(56) + cheeks(54) +
    `<path d="M28 42 q0 -22 22 -22 q22 0 22 22 z" fill="#94a3b8"/><rect x="27" y="38" width="46" height="6" rx="3" fill="#facc15"/>` +
    `<path d="M29 32 q-12 -6 -12 -20 q8 8 16 12z M71 32 q12 -6 12 -20 q-8 8 -16 12z" fill="#fef3c7" stroke="#d6b98c" stroke-width="1.2"/>`,
  knight: () =>
    `<path d="M24 98 q0 -30 26 -32 q26 2 26 32z" fill="#2563eb"/><path d="M32 98 q2 -24 18 -26 q16 2 18 26z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5"/>` +
    `<circle cx="50" cy="84" r="5" fill="#a78bfa"/>` +
    `<rect x="14" y="54" width="4" height="36" rx="1" fill="#e2e8f0" stroke="#94a3b8"/><rect x="9" y="86" width="14" height="4" rx="2" fill="#92400e"/>` +
    `<circle cx="50" cy="46" r="21" fill="#f2c9a0"/>` + eyes(48) + smile(56) + cheeks(54) +
    `<path d="M29 44 q-2 -26 21 -26 q24 0 21 26 q-6 -10 -14 -12 q-4 6 -14 6 q-8 0 -14 6z" fill="#facc15"/>`,
  elf: () =>
    `<path d="M28 40 q-8 36 4 56 l12 0 q-8 -20 -4 -50z M72 40 q8 36 -4 56 l-12 0 q8 -20 4 -50z" fill="#22c55e"/>` +
    `<path d="M32 98 q2 -26 18 -28 q16 2 18 28z" fill="#15803d"/><path d="M38 76 l24 14" stroke="#92400e" stroke-width="3"/>` +
    `<path d="M84 50 q-14 22 0 44" stroke="#92400e" stroke-width="3" fill="none"/><path d="M84 50 v44" stroke="#e7e5e4" stroke-width="1"/>` +
    `<path d="M30 46 l-12 -10 l12 2z M70 46 l12 -10 l-12 2z" fill="#f5d0b5"/>` +
    `<circle cx="50" cy="46" r="21" fill="#f5d0b5"/>` + eyes(48) + smile(56) + cheeks(54) +
    `<path d="M28 46 q-2 -28 22 -28 q24 0 22 28 q-8 -14 -22 -14 q-14 0 -22 14z" fill="#22c55e"/><path d="M42 22 q6 -6 12 0" stroke="#16a34a" stroke-width="3" fill="none"/>`,
  wizard: () =>
    `<path d="M30 98 q2 -26 20 -28 q18 2 20 28z" fill="#eab308"/><path d="M50 72 v26" stroke="#ca8a04" stroke-width="2"/>` +
    `<rect x="56" y="78" width="22" height="16" rx="2" fill="#1d4ed8" transform="rotate(-12 67 86)"/><path d="M60 84 h14" stroke="#bfdbfe" stroke-width="1.5" transform="rotate(-12 67 86)"/>` +
    `<circle cx="50" cy="48" r="20" fill="#c68642"/>` + eyes(50) + smile(58) + cheeks(56) +
    `<path d="M32 44 q2 -8 18 -8 q16 0 18 8 q-6 -2 -18 -2 q-12 0 -18 2z" fill="#5b3a1e"/>` +
    `<ellipse cx="50" cy="36" rx="32" ry="7" fill="#ea580c"/><path d="M30 35 q12 -34 30 -32 q-6 10 6 32z" fill="#f97316"/>` +
    `<path d="M48 22 l2 -5 l2 5 l5 0 l-4 3 l2 5 l-5 -3 l-5 3 l2 -5 l-4 -3z" fill="#fde047"/>`,
};
export function heroSvg(id, cls = 'cv-hero-art') {
  return wrap((HERO_ART[id] || HERO_ART.viking)(), cls, id);
}

// Bad guys: a body shape in the monster's colour, with cartoon eyes. Silly, not scary.
const MONSTER_ART = {
  mole: (c) => `<ellipse cx="50" cy="62" rx="32" ry="28" fill="${c}"/><ellipse cx="50" cy="68" rx="18" ry="16" fill="#fde68a" opacity=".5"/>` +
    eyes(50, 10, 50, 2.6) + `<ellipse cx="50" cy="60" rx="7" ry="5" fill="#f472b6"/>` +
    `<path d="M22 80 l-6 6 M26 84 l-4 8 M78 80 l6 6 M74 84 l4 8" stroke="#f5f5f4" stroke-width="3" stroke-linecap="round"/>`,
  bat: (c) => `<path d="M50 52 L8 34 q6 14 2 26 q10 -6 16 2 q6 -8 14 0z M50 52 L92 34 q-6 14 -2 26 q-10 -6 -16 2 q-6 -8 -14 0z" fill="${c}"/>` +
    `<circle cx="50" cy="54" r="16" fill="${c}"/><path d="M38 42 l2 -12 l6 8z M62 42 l-2 -12 l-6 8z" fill="${c}"/>` +
    eyes(52, 6) + `<path d="M45 62 l2 4 l2 -4 M51 62 l2 4 l2 -4" fill="#fff"/>`,
  goblin: (c, crown) => `<path d="M30 46 L6 34 L24 58z M70 46 L94 34 L76 58z" fill="${c}"/>` +
    `<ellipse cx="50" cy="58" rx="24" ry="26" fill="${c}"/>` + eyes(54, 9) +
    `<path d="M36 44 l10 4 M64 44 l-10 4" stroke="#1f2340" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M40 70 q10 -6 20 0" stroke="#1f2340" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
    (crown ? `<path d="M34 34 l4 -14 l8 8 l4 -12 l4 12 l8 -8 l4 14z" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/>` : ''),
  slime: (c) => `<path d="M18 86 q-4 -40 32 -54 q36 14 32 54 q-6 -6 -10 0 q-6 -8 -12 0 q-6 -8 -12 0 q-6 -8 -12 0 q-6 -6 -18 0z" fill="${c}" opacity=".9"/>` +
    `<ellipse cx="40" cy="44" rx="6" ry="3" fill="#fff" opacity=".5"/>` + eyes(58, 9, 50, 4) + smile(68),
  troll: (c) => `<rect x="20" y="40" width="60" height="54" rx="26" fill="${c}"/><circle cx="50" cy="36" r="18" fill="${c}"/>` +
    eyes(34, 7) + `<path d="M42 46 q8 -4 16 0" stroke="#1f2340" stroke-width="2.5" fill="none"/>` +
    `<path d="M44 46 l2 -4 l2 4 M52 46 l2 -4 l2 4" fill="#fff"/>` +
    `<path d="M80 52 l14 -24 q4 -6 -2 -8 q-6 0 -6 6z" fill="#92400e"/>`,
  snake: (c) => `<path d="M14 86 q30 10 36 -14 q6 -22 -14 -26 q-16 -4 -8 -18" stroke="${c}" stroke-width="16" fill="none" stroke-linecap="round"/>` +
    `<path d="M60 86 q20 -4 22 -24 q2 -16 -10 -22" stroke="${c}" stroke-width="13" fill="none" stroke-linecap="round"/>` +
    `<circle cx="28" cy="26" r="13" fill="${c}"/><circle cx="72" cy="38" r="11" fill="${c}"/>` +
    eyes(24, 5, 28, 2.6) + eyes(36, 4, 72, 2.2) +
    `<path d="M28 38 v8 l-3 4 M28 46 l3 4" stroke="#f43f5e" stroke-width="2" fill="none"/>`,
  spider: (c) => `<g stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round">` +
    `<path d="M40 56 q-18 -14 -30 -6 M40 62 q-20 -2 -30 10 M42 68 q-14 8 -20 22 M44 58 q-10 -20 -20 -26"/>` +
    `<path d="M60 56 q18 -14 30 -6 M60 62 q20 -2 30 10 M58 68 q14 8 20 22 M56 58 q10 -20 20 -26"/></g>` +
    `<ellipse cx="50" cy="66" rx="18" ry="16" fill="${c}"/><circle cx="50" cy="46" r="13" fill="${c}"/>` +
    eyes(44, 5, 50, 2.4) + `<circle cx="44" cy="50" r="1.8" fill="#fde047"/><circle cx="56" cy="50" r="1.8" fill="#fde047"/>`,
  skeleton: (c) => `<rect x="38" y="58" width="24" height="30" rx="6" fill="none" stroke="${c}" stroke-width="4"/>` +
    `<path d="M38 66 h24 M38 74 h24 M38 82 h24" stroke="${c}" stroke-width="3"/>` +
    `<path d="M38 64 l-16 14 M62 64 l16 14" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="50" cy="38" r="20" fill="${c}"/><rect x="42" y="50" width="16" height="10" rx="3" fill="${c}"/>` +
    `<circle cx="42" cy="38" r="6" fill="#1f2340"/><circle cx="58" cy="38" r="6" fill="#1f2340"/><path d="M48 46 l2 -4 l2 4z" fill="#1f2340"/>` +
    `<path d="M44 52 v6 M50 52 v6 M56 52 v6" stroke="#1f2340" stroke-width="1.5"/>`,
  ghost: (c) => `<path d="M20 92 v-40 q0 -36 30 -36 q30 0 30 36 v40 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8z" fill="${c}" opacity=".85"/>` +
    eyes(48, 9, 50, 4.5) + `<ellipse cx="50" cy="64" rx="6" ry="8" fill="#1f2340" opacity=".8"/>`,
  dragon: (c) => `<path d="M14 40 q16 -6 24 12 l-8 6z M86 40 q-16 -6 -24 12 l8 6z" fill="${c}" opacity=".7"/>` +
    `<ellipse cx="50" cy="74" rx="22" ry="20" fill="${c}"/><ellipse cx="50" cy="78" rx="12" ry="12" fill="#fde68a"/>` +
    `<path d="M36 30 l-6 -16 l12 10z M64 30 l6 -16 l-12 10z" fill="#fde68a"/>` +
    `<ellipse cx="50" cy="40" rx="20" ry="16" fill="${c}"/><ellipse cx="50" cy="48" rx="12" ry="7" fill="${c}" stroke="#7f1d1d" stroke-width="1"/>` +
    eyes(36, 8) + `<circle cx="45" cy="48" r="1.5" fill="#7f1d1d"/><circle cx="55" cy="48" r="1.5" fill="#7f1d1d"/>` +
    `<circle cx="70" cy="22" r="5" fill="#cbd5e1" opacity=".7"/><circle cx="78" cy="14" r="4" fill="#cbd5e1" opacity=".5"/>`,
};
export function monsterSvg(look = {}, name = 'bad guy', cls = 'cv-mon-art') {
  const draw = MONSTER_ART[look.shape] || MONSTER_ART.slime;
  return wrap(draw(look.color || '#64748b', look.crown), cls, name);
}

export function gemSvg(color = '#16a34a', name = 'gem', cls = 'cv-gem-art') {
  return wrap(
    `<path d="M28 34 h44 l16 16 l-38 40 l-38 -40z" fill="${color}"/>` +
    `<path d="M28 34 l10 16 h24 l10 -16 M12 50 h76 M38 50 l12 40 l12 -40" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none"/>` +
    `<path d="M34 38 l6 8" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
    cls, name);
}

// Card kinds: Power (purple, hammer) = math, Wisdom (red, book) = spelling, Magic (gold, sparkle) = either.
export const CARD = {
  power: { name: 'Power', color: '#7e22ce', what: 'math' },
  wisdom: { name: 'Wisdom', color: '#dc2626', what: 'spelling' },
  magic: { name: 'Magic', color: '#ca8a04', what: 'math or spelling' },
  any: { name: 'Any', color: '#475569', what: 'any card' },
};
const GLYPH = {
  power: `<rect x="44" y="40" width="12" height="44" rx="4" fill="#fff"/><rect x="24" y="20" width="52" height="24" rx="6" fill="#fff"/>`,
  wisdom: `<path d="M18 30 q16 -6 32 4 v46 q-16 -10 -32 -4z M82 30 q-16 -6 -32 4 v46 q16 -10 32 -4z" fill="#fff"/>`,
  magic: `<path d="M50 14 l9 27 l27 9 l-27 9 l-9 27 l-9 -27 l-27 -9 l27 -9z" fill="#fff"/>`,
  any: `<text x="50" y="66" text-anchor="middle" font-size="48" font-weight="900" fill="#fff">?</text>`,
};
export function cardSvg(kind, cls = 'cv-ic') {
  const c = CARD[kind] || CARD.any;
  return wrap(`<circle cx="50" cy="50" r="48" fill="${c.color}"/>${GLYPH[kind] || GLYPH.any}`, cls, c.name);
}
export function heartSvg(cls = 'cv-ic') {
  return wrap(`<path d="M50 88 L14 52 q-14 -16 0 -32 q16 -14 36 6 q20 -20 36 -6 q14 16 0 32z" fill="#e11d48"/>`, cls, 'heart');
}
export function starSvg(cls = 'cv-ic') {
  return wrap(`<path d="M50 6 l13 28 l31 4 l-23 21 l6 31 l-27 -15 l-27 15 l6 -31 l-23 -21 l31 -4z" fill="#facc15" stroke="#ca8a04" stroke-width="4"/>`, cls, 'star');
}
