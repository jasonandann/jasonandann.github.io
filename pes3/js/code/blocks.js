// Block vocabulary shared by the coding games. Every turn shows its arrow AND its word
// (she sometimes mixes up clockwise and counter-clockwise). No degrees in kid-facing text.
export const TURNS = {
  right: { icon: '↻', word: '¼ clockwise', say: 'quarter turn clockwise' },
  left: { icon: '↺', word: '¼ counter-clockwise', say: 'quarter turn counter-clockwise' },
  right2: { icon: '↻', word: '½ clockwise', say: 'half turn clockwise' },
  left2: { icon: '↺', word: '½ counter-clockwise', say: 'half turn counter-clockwise' },
};

// Robot Course (Kinderbot) keys. color = the key's colour on the toy; chips use it too.
export const ROBOT_OPS = {
  fwd: { icon: '⬆', word: 'forward', say: 'forward', color: 'green' },
  back: { icon: '⬇', word: 'back', say: 'back', color: 'red' },
  left: { ...TURNS.left, color: 'blue' },
  right: { ...TURNS.right, color: 'purple' },
};

// Turtle Draw pen colours. n = the standard Logo SETPENCOLOR index (0 black, 1 blue, 2 green/lime, 4 red,
// 5 magenta, 8 brown, 13 plum/purple, 14 orange per https://fmslogo.sourceforge.io/manual/command-setpencolor.html;
// UCBLogo says numbers depend on the system), so the text view reads as real Logo.
export const PEN_COLORS = [
  { n: 0, name: 'black', css: '#1f2340' },
  { n: 1, name: 'blue', css: '#2563eb' },
  { n: 2, name: 'green', css: '#16a34a' },
  { n: 4, name: 'red', css: '#dc2626' },
  { n: 5, name: 'pink', css: '#db2777' },
  { n: 8, name: 'brown', css: '#92400e' },
  { n: 13, name: 'purple', css: '#9333ea' },
  { n: 14, name: 'orange', css: '#f97316' },
];
export const penColor = (n) => PEN_COLORS.find((c) => c.n === n) || PEN_COLORS[0];

// Turtle Draw blocks. arg = distance (forward/back), times (repeat) or SETPENCOLOR number (color).
export const TURTLE_OPS = {
  fwd: { icon: '⬆️', word: (b) => `forward ${b.arg}`, say: (b) => `forward ${b.arg}`, color: 'green' },
  back: { icon: '⬇️', word: (b) => `back ${b.arg}`, say: (b) => `back ${b.arg}`, color: 'red' },
  left: { ...TURNS.left, color: 'blue' },
  right: { ...TURNS.right, color: 'purple' },
  left2: { ...TURNS.left2, color: 'blue' },
  right2: { ...TURNS.right2, color: 'purple' },
  pendown: { icon: '✏️', word: 'pencil down', say: 'pencil down', color: 'grey' },
  penup: { icon: '✏️', iconClass: 'pen-up', word: 'pencil up', say: 'pencil up', color: 'grey' },
  color: { icon: '🎨', word: (b) => penColor(b.arg).name, say: (b) => `colour ${penColor(b.arg).name}`, swatch: (b) => penColor(b.arg).css, color: 'yellow' },
  repeat: { icon: '🔁', word: (b) => `repeat ${b.arg}`, say: (b) => `repeat ${b.arg} times`, color: 'orange' },
};
