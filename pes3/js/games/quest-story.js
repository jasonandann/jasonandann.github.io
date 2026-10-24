// Dragon Egg Quest: the story. Edit the words here; quest.js runs it.
// TRAIL = the stops in order. legs = trail steps walked before arriving (each step eats a snack and may bring
// an event). A fork offers two ways (short + harder, or long + gentle); quest.js remembers the choice.
// Stop types: store (buy a snack pack), questions (`count` questions, `reward` per right one), river (pick a way
// across), rest (no questions), finale (the egg hatches).
export const START = { snacks: 6, coins: 10 };
export const PACK = 5; // snacks in a snack pack
export const FERRY = 4; // coins for the river ferry

export const TRAIL = [
  { stop: 'village' },
  { stop: 'woods', legs: 2 },
  { stop: 'river', legs: 2 },
  { fork: 'fork1', ways: [{ stop: 'bridge', legs: 1 }, { stop: 'meadow', legs: 3 }] },
  { stop: 'market', legs: 2 },
  { stop: 'caves', legs: 2 },
  { fork: 'fork2', ways: [{ stop: 'pass', legs: 1 }, { stop: 'tower', legs: 3 }] },
  { stop: 'mountain', legs: 2 },
];

export const FORKS = {
  fork1: { icon: '🪧', name: 'A fork in the road', text: ['The path splits in two. An old sign points both ways.'],
    ways: ['🌉 Troll Bridge: short, but a troll guards it', '🌼 Sunny Meadow: the long way round'] },
  fork2: { icon: '🪧', name: 'Almost there!', text: ['Dragon Mountain is close! Two paths go up.'],
    ways: ['🏔️ Windy Pass: steep and short', '🦉 Owl Tower: the long, gentle road'] },
};

export const STOPS = {
  village: { icon: '🏡', name: 'Willow Village', type: 'store', shop: 'Mrs. Bramble', text: [
    'Granny Fern found an egg in her garden. It is warm, and it hums!',
    '“This is a dragon egg,” she says. “Its family lives on Dragon Mountain. Will you take it home?”',
    'You pack a bag, and your pony Pip is ready to go. First, snacks for the trip from Mrs. Bramble’s shop!',
  ] },
  woods: { icon: '🌲', name: 'Whispering Woods', type: 'questions', count: 2, reward: { coins: 2 },
    act: 'light a glowing mushroom', text: ['The trees whisper as you pass. It is dark under the leaves.', 'Glowing mushrooms can light the way.'],
    right: 'A mushroom glows! There is a coin under it.', end: 'The path glows blue and green. Onward!' },
  river: { icon: '🌊', name: 'Rushing River', type: 'river', text: ['The river is wide and fast. How will you cross?'] },
  bridge: { icon: '🧌', name: 'Troll Bridge', type: 'questions', count: 3, reward: { coins: 2 },
    act: 'answer the troll’s riddle', text: ['A big troll sits on the bridge. “Answer my three riddles,” he rumbles, “and you may cross!”'],
    right: 'The troll grins and tosses you a coin.', end: 'The troll bows. “Clever traveler! Off you go!”' },
  meadow: { icon: '🌼', name: 'Sunny Meadow', type: 'rest', gift: { snacks: 3 },
    text: ['Butterflies dance over the flowers. Pip munches the sweet grass.', 'You pick a basket of berries. +3 🍎'] },
  market: { icon: '🏪', name: 'Market Town', type: 'store', shop: 'Mr. Pepper', text: [
    'Market Town is busy! People sell hats, pots, and pies.', 'Mr. Pepper waves from his snack stall.',
  ] },
  caves: { icon: '💎', name: 'Crystal Caves', type: 'questions', count: 3, reward: { coins: 1 },
    act: 'light up a crystal', text: ['The path goes into a dark cave.', 'The crystals on the walls light up when you answer!'],
    right: 'A crystal sparkles! A coin falls out.', end: 'The whole cave twinkles like stars.' },
  pass: { icon: '🏔️', name: 'Windy Pass', type: 'questions', count: 3, reward: {},
    act: 'climb to the next ledge', text: ['The wind howls! Climb from ledge to ledge.'],
    right: 'Up you go! Pip scrambles after you.', end: 'You reach the top. The wind blows the clouds away!' },
  tower: { icon: '🦉', name: 'Owl Tower', type: 'questions', count: 2, reward: { snacks: 1 },
    act: 'help the owl sort her books', text: ['A wise owl lives in a tall tower full of books.', '“Hoo! Help me sort my books, and I will share my snacks.”'],
    right: 'The owl hoots and gives you a snack.', end: '“Hoo-ray!” says the owl. “Follow the brightest star.”' },
  mountain: { icon: '🌋', name: 'Dragon Mountain', type: 'finale', text: [
    'At last! Dragon Mountain! Big friendly dragons peek out of their caves.', 'The egg wiggles… and wiggles… CRACK!',
  ] },
};

