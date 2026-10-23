// Robot Course levels. Map key:
//   ^ > v <  robot start, facing up / right / down / left     F  flag (goal)
//   #  wall     c  cone (blocks like a wall)     *  gem (optional)     +  path tile (decoration)
//   .  empty
// solution: one known program (f forward, b back, l ¼ counter-clockwise, r ¼ clockwise); the
// tests run it. It is never shown to her. Ramp: straight -> one turn -> two turns ->
// turn around -> gems -> mazes. Ids are stable so a finished ⭐ survives reordering.
export const LEVELS = [
  { id: 'straight', name: 'Straight ahead', solution: 'ffff', map: [
    '.....',
    '.....',
    '>+++F',
    '.....',
    '.....'] },
  { id: 'up', name: 'Up, up, up', solution: 'ffff', map: [
    '..F..',
    '..+..',
    '..+..',
    '..+..',
    '..^..'] },
  { id: 'backup', name: 'Back it up', solution: 'bbb', map: [
    '.....',
    '.....',
    'F++>.',
    '.....',
    '.....'] },
  { id: 'oneturn', name: 'One turn', solution: 'fffflff', map: [
    '.....',
    '....F',
    '....+',
    '>++++',
    '.....'] },
  { id: 'otherway', name: 'Turn the other way', solution: 'fffrff', map: [
    '.....',
    '.++F.',
    '.+...',
    '.+...',
    '.^...'] },
  { id: 'zigzag', name: 'Zig-zag', solution: 'ffflffrf', map: [
    '.....',
    '...+F',
    '...+.',
    '>+++.',
    '.....'] },
  { id: 'wall', name: 'Wall in the way', solution: 'flffrfffrff', map: [
    '.....',
    '.+++.',
    '.+#+.',
    '>+#+F',
    '..#..'] },
  { id: 'turnaround', name: 'Turn around', solution: 'llfff', map: [
    '.....',
    '.....',
    'F++>#',
    '.....',
    '.....'] },
  { id: 'behind', name: 'Behind you', solution: 'llfflff', map: [
    'F++..',
    '..+..',
    '..v..',
    '.....',
    '.....'] },
  { id: 'gempath', name: 'Gem on the path', solution: 'fffrfff', map: [
    '.....',
    '>+*+.',
    '....+',
    '....+',
    '...F+'] },
  { id: 'gemdetour', name: 'Gem detour', solution: 'ffffrffrffff', map: [
    '..*..',
    '..#..',
    '>++++',
    '#...+',
    'F+++*'] },
  { id: 'littlemaze', name: 'Little maze', solution: 'llfflffflffrff', map: [
    '^.#..F',
    '..#.#.',
    '....#.',
    '##....',
    '*.....'] },
  { id: 'conegarden', name: 'Cone garden', solution: 'ffrflfrflff', map: [
    '..c...',
    '>..c..',
    'c...c.',
    '..c..F',
    '.c..c.',
    '......'] },
  { id: 'snake', name: 'Snake', solution: 'flfffffrffrffffflfflfffff', map: [
    'F+++++',
    '#####+',
    '++++++',
    '+#####',
    '++++++',
    '#####^'] },
  { id: 'tworooms', name: 'Two rooms', solution: 'llfffflffffrffrffff', map: [
    '^..#...',
    '.#.#.#.',
    '.#...#.',
    '.#####.',
    '...*...',
    '####.##',
    'F....*.'] },
  { id: 'gemhunt', name: 'Gem hunt', solution: 'fffrfffrffflfff', map: [
    '*...#.*',
    '.##.#..',
    '.#..##.',
    '^.#*..F',
    '.#.##.#',
    '.#....#',
    '*..##.*'] },
  { id: 'bigmaze', name: 'Big maze', solution: 'frffrflfflffrflffrflfflf', map: [
    '>.#....',
    '#.#.##.',
    '..#..#.',
    '.###.#.',
    '...#.#.',
    '##...#F',
    '.*.#...'] },
  { id: 'longway', name: 'The long way round', solution: 'fffffflfffflfffffrffrfffff', map: [
    'F#.....',
    '.#.###.',
    '.#.#*#.',
    '.#.#.#.',
    '.#...#.',
    '...#.#.',
    '####.#^'] },
];
