// Study Quest stories. Each file exports one story object; quest.js runs any of them. To add a story: write a
// file shaped like dragon.js and add it to STORIES (the picker shows them in this order). Every story is checked
// by checkStory() in the tests.
//
// Story shape:
//   id, icon, name, tagline (picker card), blurb (story screen)
//   hero {icon, name}             who travels with her (the map marker)
//   food {icon, name, pack, packSize, start}   eaten one per step; name is plural ("snacks"), pack = what a shop sells
//   money {icon, name, start}      plural name ("coins")
//   token {icon, name}?           optional collectible: stops with `prize: {token: 1}` give one; the bag shows n/total
//   cargo {icon, wiggle, notes}    what she carries: notes = [[fraction of the trail, line], ...]; wiggle = fraction
//                                  after which it wobbles (null = never)
//   shop {button, items: [two things that cost money, e.g. 'a bag of apples']}
//   onTheWay, backTitle, back ('... {from} ...')   trail-step and continue-screen wording
//   order: 'fixed' | 'shuffle'    shuffle = every stop but the first and last in a new order each trip (no forks)
//   blanks?: true                 spelling questions show the word's list sentence with a gap
//   trail: [{stop, legs}, {fork, ways: [{stop, legs}, {stop, legs}]}, ...]   first entry has no legs; last = finale
//   forks: {id: {icon, name, text: [...], ways: [label, label]}}
//   stops: {id: {icon, name, type, text: [...], ...}}, type =
//     store {shop, spell?}  questions {count, act, right, end, reward?}  rest {gift}
//     crossing {ways: [{id, label, icon, title, lines, count, act, step?, again?, cost?, good, meh?}]}  finale
//     any stop may have prize {token|food|money: n}, given once when she leaves it
//   events: [{id, icon, text, act?, good?, meh?}]  (no act = just a moment; good/meh = {text, food?, money?})
//   forage: an event used when food runs out (always gives food)
//   calm: [lines for a quiet step]
//   finale {button, title, lines, ask?: {label, names}, keep, endIcon, endTitle, endText}   {kind} / {name} fill in
//   collect {icon, label, itemName?, kinds?: [{id, name, icon?, hue?}], garden?}
//     ask = she names it; otherwise itemName ('{kind} lantern'); garden = also adds a special plant to My Garden
import dragon from './dragon.js';
import island from './island.js';
import library from './library.js';
import lantern from './lantern.js';
import seeds from './seeds.js';
import pony from './pony.js';
import time from './time.js';
import space from './space.js';

export const STORIES = [dragon, island, library, lantern, seeds, pony, time, space];

// Problems with a story's data, as a list of strings (empty = fine).
export function checkStory(s) {
  const bad = [];
  const need = (cond, msg) => { if (!cond) bad.push(`${s.id}: ${msg}`); };
  for (const k of ['id', 'icon', 'name', 'tagline', 'blurb', 'hero', 'food', 'money', 'cargo', 'shop', 'trail', 'stops', 'events', 'forage', 'calm', 'finale', 'collect', 'onTheWay', 'backTitle', 'back']) need(s[k] != null, `missing ${k}`);
  if (bad.length) return bad;
  need(/^[a-z]+$/.test(s.id), 'id must be lowercase letters');
  need(s.shop.items.length === 2 && s.shop.items.every((x) => !/\d/.test(x)), 'shop.items: two things, no digits');
  need(s.cargo.notes[0][0] === 0, 'cargo.notes must start at 0');
  const used = [];
  s.trail.forEach((t, i) => {
    const ways = t.fork ? t.ways : [t];
    if (t.fork) {
      need(s.order !== 'shuffle', 'a shuffled story cannot have forks');
      need(s.forks?.[t.fork]?.ways?.length === t.ways.length, `fork ${t.fork} needs a label per way`);
      need(!!s.stops[t.ways[0].stop]?.prize === !!s.stops[t.ways[1].stop]?.prize, `fork ${t.fork}: both ways give a prize or neither`);
    }
    for (const w of ways) {
      const d = s.stops[w.stop];
      used.push(w.stop);
      need(d, `trail ${i}: unknown stop ${w.stop}`);
      if (!d) continue;
      need(i === 0 ? !w.legs : w.legs >= 1, `trail ${i}: legs`);
      need((d.type === 'finale') === (i === s.trail.length - 1), `${w.stop}: only the last stop is the finale`);
      if (d.type === 'store') need(d.shop, `${w.stop}: shop name`);
      if (d.type === 'questions') need(d.count >= 1 && d.act && d.right && d.end, `${w.stop}: count/act/right/end`);
      if (d.type === 'crossing') for (const c of d.ways) need(c.id && c.label && c.good?.text && (c.count ? c.act && c.title && c.lines && (c.count < 2 || (c.step && c.again)) : c.cost > 0), `${w.stop}: way ${c.id}`);
      if (d.type === 'rest') need(d.gift, `${w.stop}: gift`);
    }
  });
  need(s.stops[s.trail[0].stop]?.type === 'store', 'the first stop should be a shop (she stocks up)');
  for (const id of Object.keys(s.stops)) need(used.includes(id), `stop ${id} is not on the trail`);
  for (const e of [...s.events, s.forage]) need(e.id && e.icon && e.text && (!e.act || (e.good?.text && e.meh?.text)), `event ${e.id}`);
  need(s.forage.act && s.forage.good.food > 0 && s.forage.meh.food > 0, 'forage must always give food');
  for (const e of s.events) for (const r of [e.good, e.meh]) need(!r || !r.food || r.food >= -1, `event ${e.id}: a miss costs at most one food`);
  const f = s.finale;
  need(f.button && f.title && f.lines && f.keep && f.endTitle && f.endText, 'finale wording');
  need(f.ask ? f.ask.names?.length && f.ask.label : s.collect.itemName, 'finale: ask for a name, or collect.itemName');
  need(s.collect.icon && s.collect.label, 'collect icon/label');
  return bad;
}
