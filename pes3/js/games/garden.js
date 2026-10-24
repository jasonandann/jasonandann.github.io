// My Garden: every finished question in any game grows the garden. It only ever grows.
import { el, gardenPoints, specialPlants } from '../util.js';

const FLOWERS = ['🌷', '🌻', '🌼', '🌸', '🌹', '🪻', '🌺', '🍄', '🪷', '💐'];
const PER_FLOWER = 4;   // points per new flower
const MAX_PLOTS = 30;
const SKY = ['🦋', '🐝', '🐞', '🐦', '🦋', '🐝'];

export function stage(pts) {
  const flowers = Math.min(MAX_PLOTS, Math.floor(pts / PER_FLOWER));
  const sprout = flowers < MAX_PLOTS ? pts % PER_FLOWER : 0; // 0..3 growth of the next plant
  const critters = Math.min(SKY.length, Math.floor(Math.max(0, pts - MAX_PLOTS * PER_FLOWER) / 10) + (flowers >= 8 ? 1 : 0));
  return { flowers, sprout, critters };
}

export function mount(root) {
  const { flowers, sprout, critters } = stage(gardenPoints());
  const plots = [];
  for (let i = 0; i < MAX_PLOTS; i++) {
    let sym = '';
    let cls = 'gd-plot';
    if (i < flowers) sym = FLOWERS[(i * 7 + 3) % FLOWERS.length];
    else if (i === flowers) { sym = ['🌱', '🌱', '🌿', '🌿'][sprout]; cls += ' young'; }
    plots.push(
      el('button', {
        class: cls, type: 'button', 'aria-label': sym ? 'plant' : 'empty soil',
        onclick: (e) => { const b = e.currentTarget; b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing'); },
      }, sym),
    );
  }
  const special = specialPlants(); // from Study Quest's Seed Ark
  const sky = el('div', { class: 'gd-sky' }, SKY.slice(0, critters).map((c, i) => el('span', { class: 'gd-critter', style: `--i:${i}` }, c)));
  root.append(
    el('p', { class: 'prompt' }, flowers === 0 && sprout === 0 ? 'Finish a question in any game to plant your first seed.' : 'Your garden grows every time you finish a question.'),
    sky,
    special.length ? el('div', { class: 'gd-special', 'aria-label': 'Special plants' },
      special.map((p) => el('span', { class: 'gd-rare' }, el('span', { class: 'gd-rare-icon' }, p.icon), el('span', {}, p.name)))) : null,
    el('div', { class: 'gd-field' }, plots),
  );
}