// Things that happen on the trail between stops. act = what the question does ("Spell the word to …").
// good / meh = what happens if the answer is right / not right this time (never anything worse than a snack).
export const EVENTS = [
  { id: 'berries', icon: '🫐', text: 'A bush full of berries!', act: 'pick the ripest berries',
    good: { text: 'Yum! A whole handful.', snacks: 2 }, meh: { text: 'You find a few berries.', snacks: 1 } },
  { id: 'rain', icon: '🌧️', text: 'Rain clouds! Build a shelter to keep the egg cozy.', act: 'build the shelter',
    good: { text: 'Cozy and dry! The egg hums happily.' }, meh: { text: 'A bit damp, but the egg is fine. You eat a snack while you dry off.', snacks: -1 } },
  { id: 'shoe', icon: '🐴', text: 'Oh no, Pip lost a horseshoe!', act: 'fix the horseshoe',
    good: { text: 'Fixed! Pip trots happily.' }, meh: { text: 'It takes a while to fix. You eat a snack while you wait.', snacks: -1 } },
  { id: 'stream', icon: '🪙', text: 'Something shiny in the stream!', act: 'fish it out',
    good: { text: 'Coins! Three of them.', coins: 3 }, meh: { text: 'You find one coin.', coins: 1 } },
  { id: 'sign', icon: '🪧', text: 'An old sign. The letters are faded.', act: 'read the sign',
    good: { text: 'You read it! This way. There is a coin stuck on the post.', coins: 1 }, meh: { text: 'You take a little detour, then find the path again.' } },
  { id: 'wizard', icon: '🧙', text: 'A traveling wizard wants to swap riddles.', act: 'answer the wizard',
    good: { text: '“Splendid!” He gives you a bag of snacks.', snacks: 3 }, meh: { text: '“Good try!” He gives you a snack anyway.', snacks: 1 } },
  { id: 'squirrel', icon: '🐿️', text: 'A cheeky squirrel grabs a snack and runs up a tree!', act: 'get it back',
    good: { text: 'It drops the snack, and an acorn coin too!', coins: 1 }, meh: { text: 'The squirrel keeps it. It looks very happy.', snacks: -1 } },
  { id: 'fox', icon: '🦊', text: 'A little fox follows you for a while, then waves its tail goodbye.' },
  { id: 'stars', icon: '✨', text: 'You camp under the stars. The egg glows softly in the dark.' },
  { id: 'rainbow', icon: '🌈', text: 'A rainbow! Pip neighs with joy.' },
];

// When the snacks run out: never a dead end, just a stop to find food.
export const FORAGE = { id: 'forage', icon: '🍄', text: 'Your tummy rumbles. Out of snacks! Time to find some food.', act: 'find food',
  good: { text: 'Mushrooms, nuts and apples. A feast!', snacks: 4 }, meh: { text: 'You find enough to keep going.', snacks: 2 } };

export const CALM = ['Pip trots along the trail. Clip-clop, clip-clop.', 'The sun is warm. The egg hums a little song.',
  'Birds sing in the trees as you ride.', 'The trail winds over a hill. What a view!'];

// How the egg is doing, by how far along the trail you are (0..1).
export const EGG = [[0, 'The egg is warm and humming.'], [0.4, 'The egg wiggled!'], [0.75, 'Tap, tap! Something is moving inside!']];

export const DRAGON_COLORS = [
  { id: 'green', name: 'green', hue: 0 }, { id: 'blue', name: 'blue', hue: 100 }, { id: 'purple', name: 'purple', hue: 170 },
  { id: 'pink', name: 'pink', hue: 220 }, { id: 'gold', name: 'golden', hue: 300 },
];
export const DRAGON_NAMES = ['Sparky', 'Ember', 'Pebble', 'Twinkle', 'Mossy', 'Blaze', 'Puddle', 'Comet'];
