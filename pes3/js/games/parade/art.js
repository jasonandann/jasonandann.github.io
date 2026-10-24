// Monster Parade art (issue #67): every monster has the SAME body size and shape; only colour and details vary,
// so every outfit, prop and ride fits every monster. Simple and cartoony on purpose (Jason, 2026-10-24).
// All drawing is here; js/games/parade.js only calls the exports below.
//
// Monster coordinates (before scaling): body centred at x 120; head top y 62, eyes y 96, mouth y 118,
//   neck y 126, hands (66,140) and (174,140), feet y 198. In a scene the monster is drawn MONSTER_SCALE
//   bigger, anchored at its feet (120,200); the scene's viewBox is VIEWBOX (taller than wide for hats).
// scene() returns an SVG string built only from this file's own constants (no user text inside the SVG).

const INK = '#1f2340';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

export const COLORS = [
  { id: 'purple', name: 'purple', fill: '#a78bfa' },
  { id: 'green', name: 'green', fill: '#4ade80' },
  { id: 'orange', name: 'orange', fill: '#fb923c' },
  { id: 'blue', name: 'blue', fill: '#60a5fa' },
  { id: 'pink', name: 'pink', fill: '#f472b6' },
  { id: 'teal', name: 'teal', fill: '#2dd4bf' },
  { id: 'yellow', name: 'yellow', fill: '#facc15' },
  { id: 'red', name: 'red', fill: '#f87171' },
];
export const EYES = [1, 2, 3];
export const TOPS = ['horns', 'antennae', 'ears', 'tuft', 'none'];
export const MOUTHS = ['smile', 'grin', 'open', 'fang'];
export const PATTERNS = ['none', 'spots', 'belly', 'stripes'];

export const SLOTS = ['extra', 'outfit', 'prop', 'ride']; // the order she gets a monster ready in
export const ITEMS = {
  extra: [
    { id: 'batwings', name: 'bat wings' },
    { id: 'fairywings', name: 'fairy wings' },
    { id: 'birdwings', name: 'bird wings' },
    { id: 'dragontail', name: 'dragon tail' },
    { id: 'fluffytail', name: 'fluffy tail' },
    { id: 'fur', name: 'fuzzy fur' },
  ],
  outfit: [
    { id: 'tophat', name: 'top hat' },
    { id: 'crown', name: 'crown' },
    { id: 'party', name: 'party hat' },
    { id: 'turkey', name: 'turkey hat' },
    { id: 'cape', name: 'cape' },
    { id: 'scarf', name: 'scarf' },
    { id: 'sash', name: 'sash' },
    { id: 'shades', name: 'sunglasses' },
  ],
  prop: [
    { id: 'pompoms', name: 'pom-poms' },
    { id: 'flag', name: 'flag' },
    { id: 'baton', name: 'baton' },
    { id: 'drum', name: 'drum' },
    { id: 'trumpet', name: 'trumpet' },
    { id: 'streamers', name: 'streamers' },
    { id: 'bubbles', name: 'bubble wand' },
    { id: 'balloons', name: 'balloons' },
  ],
  ride: [
    { id: 'float', name: 'parade float' },
    { id: 'bus', name: 'open-top bus' },
    { id: 'car', name: 'convertible' },
    { id: 'firetruck', name: 'fire truck' },
    { id: 'band', name: 'marching band' },
    { id: 'balloon', name: 'giant balloon' },
    { id: 'unicycle', name: 'unicycle' },
  ],
};
export const SLOT_NAMES = { extra: 'something extra', outfit: 'something to wear', prop: 'something to hold', ride: 'a way to ride' };

const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
export function randomMonster(rnd = Math.random) {
  return { color: pick(COLORS, rnd).id, eyes: pick(EYES, rnd), top: pick(TOPS, rnd), mouth: pick(MOUTHS, rnd), pattern: pick(PATTERNS, rnd) };
}
const fillOf = (m) => (COLORS.find((c) => c.id === m.color) || COLORS[0]).fill;

/* ---------- the monster (fixed shape) ---------- */
const BODY = 'M120 62 C 84 62 70 92 70 124 C 70 168 84 196 120 196 C 156 196 170 168 170 124 C 170 92 156 62 120 62 Z';

