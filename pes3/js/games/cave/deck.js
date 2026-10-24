// Crystal Cave's cards and tiles (issue #61). PLACEHOLDER numbers until Jason's CSV of the board game's cards
// arrives; the CSV gives counts, needs and stars only, and every name here stays our own.
// Rows mirror the CSV columns: kind, color, name, count, needs {power, wisdom, magic, any}, stars, gives.
//   ability:  gives cards; each card is earned by answering a question (power = math, wisdom = spelling,
//             magic = either). gives.any = she picks the kinds (treasure counts as a kind there).
//   treasure: gives.treasure = draw that many treasure tokens.
//   monster:  needs cards to scare it away; stars when scared. look = how art.js draws it.
//   item:     a gem; needs cards to buy (no help allowed); stars.
export const TILES = [
  { kind: 'ability', color: 'green', name: 'Power Spark', count: 2, gives: { power: 1 } },
  { kind: 'ability', color: 'green', name: 'Wise Owl Feather', count: 2, gives: { wisdom: 1 } },
  { kind: 'ability', color: 'green', name: 'Magic Dust', count: 2, gives: { magic: 1 } },
  { kind: 'ability', color: 'green', name: 'Double Power', count: 1, gives: { power: 2 } },
  { kind: 'ability', color: 'green', name: 'Double Wisdom', count: 1, gives: { wisdom: 2 } },
  { kind: 'ability', color: 'green', name: 'Double Magic', count: 1, gives: { magic: 2 } },
  { kind: 'ability', color: 'green', name: 'Lucky Find', count: 1, gives: { any: 2 } },
  { kind: 'treasure', color: 'green', name: 'Shiny Pebbles', count: 1, gives: { treasure: 1 } },
  { kind: 'treasure', color: 'green', name: 'Old Treasure Sack', count: 1, gives: { treasure: 2 } },

  { kind: 'monster', color: 'gray', name: 'Muddle Mole', count: 1, needs: { power: 1, wisdom: 1 }, stars: 2, look: { shape: 'mole', color: '#a16207' } },
  { kind: 'monster', color: 'gray', name: 'Snickerbat', count: 1, needs: { wisdom: 1, magic: 1 }, stars: 2, look: { shape: 'bat', color: '#7c3aed' } },
  { kind: 'monster', color: 'gray', name: 'Grumblegob', count: 1, needs: { power: 2 }, stars: 2, look: { shape: 'goblin', color: '#65a30d' } },
  { kind: 'monster', color: 'gray', name: 'Puddle Slime', count: 1, needs: { power: 1, magic: 1 }, stars: 2, look: { shape: 'slime', color: '#0d9488' } },
  { kind: 'item', color: 'gray', name: 'Leaf Emerald', count: 1, needs: { power: 2 }, stars: 2, look: { color: '#16a34a' } },
  { kind: 'item', color: 'gray', name: 'Sky Sapphire', count: 1, needs: { wisdom: 2 }, stars: 2, look: { color: '#2563eb' } },
  { kind: 'ability', color: 'gray', name: 'Power Boots', count: 1, gives: { power: 2 } },
  { kind: 'ability', color: 'gray', name: 'Story Scroll', count: 1, gives: { wisdom: 2 } },
  { kind: 'ability', color: 'gray', name: 'Glow Potion', count: 1, gives: { magic: 2 } },
  { kind: 'ability', color: 'gray', name: 'Grab Bag', count: 1, gives: { any: 3 } },
  { kind: 'treasure', color: 'gray', name: 'Dusty Chest', count: 2, gives: { treasure: 2 } },

  { kind: 'monster', color: 'red', name: 'Bramble Troll', count: 1, needs: { power: 3, wisdom: 1 }, stars: 4, look: { shape: 'troll', color: '#4d7c0f' } },
  { kind: 'monster', color: 'red', name: 'Hissy Hydra', count: 1, needs: { wisdom: 2, magic: 2 }, stars: 4, look: { shape: 'snake', color: '#be123c' } },
  { kind: 'monster', color: 'red', name: 'Gloomspider', count: 1, needs: { power: 2, magic: 2 }, stars: 4, look: { shape: 'spider', color: '#334155' } },
  { kind: 'monster', color: 'red', name: 'Rattlebones', count: 1, needs: { power: 1, wisdom: 2, magic: 1 }, stars: 4, look: { shape: 'skeleton', color: '#e7e5e4' } },
  { kind: 'monster', color: 'red', name: 'Sulky Ogre', count: 1, needs: { power: 3, magic: 1 }, stars: 4, look: { shape: 'troll', color: '#b45309' } },
  { kind: 'monster', color: 'red', name: 'Mist Wisp', count: 1, needs: { wisdom: 3, magic: 1 }, stars: 4, look: { shape: 'ghost', color: '#94a3b8' } },
  { kind: 'monster', color: 'red', name: 'Grimble the Grump', count: 1, needs: { power: 2, any: 2 }, stars: 5, look: { shape: 'goblin', color: '#15803d', crown: true } },
  { kind: 'monster', color: 'red', name: 'Old Smoky', count: 1, needs: { power: 2, wisdom: 2, magic: 2 }, stars: 6, look: { shape: 'dragon', color: '#dc2626' } },
  { kind: 'item', color: 'red', name: 'Ruby Heart', count: 1, needs: { power: 1, wisdom: 1, magic: 1 }, stars: 3, look: { color: '#dc2626' } },
  { kind: 'item', color: 'red', name: 'Moon Pearl', count: 1, needs: { magic: 3 }, stars: 3, look: { color: '#a78bfa' } },
  { kind: 'item', color: 'red', name: 'Sun Topaz', count: 1, needs: { power: 2, wisdom: 1 }, stars: 3, look: { color: '#f59e0b' } },
  { kind: 'item', color: 'red', name: 'Star Opal', count: 1, needs: { wisdom: 2, magic: 1 }, stars: 3, look: { color: '#ec4899' } },
  { kind: 'ability', color: 'red', name: 'Giant Strength', count: 1, gives: { power: 3 } },
  { kind: 'ability', color: 'red', name: 'Ancient Book', count: 1, gives: { wisdom: 3 } },
  { kind: 'ability', color: 'red', name: 'Wizard Lantern', count: 1, gives: { magic: 2, treasure: 1 } },
  { kind: 'treasure', color: 'red', name: 'Dragon Hoard', count: 2, gives: { treasure: 2 } },
  { kind: 'treasure', color: 'red', name: 'King’s Chest', count: 1, gives: { treasure: 3 } },
];

