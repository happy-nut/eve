import { expect, test } from 'vitest';
import { SLASH, slashItems, type SuggestItem } from './slash';
import { ICONS } from './lineIcons';
import { TURN } from './blockHandle';

const everyRow = (items: SuggestItem[]): SuggestItem[] => items.flatMap((i) => [i, ...everyRow(i.sections ?? [])]);
const all = everyRow([...SLASH, ...slashItems('color'), ...slashItems('text')]);

test('every row of the bare / menu has a picture of its own and sits under a group heading', () => {
  const bare = slashItems('');
  expect(bare.filter((i) => !i.icon).map((i) => i.label)).toEqual([]);
  expect(bare.filter((i) => !i.group).map((i) => i.label)).toEqual([]);
  const twice = bare.filter((i, n) => bare.findIndex((j) => j.icon === i.icon) !== n).map((i) => i.label);
  expect(twice).toEqual([]);
});

test('every row the / menu can show has an icon or a colour, and the plain T is Text alone', () => {
  expect(all.filter((i) => !i.icon && !i.swatch).map((i) => i.label)).toEqual([]);
  expect(all.filter((i) => i.icon === ICONS.text && i.label !== 'Text').map((i) => i.label)).toEqual([]);
});

test('typed, the / menu is one list: no group headings among ranked matches', () => {
  expect(slashItems('li').filter((i) => i.group).map((i) => i.label)).toEqual([]);
});

test('the ⋮⋮ menu draws each kind of block with the picture the / menu draws for it', () => {
  for (const [, label, icon] of TURN) {
    const slash = all.find((i) => i.label === label);
    expect(slash, `${label} is in the / menu`).toBeTruthy();
    expect(ICONS[icon], label).toBe(slash!.icon);
  }
});
