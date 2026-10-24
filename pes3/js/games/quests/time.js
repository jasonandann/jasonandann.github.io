// Time Machine: the time machine broke into pieces that landed in different times. Every trip visits the times
// in a new (shuffled) order, so the map hides the next stops. History kept short and checked:
// T. rex ~68-66 million years ago; the Great Pyramid built for Pharaoh Khufu about 2560 BCE (~4,500 years ago);
// the Wright brothers' first flight, Dec 17, 1903, near Kitty Hawk, NC: 12 seconds, 120 feet; Apollo 11's
// Moon landing, July 20, 1969 (Neil Armstrong first to step out). Sources:
// https://www.worldhistory.org/timeline/Great_Pyramid_of_Giza/  https://www.airandspace.si.edu/stories/editorial/wright-brothers-made-history-kitty-hawk
export default {
  id: 'time', icon: '⏳', name: 'Time Machine', tagline: 'Zoom through history',
  blurb: 'Oops! Professor Tock’s time machine broke, and its gears flew to different times in history! Zoom through time with Tick the robot to find them all.',
  hero: { icon: '🤖', name: 'Tick' },
  food: { icon: '🍫', name: 'energy bars', pack: 'a box of energy bars', packSize: 5, start: 6 },
  money: { icon: '🪙', name: 'coins', start: 10 },
  token: { icon: '⚙️', name: 'gears' },
  order: 'shuffle',
  cargo: { icon: '⏰', wiggle: 0.4, notes: [[0, 'The time machine sputters. It needs its gears!'], [0.4, 'Whirr! The time machine is getting stronger.'], [0.75, 'Almost fixed! The clock is ticking happily.']] },
  shop: { button: '🛒 Buy energy bars', items: ['a flashlight', 'a time map'] },
  onTheWay: 'Zooming through time', backTitle: 'Back in the time machine', back: 'You are zooming on from {from}. Tick beeps hello!',

  trail: [
    { stop: 'lab' },
    { stop: 'dinos', legs: 2 },
    { stop: 'iceage', legs: 1 },
    { stop: 'pyramids', legs: 2 },
    { stop: 'castle', legs: 1 },
    { stop: 'flight', legs: 2 },
    { stop: 'moon', legs: 1 },
    { stop: 'today', legs: 2 },
  ],
  stops: {
    lab: { icon: '🧪', name: 'Professor Tock’s Lab', type: 'store', shop: 'Professor Tock', spell: 'Professor Tock is labeling a jar. Help him spell it!', text: [
      'BANG! Professor Tock’s time machine shook, and six gears flew out into different times!',
      '“Without the gears, it can’t take us home to today,” he says.',
      'Tick the robot climbs in. “Beep! Let’s go find them!” First, energy bars for the trip.',
    ] },
    dinos: { icon: '🦖', name: 'The Time of Dinosaurs', type: 'questions', count: 2, reward: { money: 1 }, prize: { token: 1 },
      act: 'sneak past the dinosaur', text: ['About 66 million years ago! Giant ferns everywhere, and… a T. rex!', 'There were no people yet. Only dinosaurs and other animals.'],
      right: 'Tiptoe, tiptoe. You find a coin by a footprint.', end: 'There’s the gear, next to a dinosaur egg! Grab it and go!' },
    iceage: { icon: '🦣', name: 'The Ice Age', type: 'crossing', prize: { token: 1 },
      text: ['Brrr! Thousands of years ago, ice covered lots of land. Woolly mammoths had long, shaggy fur to stay warm.', 'The gear is across a frozen river. How will you get there?'], ways: [
        { id: 'slide', label: '⛸️ Slide across the ice (1 question)', icon: '⛸️', title: 'Sliding on ice', lines: ['Careful, it’s slippery!'], count: 1, act: 'slide to the gear',
          good: { text: 'Wheee! You slide right up to the gear.' }, meh: { text: 'Bump! You slip, then eat an energy bar to warm up.', food: -1 } },
        { id: 'mammoth', label: '🦣 Ask a mammoth for a ride (2 questions)', icon: '🦣', title: 'A mammoth ride', lines: ['The mammoth looks friendly.'], again: 'Hold on to the fur!', count: 2, act: 'make friends with the mammoth',
          step: 'The mammoth lowers its trunk.', good: { text: 'The mammoth carries you across and picks up the gear with its trunk!' } },
        { id: 'sled', label: '🛷 Rent a sled (4 🪙)', icon: '🛷', cost: 4, good: { text: 'Zoom! The sled zips you over the ice to the gear.' } },
      ] },
    pyramids: { icon: '🔺', name: 'Ancient Egypt', type: 'questions', count: 3, reward: { money: 1 }, prize: { token: 1 },
      act: 'find the hidden door', text: ['About 4,500 years ago! Workers are building the Great Pyramid for the pharaoh Khufu.', 'It is made of over two million huge stone blocks.'],
      right: 'A worker shows you the way and gives you a coin.', end: 'The gear was in the sand by the pyramid!' },
    castle: { icon: '🏰', name: 'The Time of Castles', type: 'questions', count: 2, reward: { food: 1 }, prize: { token: 1 },
      act: 'answer the knight', text: ['Hundreds of years ago, kings and queens lived in stone castles with tall walls. Some had a moat full of water.', 'A knight guards the gate.'],
      right: '“Well said!” The cook gives you a treat.', end: 'The knight hands you the gear. “This fell from the sky!”' },
    flight: { icon: '✈️', name: 'Kitty Hawk, 1903', type: 'questions', count: 2, reward: { money: 2 }, prize: { token: 1 },
      act: 'help the Wright brothers', text: ['December 17, 1903. Orville and Wilbur Wright are about to fly the first airplane with an engine!', 'The very first flight lasts only 12 seconds.'],
      right: 'The brothers thank you with two coins.', end: 'Up it goes! And there’s the gear, stuck in the sand dune.' },
    moon: { icon: '🌕', name: 'The Moon, 1969', type: 'questions', count: 3, prize: { token: 1 },
      act: 'take a moon step', text: ['July 20, 1969. Neil Armstrong is the first person to walk on the Moon!', 'There is no air on the Moon, so you need a space suit.'],
      right: 'Boing! Moon steps are bouncy.', end: 'The last gear is floating by a moon rock. Got it!' },
    today: { icon: '🏡', name: 'Back to Today', type: 'finale', text: [
      'You put every gear back in the time machine. Whirr, click, ding!', 'The time machine glows… and ZOOM! You’re home, in today.',
    ] },
  },
  events: [
    { id: 'glitch', icon: '⚡', text: 'Bzzt! A time glitch! The buttons are mixed up.', act: 'fix the buttons',
      good: { text: 'Fixed! Tick beeps happily.' }, meh: { text: 'It takes a while. You eat an energy bar while you wait.', food: -1 } },
    { id: 'lostcoin', icon: '🪙', text: 'Coins from long ago are rolling around the floor!', act: 'pick them up',
      good: { text: 'Three old coins!', money: 3 }, meh: { text: 'One coin.', money: 1 } },
    { id: 'clock', icon: '🕰️', text: 'The time clock is spinning too fast!', act: 'slow it down',
      good: { text: 'Tick… tock… just right.' }, meh: { text: 'Whoa! You take a dizzy little detour.' } },
    { id: 'snack', icon: '🍎', text: 'Professor Tock left a snack drawer. It’s locked with a puzzle.', act: 'open the drawer',
      good: { text: 'Energy bars inside!', food: 3 }, meh: { text: 'One energy bar inside.', food: 1 } },
    { id: 'birds', icon: '🦤', text: 'A dodo bird hops into the time machine!', act: 'help it out',
      good: { text: 'The dodo goes home. It leaves a shiny coin behind!', money: 1 }, meh: { text: 'The dodo eats an energy bar, then waddles out.', food: -1 } },
    { id: 'map', icon: '🗺️', text: 'The time map is upside down!', act: 'read the time map',
      good: { text: 'Got it! Tick finds a coin in the map case.', money: 1 }, meh: { text: 'A short wrong turn, then back on track.' } },
    { id: 'swirl', icon: '🌀', text: 'Colors swirl past the window. Red, blue, green, gold!' },
    { id: 'echo', icon: '📣', text: 'You hear a voice from the future say, “Good job!”' },
    { id: 'wave', icon: '👋', text: 'You wave at yourself from yesterday. Time travel is funny!' },
  ],
  forage: { id: 'forage', icon: '🥕', text: 'Out of energy bars! Tick’s battery is low too.', act: 'find food',
    good: { text: 'Professor Tock’s emergency snack box!', food: 4 }, meh: { text: 'Enough to keep going.', food: 2 } },
  calm: ['Whirr, whirr. The time machine hums.', 'Tick counts the years as they zoom by.', 'Tick tock, tick tock.', 'The time machine rocks gently, like a boat.'],

  finale: { button: '⏰ Go home to today', title: 'Home again!', lines: ['Professor Tock hugs you. “You saved my time machine! Take a souvenir from your trip: a {kind}.”'],
    keep: 'Thank you!', endIcon: '🏡', endTitle: 'You saved the time machine!', endText: 'You put your {kind} on the shelf. What a trip through history!' },
  collect: { icon: '🏺', label: 'Souvenirs from history', itemName: '{kind}', kinds: [
    { id: 'fossil', name: 'dinosaur fossil', icon: '🦴' }, { id: 'pot', name: 'Egyptian pot', icon: '🏺' }, { id: 'shield', name: 'toy knight shield', icon: '🛡️' },
    { id: 'plane', name: 'model airplane', icon: '✈️' }, { id: 'moon', name: 'Moon postcard', icon: '🌕' },
  ] },
};