// The treasure bag. No negative treasure (Jason, issue #61), and every hero gets the same stars.
export const TREASURE = [
  { name: 'Silver coin', icon: '🪙', stars: 1, count: 8 },
  { name: 'Coin pouch', icon: '💰', stars: 1, count: 4 },
  { name: 'Golden cup', icon: '🏆', stars: 2, count: 5 },
  { name: 'Jewel ring', icon: '💍', stars: 2, count: 3 },
  { name: 'Crown', icon: '👑', stars: 3, count: 2 },
  { name: 'Giant diamond', icon: '💎', stars: 3, count: 2 },
];

// Kind Badges (the board game's "Kind Kid" cards): one for each card you give a friend. Always good. You keep
// them and use one on your own turn when you like (Jason, 2026-10-24); a Gold Star just counts at the end, and
// unused hearts and treasure maps are cashed in when the game ends.
export const BADGES = [
  { name: 'Extra Heart', icon: '❤️', effect: 'heart', text: '+1 heart', count: 4 },
  { name: 'Bonus Card', icon: '🃏', effect: 'card', text: 'a Power, Wisdom or Magic card: you choose', count: 6 },
  { name: 'Gold Star', icon: '⭐', effect: 'star', text: '1 star at the end', count: 5 },
  { name: 'Treasure Map', icon: '🗺️', effect: 'treasure', text: 'find a treasure', count: 5 },
];

// Quests: done at the end of your turn if `need` holds (counts are totals for the game, hand = cards now).
export const QUESTS = [
  { name: 'Strong Hands', text: 'Hold 3 Power cards', need: { power: 3 }, stars: 2 },
  { name: 'Book Smart', text: 'Hold 3 Wisdom cards', need: { wisdom: 3 }, stars: 2 },
  { name: 'Spark Keeper', text: 'Hold 3 Magic cards', need: { magic: 3 }, stars: 2 },
  { name: 'One of Each', text: 'Hold 1 Power, 1 Wisdom and 1 Magic', need: { power: 1, wisdom: 1, magic: 1 }, stars: 2 },
  { name: 'Full Pockets', text: 'Hold 5 cards', need: { cards: 5 }, stars: 3 },
  { name: 'Brave Kid', text: 'Scare away 2 bad guys', need: { scared: 2 }, stars: 2 },
  { name: 'Monster Chaser', text: 'Scare away 3 bad guys', need: { scared: 3 }, stars: 3 },
  { name: 'Good Friend', text: 'Get 2 Kind Badges', need: { kind: 2 }, stars: 2 },
  { name: 'Treasure Hunter', text: 'Find 3 treasures', need: { treasure: 3 }, stars: 2 },
  { name: 'Gem Finder', text: 'Get a gem', need: { gems: 1 }, stars: 2 },
  { name: 'Healthy Hero', text: 'Have 4 hearts', need: { hearts: 4 }, stars: 2 },
];

export const START = { hearts: 3, maxHearts: 5, heartStars: 1 };