function top(m, fill) {
  switch (m.top) {
    case 'horns': return `<path d="M88 76 L78 46 L100 68 Z" fill="#fef3c7" ${S}/><path d="M152 76 L162 46 L140 68 Z" fill="#fef3c7" ${S}/>`;
    case 'antennae': return `<path d="M104 64 Q96 44 88 34" fill="none" ${S}/><circle cx="88" cy="32" r="7" fill="${fill}" ${S}/>`
      + `<path d="M136 64 Q144 44 152 34" fill="none" ${S}/><circle cx="152" cy="32" r="7" fill="${fill}" ${S}/>`;
    case 'ears': return `<ellipse cx="78" cy="78" rx="12" ry="18" transform="rotate(-25 78 78)" fill="${fill}" ${S}/><ellipse cx="162" cy="78" rx="12" ry="18" transform="rotate(25 162 78)" fill="${fill}" ${S}/>`;
    case 'tuft': return `<path d="M108 66 Q112 44 120 58 Q126 40 132 66" fill="${fill}" ${S}/>`;
    default: return '';
  }
}
function eyes(m, side) {
  const one = (x, r = 11, look = 2) => `<circle cx="${x}" cy="96" r="${r}" fill="#fff" ${S}/><circle cx="${x + look}" cy="98" r="${r * 0.45}" fill="${INK}"/>`;
  if (side) { // facing right: eyes shifted toward the front, the far one a little smaller, pupils looking ahead
    if (m.eyes === 1) return one(146, 14, 5);
    if (m.eyes === 3) return one(118, 7, 3) + one(136, 8, 3) + one(155, 8, 3);
    return one(128, 8, 3) + one(152, 10, 4);
  }
  if (m.eyes === 1) return one(120, 15);
  if (m.eyes === 3) return one(96, 9) + one(120, 9) + one(144, 9);
  return one(103) + one(137);
}
function mouth(m) {
  switch (m.mouth) {
    case 'grin': return `<path d="M100 114 Q120 134 140 114 Z" fill="#fff" ${S}/><path d="M110 117 V124 M120 118 V127 M130 117 V124" stroke="${INK}" stroke-width="2"/>`;
    case 'open': return `<ellipse cx="120" cy="120" rx="10" ry="8" fill="#7f1d1d" ${S}/>`;
    case 'fang': return `<path d="M104 114 Q120 128 136 114" fill="none" ${S}/><path d="M110 116 L113 124 L116 118 Z M124 118 L127 124 L130 116 Z" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
    default: return `<path d="M104 114 Q120 130 136 114" fill="none" ${S}/>`;
  }
}
function pattern(m) {
  switch (m.pattern) {
    case 'spots': return '<g fill="#fff" opacity=".35"><circle cx="92" cy="150" r="7"/><circle cx="146" cy="158" r="9"/><circle cx="128" cy="180" r="6"/><circle cx="104" cy="176" r="5"/></g>';
    case 'belly': return '<ellipse cx="120" cy="160" rx="30" ry="28" fill="#fff" opacity=".4"/>';
    case 'stripes': return `<g fill="none" stroke="${INK}" stroke-width="3" opacity=".25"><path d="M74 140 Q120 152 166 140"/><path d="M76 162 Q120 174 164 162"/><path d="M84 182 Q120 192 156 182"/></g>`;
    default: return '';
  }
}
function arms(fill) {
  return `<path d="M74 132 Q60 136 64 146" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`
    + `<path d="M74 132 Q60 136 64 146" fill="none" stroke="${fill}" stroke-width="6" stroke-linecap="round"/>`
    + `<path d="M166 132 Q180 136 176 146" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`
    + `<path d="M166 132 Q180 136 176 146" fill="none" stroke="${fill}" stroke-width="6" stroke-linecap="round"/>`;
}
function feet(fill) {
  return `<ellipse cx="102" cy="198" rx="15" ry="8" fill="${fill}" ${S}/><ellipse cx="138" cy="198" rx="15" ry="8" fill="${fill}" ${S}/>`;
}
// side: facing right (rides seen side-on); walk: feet step while the parade moves (mv); blink: the eyes blink now
// and then. A blink is one tiny animation per monster (the eyes squash flat for a moment), at a random pace so a
// parade of monsters never blinks together.
function blinking(eyesSvg, on) {
  if (!on) return eyesSvg;
  const dur = (3 + Math.random() * 3).toFixed(1);
  const begin = (Math.random() * 3).toFixed(1);
  return `<g transform="translate(0 96)"><g>`
    + `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 .1;1 1" keyTimes="0;.94;.97;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`
    + `<g transform="translate(0 -96)">${eyesSvg}</g></g></g>`;
}
export function monsterSvg(m, { side = false, walk = false, mv = false, blink = false } = {}) {
  const fill = fillOf(m);
  const shiftTo = (x, sx, inner) => (side ? `<g transform="translate(${x} 0) scale(${sx} 1) translate(-120 0)">${inner}</g>` : inner);
  const ft = side && walk && mv
    ? [102, 138].map((x, i) => `<g><ellipse cx="${x}" cy="198" rx="15" ry="8" fill="${fill}" ${S}/>${step(i)}</g>`).join('')
    : feet(fill);
  return ft + shiftTo(130, 1, top(m, fill)) + `<path d="${BODY}" fill="${fill}" ${S}/>` + shiftTo(128, 0.85, pattern(m)) + arms(fill)
    + blinking(eyes(m, side), blink) + shiftTo(148, 0.7, mouth(m));
}

/* ---------- extras (wings, tails, fur): all drawn behind the body, so they peek out around its fixed outline ---------- */
// left wing + its mirror. Moving: the wing flaps a little at the shoulder (the mirror copy flaps the mirror way).
// Side view (facing right): the near wing (on the back side, left) tilts back; the far wing is narrower, as it is
// further away.
const wingPair = (one, mv, side) => {
  const w = moved(one, swing(82, 120, 0, 6, 1.4), mv);
  const far = `<g transform="translate(240 0) scale(-1 1)">${w}</g>`;
  if (!side) return w + far;
  return `<g transform="rotate(-14 82 120)">${w}</g><g transform="translate(158 0) scale(0.7 1) translate(-158 0)">${far}</g>`;
};
function furFringe(fill) { // a zigzag copy of the body outline, a little bigger, behind it
  const pts = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2, r = i % 2 ? 1 : 1.13;
    pts.push(`${(120 + Math.cos(a) * 50 * r).toFixed(1)},${(130 + Math.sin(a) * 67 * r).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${S}/>`;
}
const EXTRA = {
  batwings: (fill, mv, side) => wingPair(`<path d="M80 110 L48 70 L44 92 L32 90 L36 112 L27 120 L48 128 L80 140 Z" fill="#6d28d9" ${S}/><path d="M78 116 L48 74 M78 124 L38 104 M78 132 L34 120" stroke="${INK}" stroke-width="2" opacity=".5"/>`, mv, side),
  fairywings: (fill, mv, side) => wingPair(`<path d="M82 112 Q40 64 32 96 Q28 120 82 126 Z" fill="#bae6fd" fill-opacity=".85" ${S}/><path d="M82 130 Q40 136 46 160 Q56 172 84 142 Z" fill="#fbcfe8" fill-opacity=".85" ${S}/>`, mv, side),
  birdwings: (fill, mv, side) => wingPair(`<path d="M82 108 Q50 92 28 104 Q40 108 30 118 Q44 120 36 130 Q52 130 46 140 Q66 140 82 138 Z" fill="#fde68a" ${S}/><path d="M78 116 Q56 112 42 116 M78 126 Q60 124 48 130" fill="none" stroke="#d97706" stroke-width="2.5"/>`, mv, side),
  dragontail: (fill, mv) => moved(`<path d="M90 184 Q50 196 40 170 Q34 150 52 140" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M90 184 Q50 196 40 170 Q34 150 52 140" fill="none" stroke="#22c55e" stroke-width="9" stroke-linecap="round"/>`
    + `<path d="M46 146 L58 124 L64 146 Z" fill="#22c55e" ${S}/><path d="M42 170 L28 164 L40 158 Z M60 190 L54 202 L68 194 Z" fill="#facc15" ${S} stroke-width="2"/>`, swing(90, 184, 0, 7, 1.6), mv),
  fluffytail: (fill, mv) => moved(`<g fill="#fff" ${S} stroke-width="2.5"><circle cx="66" cy="178" r="13"/><circle cx="56" cy="170" r="10"/><circle cx="58" cy="186" r="9"/><circle cx="70" cy="166" r="8"/></g>`, swing(78, 178, 0, 10, 0.6), mv),
  fur: (fill) => furFringe(fill),
};

/* ---------- outfits (fixed anchors: head top y 62, eyes y 96, neck y 126) ---------- */
const OUTFIT_BACK = {
  cape: `<path d="M82 126 Q52 170 50 208 Q120 214 190 208 Q188 170 158 126 Z" fill="#dc2626" ${S}/>`,
};
// In side view the cape streams out behind (to the left), in the wind of the parade.
const CAPE_SIDE = (mv) => moved(`<path d="M96 126 Q64 132 34 160 Q22 178 30 200 Q44 190 52 200 Q60 188 72 198 L150 200 Q152 160 150 126 Z" fill="#dc2626" ${S}/>`,
  swing(110, 126, 0, 4, 1.2), mv);
const OUTFIT = {
  tophat: `<ellipse cx="120" cy="66" rx="34" ry="7" fill="${INK}"/><rect x="100" y="24" width="40" height="42" rx="3" fill="${INK}"/><rect x="100" y="54" width="40" height="7" fill="#dc2626"/>`,
  crown: `<path d="M88 70 L90 32 L106 50 L120 24 L134 50 L150 32 L152 70 Z" fill="#facc15" ${S}/><circle cx="90" cy="30" r="4" fill="#facc15" ${S}/><circle cx="120" cy="22" r="4" fill="#facc15" ${S}/><circle cx="150" cy="30" r="4" fill="#facc15" ${S}/><circle cx="120" cy="58" r="5" fill="#ef4444" ${S}/><circle cx="102" cy="61" r="4" fill="#3b82f6"/><circle cx="138" cy="61" r="4" fill="#22c55e"/>`,
  party: `<path d="M120 18 L100 70 L140 70 Z" fill="#38bdf8" ${S}/><path d="M112 38 L128 42 M106 54 L134 60" stroke="#fde047" stroke-width="5"/><circle cx="120" cy="18" r="7" fill="#f472b6" ${S}/>`,
  turkey: (() => {
    const cols = ['#dc2626', '#f97316', '#facc15', '#a16207', '#facc15', '#f97316', '#dc2626'];
    const fan = cols.map((c, i) => { const a = -150 + i * 20; return `<ellipse cx="120" cy="34" rx="8" ry="24" transform="rotate(${a + 90} 120 64)" fill="${c}" ${S}/>`; }).join('');
    return fan + `<ellipse cx="120" cy="62" rx="22" ry="14" fill="#92400e" ${S}/><circle cx="120" cy="42" r="11" fill="#b45309" ${S}/>`
      + `<circle cx="116" cy="40" r="2.5" fill="#fff"/><circle cx="116.5" cy="40.5" r="1.3" fill="${INK}"/><circle cx="124" cy="40" r="2.5" fill="#fff"/><circle cx="124.5" cy="40.5" r="1.3" fill="${INK}"/>`
      + `<path d="M116 45 L124 45 L120 51 Z" fill="#facc15" stroke="${INK}" stroke-width="1.5"/><path d="M122 49 Q126 56 121 58" fill="none" stroke="#dc2626" stroke-width="3.5" stroke-linecap="round"/>`;
  })(),
  scarf_side: `<path d="M80 124 Q120 140 160 124 L162 136 Q120 152 78 136 Z" fill="#ef4444" ${S}/><path d="M86 130 Q66 128 44 140 L46 152 Q66 142 88 142 Z" fill="#ef4444" ${S}/><path d="M92 132 V142 M106 135 V146 M122 136 V147 M138 134 V145 M152 131 V140 M60 136 V146" stroke="#fff" stroke-width="3"/>`,
  scarf: `<path d="M80 124 Q120 140 160 124 L162 136 Q120 152 78 136 Z" fill="#ef4444" ${S}/><path d="M140 136 L146 170 L132 170 L130 140 Z" fill="#ef4444" ${S}/><path d="M86 128 V138 M100 132 V143 M116 134 V146 M132 133 V145 M148 130 V140" stroke="#fff" stroke-width="3"/>`,
  sash: `<path d="M82 110 L92 104 L162 176 L152 184 Z" fill="#fde047" ${S}/><path d="M118 140 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 Z" fill="#dc2626"/>`,
  shades: `<path class="shades" d="M82 88 H158 V98 Q158 110 146 110 H132 Q124 110 122 100 H118 Q116 110 108 110 H94 Q82 110 82 98 Z" fill="${INK}"/><path d="M90 92 L100 92" stroke="#fff" stroke-width="3" opacity=".6"/>`,
  cape: `<path d="M80 128 L94 136 L108 134 Z M160 128 L146 136 L132 134 Z" fill="#dc2626" ${S} stroke-width="2"/><path d="M86 130 Q120 142 154 130" fill="none" stroke="#dc2626" stroke-width="5" stroke-linecap="round"/><circle cx="120" cy="138" r="5" fill="#facc15" ${S}/>`, // collar at the shoulders, below the mouth
};

/* ---------- props (hands at (66,140) and (174,140)) ---------- */
// Each prop is a function of mv (the parade is moving): then it does its thing (shake, wave, twirl, tap...).
// moved(inner, anim) wraps a part so the animation moves only that part.
const moved = (inner, anim, mv) => (mv ? `<g>${inner}${anim}</g>` : inner);
const pom = (x, y, c) => `<g fill="${c}" stroke="${INK}" stroke-width="2">${Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return `<circle cx="${(x + Math.cos(a) * 9).toFixed(1)}" cy="${(y + Math.sin(a) * 9).toFixed(1)}" r="6"/>`;
}).join('')}<circle cx="${x}" cy="${y}" r="8" stroke="none"/></g>`;
// A bubble that rises from the wand, growing, then pops (shrinks to nothing) and starts again.
const bubble = (x, y, r, begin) => `<circle cx="${x}" cy="${y}" r="${r}"><animate attributeName="cy" values="${y + 34};${y}" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>`
  + `<animate attributeName="r" values="2;${r};${r};0" keyTimes="0;.3;.9;1" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
// A music note that floats up out of the trumpet's bell and shrinks away.
// at (x, y), drifting by (dx, dy) as it rises.
const note = (begin, x = 196, y = 112, dx = -14, dy = -42) => `<g><g transform="translate(${x} ${y})"><g><ellipse cx="0" cy="0" rx="6" ry="4.5" fill="${INK}"/><path d="M5.5 0 V-17 L13 -14" fill="none" stroke="${INK}" stroke-width="2.5"/>`
  + `<animateTransform attributeName="transform" type="scale" values="1;1;0" keyTimes="0;.7;1" dur="1.6s" begin="${begin}s" repeatCount="indefinite"/></g></g>`
  + `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" dur="1.6s" begin="${begin}s" repeatCount="indefinite"/></g>`;
const MACE = `<path d="M176 168 L189 60" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`
  + `<path d="M176 168 L189 60" stroke="#f8fafc" stroke-width="7" stroke-linecap="round"/>`
  + `<path d="M176 168 L189 60" stroke="#facc15" stroke-width="7" stroke-dasharray="4 8"/>`
  + `<circle cx="175.5" cy="170" r="5" fill="#facc15" ${S} stroke-width="2"/>`
  + `<path d="M183 62 Q174 74 177 88 M197 62 Q206 74 201 90" fill="none" stroke="#dc2626" stroke-width="3"/>`
  + `<path d="M173 86 l8 0 -1 9 -6 0 Z M197 88 l8 0 -1 9 -6 0 Z" fill="#dc2626" ${S} stroke-width="1.5"/>`
  + `<ellipse cx="190" cy="57" rx="9" ry="4" fill="#facc15" ${S} stroke-width="2"/>`
  + `<circle cx="191" cy="44" r="12" fill="#facc15" ${S}/><circle cx="187" cy="40" r="3.5" fill="#fff" opacity=".8"/>`
  + `<path d="M182 44 H200" stroke="#a16207" stroke-width="2"/>`
  + `<path d="M188 32 L191 22 L194 32 Z" fill="#facc15" ${S} stroke-width="2"/>`;
const PROP_BACK = {
  flag: (mv) => `<path d="M176 146 V46" ${S}/>` + moved(`<path d="M176 48 Q190 42 204 52 Q190 60 176 74 Z" fill="#3b82f6" ${S}/><path d="M186 54 l2 5 5 0 -4 3 2 5 -5 -3 -4 3 2 -5 -4 -3 5 0 Z" fill="#fff"/>`,
    swing(176, 60, 0, 9, 0.9), mv),
  // A drum major's mace: thick banded shaft, an ornate gold head (collar, shine, finial), red cords with tassels.
  // Moving: it swings inward and pumps up and down, the way a drum major struts.
  baton: (mv) => moved(MACE, `<animateTransform attributeName="transform" type="rotate" values="-24 178 150;4 178 150;-24 178 150" dur="1.1s" repeatCount="indefinite"/>`
    + `<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0;0 -6;0 0" dur="1.1s" repeatCount="indefinite" additive="sum"/>`, mv),
  balloons: (mv) => moved(`<path d="M176 146 L188 66 M176 146 L202 82 M176 146 L174 80" stroke="${INK}" stroke-width="1.5" fill="none"/>`
    + `<ellipse cx="188" cy="54" rx="12" ry="15" fill="#ef4444" ${S}/><ellipse cx="203" cy="72" rx="12" ry="15" fill="#22c55e" ${S}/><ellipse cx="173" cy="70" rx="12" ry="15" fill="#3b82f6" ${S}/>`,
  `<animateTransform attributeName="transform" type="rotate" values="-8 176 146;0 176 146;-8 176 146" dur="2.2s" repeatCount="indefinite"/>`, mv), // sways toward the monster, never past the edge
  bubbles: (mv) => `<path d="M176 146 L192 100" stroke="#a16207" stroke-width="4" stroke-linecap="round"/><circle cx="195" cy="91" r="10" fill="none" stroke="#a16207" stroke-width="3"/>`
    + `<g fill="#bae6fd" fill-opacity=".45" stroke="#38bdf8" stroke-width="2">${mv ? bubble(204, 66, 8, 0) + bubble(190, 54, 6, 0.8) + bubble(206, 44, 5, 1.6)
      : '<circle cx="204" cy="66" r="8"/><circle cx="188" cy="54" r="6"/><circle cx="206" cy="44" r="5"/>'}</g>`,
  streamers: (mv) => `<path d="M176 146 L182 108" stroke="#a16207" stroke-width="4" stroke-linecap="round"/>`
    + moved('<path d="M182 108 Q196 96 188 80 Q182 66 198 58" fill="none" stroke="#ec4899" stroke-width="4"/>', swing(182, 108, 0, 10, 0.8), mv)
    + moved('<path d="M182 108 Q202 108 204 92 Q206 78 212 70" fill="none" stroke="#22c55e" stroke-width="4"/>', swing(182, 108, 0.25, 8, 0.8), mv)
    + moved('<path d="M182 108 Q192 122 208 116" fill="none" stroke="#facc15" stroke-width="4"/>', swing(182, 108, 0.5, 12, 0.8), mv),
};
// A drumstick stroke: up, then down onto the drum (dir 1 = the left hand's stick, -1 = the mirrored right one).
const stroke = (x, y, dir, begin) => `<animateTransform attributeName="transform" type="rotate" values="${-10 * dir} ${x} ${y};${8 * dir} ${x} ${y};${-10 * dir} ${x} ${y}" keyTimes="0;.35;1" dur="0.6s" begin="${begin}s" repeatCount="indefinite"/>`;
const PROP = {
  pompoms: (mv) => moved(pom(64, 146, '#ec4899'), swing(66, 146, 0, 14, 0.5), mv) + moved(pom(176, 146, '#facc15'), swing(174, 146, 0.25, 14, 0.5), mv),
  drum: (mv) => `<rect x="94" y="150" width="52" height="34" rx="4" fill="#ef4444" ${S}/><ellipse cx="120" cy="150" rx="26" ry="7" fill="#f8fafc" ${S}/><path d="M96 158 L120 180 L144 158" fill="none" stroke="#facc15" stroke-width="3"/>`
    + moved(`<path d="M66 146 L104 138" stroke="#a16207" stroke-width="5" stroke-linecap="round"/><circle cx="104" cy="138" r="4" fill="#fde68a" ${S} stroke-width="2"/>`, stroke(66, 146, 1, 0), mv)
    + moved(`<path d="M174 146 L136 138" stroke="#a16207" stroke-width="5" stroke-linecap="round"/><circle cx="136" cy="138" r="4" fill="#fde68a" ${S} stroke-width="2"/>`, stroke(174, 146, -1, 0.3), mv),
  trumpet: (mv) => `<path d="M176 144 L200 132" stroke="#eab308" stroke-width="7" stroke-linecap="round"/><path d="M196 126 L212 116 L214 144 L198 138 Z" fill="#facc15" ${S}/><rect x="182" y="130" width="5" height="10" fill="#a16207"/><rect x="189" y="126" width="5" height="10" fill="#a16207"/>`
    + (mv ? note(0) + note(0.8) : ''),
};

/* ---------- rides (the monster sits in, on or under them) ---------- */
// Each ride: lift = how far the monster moves up (+) or down, scale, then back (drawn first) and front (drawn last).
// ---------- motion (SVG's own animation, so it needs no stylesheet; only drawn when mv = the parade is moving) ----------
// Wheels roll at the parade's pace: a bigger wheel turns more slowly (time per turn grows with the radius),
// so every rim moves at the same speed. SPIN_PER_R = seconds per turn for each unit of radius.
const SPIN_PER_R = 0.08;
const spin = (x, y, r) => spinFor(x, y, (r * SPIN_PER_R).toFixed(2));
const spinFor = (x, y, dur) => `<animateTransform attributeName="transform" type="rotate" from="0 ${x} ${y}" to="360 ${x} ${y}" dur="${dur}s" repeatCount="indefinite"/>`;
const swing = (x, y, phase, deg = 22, dur = 0.7) => `<animateTransform attributeName="transform" type="rotate" values="${-deg} ${x} ${y};${deg} ${x} ${y};${-deg} ${x} ${y}" dur="${dur}s" begin="${phase}s" repeatCount="indefinite"/>`;
function step(i) { // a monster foot lifting and putting down, the two feet taking turns
  return `<animateTransform attributeName="transform" type="translate" values="0 0;3 -7;0 0;0 0" dur="0.7s" begin="${i * 0.35}s" repeatCount="indefinite"/>`;
}
// A wheel with spokes, so the turning shows.
const wheel = (x, y, r, mv) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>`
  + `<g><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#9ca3af"/><path d="M${x - r * 0.55} ${y} H${x + r * 0.55} M${x} ${y - r * 0.55} V${y + r * 0.55}" stroke="${INK}" stroke-width="2.5"/>`
  + `<path d="M${x} ${y} V${y - r * 0.55}" stroke="#ef4444" stroke-width="3"/>${mv ? spin(x, y, r) : ''}</g>`;

const INSTRUMENTS = ['drum', 'trumpet', 'tuba', 'cymbals'];
// One band member seen from the side, facing right, feet at (x, y), scaled by s; tall hat with a plume.
// Legs swing while the parade moves (phase staggers them so the band doesn't step as one).
function sideWalker(x, y, s, { coat, cap, phase, mv, extra = '' }) {
  const leg = (dx, ph) => `<g><path d="M${dx} -16 L${dx} 0" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M${dx} -16 L${dx} 0" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/><path d="M${dx} 0 h5" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>${mv ? swing(dx, -16, ph) : ''}</g>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">` + leg(-2, phase) + leg(2, phase + 0.35)
    + `<rect x="-9" y="-44" width="18" height="30" rx="6" fill="${coat}" ${S} stroke-width="2"/>`
    + `<circle cx="1" cy="-52" r="8" fill="#fcd34d" ${S} stroke-width="2"/><circle cx="5" cy="-53" r="1.4" fill="${INK}"/>` + cap + extra + '</g>';
}
const BAND_CAP = `<rect x="-6" y="-74" width="14" height="16" rx="2" fill="#1d4ed8" ${S} stroke-width="2"/><rect x="-7" y="-60" width="16" height="3" fill="#facc15"/><path d="M1 -74 Q-1 -84 -6 -88" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>`;
const HELD = {
  drum: `<rect x="2" y="-34" width="16" height="14" rx="3" fill="#f8fafc" ${S} stroke-width="2"/><path d="M2 -30 L18 -24 M2 -24 L18 -30" stroke="#dc2626" stroke-width="2"/>`,
  trumpet: `<path d="M8 -46 L22 -48" stroke="#eab308" stroke-width="4" stroke-linecap="round"/><path d="M20 -54 L28 -56 L28 -40 L20 -42 Z" fill="#facc15" stroke="${INK}" stroke-width="2"/>`,
  tuba: `<circle cx="4" cy="-34" r="10" fill="none" stroke="#eab308" stroke-width="5"/><path d="M8 -46 Q14 -64 24 -64 L24 -52 Z" fill="#facc15" stroke="${INK}" stroke-width="2"/>`,
  cymbals: `<ellipse cx="14" cy="-34" rx="4" ry="10" fill="#fde047" stroke="${INK}" stroke-width="2"/><ellipse cx="20" cy="-34" rx="4" ry="10" fill="#fde047" stroke="${INK}" stroke-width="2"/>`,
};
const bandMember = (x, y, s, i, mv) => sideWalker(x, y, s, { coat: '#1d4ed8', cap: BAND_CAP, phase: (i % 3) * 0.23, mv, extra: HELD[INSTRUMENTS[i % 4]] });
const handler = (x, y, s, i, mv) => sideWalker(x, y, s, { coat: '#f97316', cap: `<path d="M-7 -58 Q1 -68 9 -58 Z" fill="#facc15" ${S} stroke-width="2"/>`, phase: (i % 2) * 0.3, mv,
  extra: `<path d="M6 -40 L12 -50" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` });

// ---------- rides ----------
// Each ride: lift (how far up the monster sits), scale, shift (x), side (monster seen side-on, facing right),
// walk (the monster's feet step), bob (the monster sways up and down), back(mv) drawn before it, front(mv) after.
// The parade moves LEFT TO RIGHT: vehicles face right, and whatever follows is on the left.
const RIDES = {
  float: { lift: 14, back: () => '', front: (mv) => `<path d="M18 186 H222 L212 222 H28 Z" fill="#a855f7" ${S}/><path d="${scallops()}" fill="#f0abfc" ${S}/>`
    + [[40, '#fde047'], [80, '#fb7185'], [160, '#fde047'], [200, '#fb7185']].map(([x, c], i) => light(x, 186, c, i, mv)).join('') },
  bus: { lift: 4, back: () => '', front: (mv) => `<rect x="14" y="150" width="212" height="62" rx="10" fill="#ef4444" ${S}/><rect x="14" y="146" width="212" height="10" rx="4" fill="#facc15" ${S}/>`
    + '<g fill="#bfdbfe" stroke="#1f2340" stroke-width="2"><rect x="26" y="166" width="30" height="22" rx="3"/><rect x="64" y="166" width="30" height="22" rx="3"/><rect x="146" y="166" width="30" height="22" rx="3"/><rect x="184" y="166" width="30" height="22" rx="3"/></g>'
    + `<rect x="214" y="190" width="10" height="8" rx="2" fill="#fde047"/>` + wheel(56, 214, 14, mv) + wheel(184, 214, 14, mv) },
  car: { lift: 0, back: () => '', front: (mv) => `<path d="M10 178 Q20 152 64 152 H180 Q220 152 230 178 V216 H10 Z" fill="#06b6d4" ${S}/><path d="M176 152 L164 134" ${S} stroke-width="4"/><rect x="214" y="168" width="12" height="10" rx="3" fill="#fde047"/><path d="M110 166 V206" stroke="${INK}" stroke-width="2" opacity=".5"/>` + wheel(54, 218, 15, mv) + wheel(186, 218, 15, mv) },
  firetruck: { lift: 6, back: () => '',
    front: (mv) => `<rect x="10" y="162" width="220" height="44" rx="6" fill="#dc2626" ${S}/><rect x="182" y="140" width="44" height="30" rx="5" fill="#dc2626" ${S}/><rect x="190" y="146" width="28" height="16" rx="3" fill="#bfdbfe" stroke="${INK}" stroke-width="2"/><circle cx="204" cy="136" r="6" fill="#60a5fa" ${S}/>` + ladder(22, 178, 172, 178) + wheel(48, 208, 15, mv) + wheel(196, 208, 15, mv) }, // a ladder mounted along the truck's side
  band: { lift: 0, shift: 10, scale: 0.92, side: true, walk: true, back: (mv) => {
    // The monster leads at the front right; the band follows on the left in two lines: the far line (smaller,
    // higher, further away) behind the monster, the near line (bigger) in front of it.
    return [18, 52, 86].map((x, i) => bandMember(x, 180, 0.95, i, mv)).join('');
  }, front: (mv) => [26, 72, 118].map((x, i) => bandMember(x, 230, 1.25, i + 1, mv)).join('') // the near line passes in front of the monster
    + (mv ? note(0.2, 100, 150, 8, -44) + note(1, 60, 156, 10, -40) + note(0.6, 46, 106, 8, -36) : '') }, // music from the band's horns
  balloon: { lift: 24, scale: 0.95, side: true, shine: true, bob: true,
    // Handlers on both sides: the far ones (smaller, higher) are drawn first, so the balloon hides part of them.
    back: (mv) => [76, 166].map((x, i) => rope(x + 7, 166, x + 7 + (120 - x) * 0.25, 166, mv) + handler(x, 204, 0.75, i, mv)).join(''),
    front: (mv) => [40, 140, 206].map((x, i) => rope(x + 10, 210, x + 10 + (120 - x) * 0.4, 172, mv) + handler(x, 233, 1.05, i + 1, mv)).join('') },
  unicycle: { lift: 20, side: true, back: () => '', front: (mv) => `<path d="M120 178 V188" ${S} stroke-width="6"/><ellipse cx="120" cy="178" rx="16" ry="5" fill="#ef4444" ${S}/>`
    + `<circle cx="120" cy="211" r="22" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="120" cy="211" r="19" fill="#fef3c7"/>`
    + `<g><path d="M120 193 V229 M102 211 H138" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="120" cy="195" r="3.5" fill="#ef4444"/>${mv ? spin(120, 211, 22) : ''}</g>`
    + `<circle cx="120" cy="211" r="4.5" fill="${INK}"/>` },
};
// The float's scalloped skirt.
function scallops() {
  let d = 'M28 222';
  for (let x = 28; x < 212; x += 20) d += ` Q${x + 10} ${x % 40 === 28 ? 208 : 211} ${Math.min(x + 20, 212)} 222`;
  return d;
}
// One of the float's lights; while moving they glow brighter one after another (a chase). Colour changes between a
// deep and a bright shade, so a light dims and brightens but never disappears.
const LIGHT_SHADES = { '#fde047': '#a16207', '#fb7185': '#9f1239' };
function light(x, y, c, i, mv) {
  const dim = LIGHT_SHADES[c] || c;
  const anim = mv ? `<animate attributeName="fill" values="${dim};${c};${dim};${dim}" dur="1.2s" begin="${(i * 0.3).toFixed(1)}s" repeatCount="indefinite"/>` : '';
  return `<circle cx="${x}" cy="${y}" r="9" fill="${c}" ${S} stroke-width="2">${anim}</circle>`;
}
// The fire truck's ladder from (x1,y1) to (x2,y2): two rails and rungs.
function ladder(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const nx = -uy * 7, ny = ux * 7; // half the ladder's width, across it
  const rail = (k) => `<path d="M${(x1 + nx * k).toFixed(1)} ${(y1 + ny * k).toFixed(1)} L${(x2 + nx * k).toFixed(1)} ${(y2 + ny * k).toFixed(1)}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
    + `<path d="M${(x1 + nx * k).toFixed(1)} ${(y1 + ny * k).toFixed(1)} L${(x2 + nx * k).toFixed(1)} ${(y2 + ny * k).toFixed(1)}" stroke="#e5e7eb" stroke-width="3.5" stroke-linecap="round"/>`;
  let rungs = '';
  for (let d = 8; d < len - 4; d += 12) {
    const cx = x1 + ux * d, cy = y1 + uy * d;
    rungs += `<path d="M${(cx - nx).toFixed(1)} ${(cy - ny).toFixed(1)} L${(cx + nx).toFixed(1)} ${(cy + ny).toFixed(1)}" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"/>`;
  }
  return rungs + rail(1) + rail(-1);
}
// A balloon rope from a handler's hand (x1,y1) up to the balloon (x2,y2); its top end sways with the balloon.
function rope(x1, y1, x2, y2, mv) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="2">${mv ? `<animate attributeName="y2" values="${y2};${y2 - 8};${y2}" dur="2.6s" repeatCount="indefinite"/>` : ''}</line>`;
}

const HATS = new Set(['tophat', 'crown', 'party', 'turkey']);
export const MONSTER_SCALE = 1.2;
export const VIEWBOX = '0 -50 240 290'; // tall enough for the tallest hat on the highest ride
// True if this ride shows the monster side-on (it then faces right, the way the parade goes).
export const sideOn = (ride) => !!(RIDES[ride] && RIDES[ride].side);
// The whole picture: the monster plus whatever it has so far. items = {extra?, outfit?, prop?, ride?} (item ids).
// opts.moving = the parade is rolling: wheels turn, legs march, the balloon bobs, props do their thing. Leave it
// off for still pictures (choices, the line-up) and when the device asks for reduced motion.
// opts.blink = the eyes blink now and then (on by default when moving; the game also turns it on for the big
// monster she is dressing, unless reduced motion).
export function scene(monster, items = {}, { moving = false, blink = moving, side: sideView } = {}) {
  const ride = RIDES[items.ride] || null;
  const mv = !!moving;
  const lift = ride ? ride.lift : 0;
  const k = MONSTER_SCALE * (ride && ride.scale ? ride.scale : 1);
  const side = sideView != null ? !!sideView : !!(ride && ride.side); // opts.side forces the view (review sheets)
  const shine = ride && ride.shine ? '<ellipse cx="84" cy="116" rx="6" ry="15" transform="rotate(12 84 116)" fill="#fff" opacity=".55"/>' : '';
  let outfit = OUTFIT[items.outfit] || '';
  let outfitBack = OUTFIT_BACK[items.outfit] || '';
  let prop = PROP[items.prop] ? PROP[items.prop](mv) : '';
  if (side) { // facing right: things on the face and head follow the turned face; capes and scarf ends stream back
    if (items.outfit === 'shades') outfit = `<g transform="translate(143 0) scale(0.78 1) translate(-120 0)">${outfit}</g>`;
    if (HATS.has(items.outfit) || items.outfit === 'cape') outfit = `<g transform="translate(8 0)">${outfit}</g>`;
    if (items.outfit === 'scarf') outfit = OUTFIT.scarf_side;
    if (items.outfit === 'cape') outfitBack = CAPE_SIDE(mv);
    if (items.prop === 'drum') prop = `<g transform="translate(9 0)">${prop}</g>`;
  }
  const extra = EXTRA[items.extra] ? EXTRA[items.extra](fillOf(monster), mv, side) : '';
  const body = extra + outfitBack + (PROP_BACK[items.prop] ? PROP_BACK[items.prop](mv) : '') + monsterSvg(monster, { side, walk: ride && ride.walk, mv, blink }) + shine
    + outfit + prop;
  const dx = ride && ride.shift ? ride.shift : 0;
  let me = `<g transform="translate(${120 + dx} ${200 - lift}) scale(${k}) translate(-120 -200)">${body}</g>`;
  if (ride && ride.bob && mv) me = `<g>${me}<animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="2.6s" repeatCount="indefinite"/></g>`;
  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="monster">${ride ? ride.back(mv) : ''}${me}${ride ? ride.front(mv) : ''}</svg>`;
}
