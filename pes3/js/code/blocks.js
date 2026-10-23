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
