// Pony Express: carry the mail from St. Joseph, Missouri to Sacramento, California, as a young rider in 1860.
// History kept light and checked: the Pony Express ran April 1860 - October 1861 (it ended when the
// transcontinental telegraph was finished), riders carried mail in a leather mochila and changed horses at
// relay stations about every 10-15 miles, and the ~1,900-mile trip took about 10 days. Sources:
// https://postalmuseum.si.edu/moving-the-mail-the-pony-express  https://en.wikipedia.org/wiki/Pony_Express
// The landmarks (Fort Kearny, Chimney Rock, Fort Laramie, Independence Rock, South Pass, Salt Lake City) are on
// the route the riders shared with the Oregon Trail; the people and events are made up.
export default {
  id: 'pony', icon: '🐎', name: 'Pony Express', tagline: 'Ride the mail out West',
  blurb: 'It is 1860. Ride for the Pony Express and carry an important letter all the way from Missouri to California!',
  hero: { icon: '🐎', name: 'your horse' },
  food: { icon: '🥖', name: 'biscuits', pack: 'a sack of biscuits', packSize: 5, start: 6 },
  money: { icon: '🪙', name: 'coins', start: 10 },
  cargo: { icon: '✉️', wiggle: null, notes: [[0, 'The letter is safe in your mochila, the rider’s leather mail bag.'], [0.4, 'The letter is halfway across the country!'], [0.75, 'California is close. Keep that letter safe!']] },
  shop: { button: '🛒 Buy biscuits', items: ['a canteen of water', 'a pair of riding gloves'] },
  onTheWay: 'On the trail West', backTitle: 'Back in the saddle', back: 'You are riding on from {from}. A fresh horse is saddled and ready!',
  order: 'fixed',

  trail: [
    { stop: 'joseph' },
    { stop: 'kearny', legs: 2 },
    { stop: 'platte', legs: 2 },
    { stop: 'chimney', legs: 2 },
    { stop: 'laramie', legs: 2 },
    { fork: 'fork1', ways: [{ stop: 'southpass', legs: 1 }, { stop: 'independence', legs: 3 }] },
    { stop: 'saltlake', legs: 2 },
    { stop: 'sacramento', legs: 2 },
  ],
  forks: {
    fork1: { icon: '🪧', name: 'Toward the Rocky Mountains', text: ['The mountains are ahead. The station keeper says you can ride straight for the pass, or stop at a famous rock first.'],
      ways: ['⛰️ South Pass: ride straight over the mountains', '🪨 Independence Rock: a little longer, a famous stop'] },
  },
  stops: {
    joseph: { icon: '🏘️', name: 'St. Joseph, Missouri', type: 'store', shop: 'the station keeper', spell: 'The station keeper is writing the mail list. Help spell it!', text: [
      'It is April 1860, and the Pony Express is brand new! Riders carry mail all the way to California.',
      'A letter must get to a family in Sacramento. You are the rider!',
      'Riders change to a fresh horse every 10 to 15 miles, at little relay stations. First, pack some food!',
    ] },
    kearny: { icon: '🛖', name: 'Fort Kearny', type: 'questions', count: 2, reward: { money: 2 },
      act: 'help sort the mail', text: ['Fort Kearny, in Nebraska. Soldiers and travelers stop here.', 'The mail clerk needs help sorting letters!'],
      right: 'Sorted! The clerk pays you a coin.', end: 'Fresh horse, full canteen. Ride on!' },
    platte: { icon: '🌊', name: 'Platte River', type: 'crossing', text: ['The Platte River is wide and muddy. How will you cross?'], ways: [
      { id: 'ford', label: '🐎 Ride across the shallow part (1 question)', icon: '🐎', title: 'Fording the river', lines: ['Hold the mail bag up high!'], count: 1, act: 'find the shallow spot',
        good: { text: 'Splash, splash! You and your horse make it across.' }, meh: { text: 'The water was deeper than it looked! Some biscuits got soggy.', food: -1 } },
      { id: 'log', label: '🪵 Wait for the water to drop (2 questions)', icon: '🪵', title: 'Waiting by the river', lines: ['Watch the water level.'], again: 'It’s going down!', count: 2, act: 'check the river',
        step: 'A little lower…', good: { text: 'The river drops and you ride across easily.' } },
      { id: 'ferry', label: '⛴️ Pay for the ferry (4 🪙)', icon: '⛴️', cost: 4, good: { text: 'The ferryman poles you and your horse across.' } },
    ] },
    chimney: { icon: '🗼', name: 'Chimney Rock', type: 'questions', count: 2, reward: { money: 1 },
      act: 'spot the trail markers', text: ['A tall, skinny rock sticks up from the prairie like a chimney!', 'Travelers used it as a landmark to know they were on the right trail.'],
      right: 'There’s the next marker! A traveler tips you a coin.', end: 'Chimney Rock gets smaller behind you.' },
    laramie: { icon: '🏰', name: 'Fort Laramie', type: 'store', shop: 'the trader', spell: 'The trader is writing a list of supplies. Help spell it!', text: [
      'Fort Laramie, in Wyoming. Travelers buy food and fix their wagons here.', 'Time to stock up for the mountains!',
    ] },
    southpass: { icon: '⛰️', name: 'South Pass', type: 'questions', count: 3,
      act: 'ride up the next hill', text: ['South Pass is a wide, gentle gap through the Rocky Mountains. It was the easiest way across!'],
      right: 'Up and over!', end: 'You made it over the Rockies. Downhill from here!' },
    independence: { icon: '🪨', name: 'Independence Rock', type: 'questions', count: 2, reward: { food: 1 },
      act: 'read a name on the rock', text: ['A giant rock shaped like a whale’s back. Travelers carved their names on it!', 'It got its name from a Fourth of July celebration here.'],
      right: 'You read a name! A family shares a biscuit with you.', end: 'You ride on toward the mountains.' },
    saltlake: { icon: '🏞️', name: 'Salt Lake City', type: 'questions', count: 3, reward: { money: 1 },
      act: 'help at the busy station', text: ['A busy town by a huge, salty lake.', 'The station is very busy today. Lend a hand!'],
      right: 'Thank you! Here’s a coin.', end: 'The desert is next, then the Sierra Nevada mountains, then California!' },
    sacramento: { icon: '🌅', name: 'Sacramento, California', type: 'finale', text: [
      'You did it! Sacramento! People cheer as the Pony Express rider gallops into town.', 'You hand the letter to the family. They read it and smile from ear to ear.',
    ] },
  },
  events: [
    { id: 'shoe', icon: '🐴', text: 'Your horse lost a horseshoe!', act: 'fix the horseshoe',
      good: { text: 'Fixed! Clip-clop!' }, meh: { text: 'It takes a while. You eat a biscuit while you work.', food: -1 } },
    { id: 'storm', icon: '⛈️', text: 'Thunder! A prairie storm is coming.', act: 'find shelter',
      good: { text: 'You wait it out under a rocky ledge. Dry as a bone!' }, meh: { text: 'You get a little wet, and the letter stays dry.' } },
    { id: 'buffalo', icon: '🦬', text: 'A big herd of bison is crossing the trail!', act: 'count the bison',
      good: { text: 'So many! You wait, and a traveler shares food.', food: 2 }, meh: { text: 'You wait for them to pass.' } },
    { id: 'wagon', icon: '🛞', text: 'A family’s wagon is stuck in the mud.', act: 'help push it out',
      good: { text: 'Out it comes! They thank you with coins.', money: 3 }, meh: { text: 'With some help it comes out. They give you a coin.', money: 1 } },
    { id: 'map', icon: '🗺️', text: 'The trail splits. Which way is West?', act: 'read the map',
      good: { text: 'West it is! A station keeper gives you a coin for being on time.', money: 1 }, meh: { text: 'A little detour, then you find the trail.' } },
    { id: 'prairiedog', icon: '🐿️', text: 'Prairie dogs pop out of their holes!', act: 'steer around the holes',
      good: { text: 'Nice riding! No holes.' }, meh: { text: 'Bumpy! A biscuit falls out of your bag.', food: -1 } },
    { id: 'station', icon: '🛖', text: 'A relay station! You hop onto a fresh horse in under two minutes.' },
    { id: 'sunset', icon: '🌄', text: 'The sun sets over the prairie. The sky is orange and pink.' },
    { id: 'hawk', icon: '🦅', text: 'A hawk soars high above you.' },
  ],
  forage: { id: 'forage', icon: '🍒', text: 'Out of biscuits! Your tummy rumbles.', act: 'find food',
    good: { text: 'A station cook gives you a whole sack!', food: 4 }, meh: { text: 'Some wild berries. Enough to keep riding.', food: 2 } },
  calm: ['The prairie grass waves in the wind.', 'Gallop, gallop! The miles fly by.', 'You spot the next relay station. A fresh horse is waiting.', 'Your mochila bounces on the saddle.'],

  finale: { button: '✉️ Deliver the letter', title: 'Letter delivered!', lines: ['The Pony Express boss shakes your hand. “Best ride all year! Every rider needs a nickname. What’s yours?”'],
    ask: { label: 'Rider nickname', names: ['Lightning', 'Dusty Boots', 'Quick Feather', 'Prairie Star', 'Thunder Hooves', 'Swift Wind'] }, keep: 'That’s my name!',
    endIcon: '🎖️', endTitle: 'Rider “{name}”!', endText: 'You get a shiny Pony Express badge. Riders everywhere will hear about {name}!' },
  collect: { icon: '🎖️', label: 'Your rider badges' },
};
