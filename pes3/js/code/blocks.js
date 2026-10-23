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

// Code Studio notes (C major, do = middle C) and wait lengths (arg = half-seconds).
export const NOTES = [
  { name: 'do', hz: 261.63 }, { name: 're', hz: 293.66 }, { name: 'mi', hz: 329.63 }, { name: 'fa', hz: 349.23 },
  { name: 'so', hz: 392.0 }, { name: 'la', hz: 440.0 }, { name: 'ti', hz: 493.88 }, { name: 'high do', hz: 523.25 },
];
// 1 -> "½", 2 -> "1", 3 -> "1½" (seconds)
export const halfSeconds = (n) => `${n >= 2 ? Math.floor(n / 2) : ''}${n % 2 ? '½' : ''}`;
const short = (t) => (String(t).length > 12 ? `${String(t).slice(0, 11)}…` : String(t));

// Code Studio blocks (ScratchJr-style). Moves are screen directions (➡️ is always right); turns spin the
// sprite. Category colours: motion blue/purple (turns as in the other games), looks pink, sound green,
// control orange, stop red.
export const STUDIO_OPS = {
  right: { icon: '➡️', word: (b) => `right ${b.arg}`, say: (b) => `move right ${b.arg}`, color: 'blue' },
  left: { icon: '⬅️', word: (b) => `left ${b.arg}`, say: (b) => `move left ${b.arg}`, color: 'blue' },
  up: { icon: '⬆️', word: (b) => `up ${b.arg}`, say: (b) => `move up ${b.arg}`, color: 'blue' },
  down: { icon: '⬇️', word: (b) => `down ${b.arg}`, say: (b) => `move down ${b.arg}`, color: 'blue' },
  turnL: { ...TURNS.left, color: 'blue' },
  turnR: { ...TURNS.right, color: 'purple' },
  turnL2: { ...TURNS.left2, color: 'blue' },
  turnR2: { ...TURNS.right2, color: 'purple' },
  home: { icon: '🏠', word: 'go home', say: 'go home', color: 'blue' },
  say: { icon: '💬', word: (b) => `“${short(b.arg)}”`, say: (b) => `say ${b.arg}`, color: 'pink' },
  grow: { icon: '🎈', word: 'grow', say: 'grow', color: 'pink' },
  shrink: { icon: '🤏', word: 'shrink', say: 'shrink', color: 'pink' },
  hide: { icon: '🙈', word: 'hide', say: 'hide', color: 'pink' },
  show: { icon: '👀', word: 'show', say: 'show', color: 'pink' },
  note: { icon: '🎵', word: (b) => NOTES[b.arg].name, say: (b) => `play ${NOTES[b.arg].name}`, color: 'green' },
  pop: { icon: '💥', word: 'pop', say: 'pop sound', color: 'green' },
  wait: { icon: '⏱️', word: (b) => `wait ${halfSeconds(b.arg)} s`, say: (b) => `wait ${halfSeconds(b.arg)} seconds`, color: 'orange' },
  repeat: { icon: '🔁', word: (b) => `repeat ${b.arg}`, say: (b) => `repeat ${b.arg} times`, color: 'orange' },
  forever: { icon: '♾️', word: 'forever', say: 'forever', color: 'orange' },
  stop: { icon: '⏹️', word: 'stop', say: 'stop everything', color: 'red' },
};
