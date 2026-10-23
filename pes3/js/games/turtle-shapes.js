// Copy-the-shape targets for Turtle Draw. Each target is the path its reference program draws,
// starting from the middle facing up; the tests check every solution matches its own outline.
// Only ¼ and ½ turns (v1). Programs are the same JSON the chips edit.
const F = (n) => ({ op: 'fwd', arg: n });
const B = (n) => ({ op: 'back', arg: n });
const R = { op: 'right' };
const L = { op: 'left' };
const L2 = { op: 'left2' };
const UP = { op: 'penup' };
const DOWN = { op: 'pendown' };
const REP = (n, ...body) => ({ op: 'repeat', arg: n, body });

export const SHAPES = [
  { id: 'line', name: 'Line', solution: [F(100)] },
  { id: 'ell', name: 'L', solution: [F(100), R, F(50)] },
  { id: 'u', name: 'U', solution: [L2, F(80), L, F(60), L, F(80)] },
  { id: 'square', name: 'Square', solution: [REP(4, F(80), R)] },
  { id: 'rect', name: 'Rectangle', solution: [REP(2, F(60), R, F(120), R)] },
  { id: 'plus', name: 'Plus sign', solution: [REP(4, F(60), B(60), R)] },
  { id: 'stairs', name: 'Staircase', solution: [REP(3, F(30), R, F(30), L)] },
  { id: 'dashes', name: 'Dashed line', solution: [REP(4, F(20), UP, F(20), DOWN)] },
  { id: 'spiral', name: 'Square spiral', solution: [F(20), R, F(20), R, F(40), R, F(40), R, F(60), R, F(60), R, F(80), R, F(80)] },
  { id: 'window', name: 'Window', solution: [REP(4, REP(4, F(60), R), R)] },
];
