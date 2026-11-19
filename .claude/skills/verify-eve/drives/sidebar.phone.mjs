export { notes } from './sidebar.mjs';

const order = (t) => t.page.evaluate(() => [...document.querySelectorAll('[data-row]')].filter((r) => r.offsetParent)
  .map((r) => ({ a: 'Plan', b: 'Groceries', c: 'Reading list', d: 'Garden' })[r.dataset.note]).join(', '));

const finger = (t, type, x, y, on) => t.page.evaluate(({ type, x, y, on }) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const touch = [{ identifier: 1, clientX: x, clientY: y }];
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : touch });
  Object.defineProperty(e, 'changedTouches', { value: touch });
  const target = on ? document.querySelector(on) : (window.__fingerOn ?? document.elementFromPoint(x, y));
  window.__fingerOn = target;
  target.dispatchEvent(e);
}, { type, x, y, on });

export default async (t) => {
  await t.page.locator('button[aria-label="Back"]:visible').tap();
  await t.ok('sidebar-phone-reorder', async () => (await order(t)) === 'Plan, Groceries, Reading list, Garden', 'the phone list starts Plan, Groceries, Reading list, Garden');
  await t.shot('phone-list');
  const from = await t.page.locator('[data-row][data-note="c"]:visible').boundingBox();
  const to = await t.page.locator('[data-row][data-note="a"]:visible').boundingBox();
  const x = from.x + from.width / 2;
  await finger(t, 'touchstart', x, from.y + from.height / 2, '[data-row][data-note="c"]');
  await t.wait(600);
  for (let i = 1; i <= 8; i++) {
    const y = from.y + from.height / 2 + ((to.y + 4) - (from.y + from.height / 2)) * (i / 8);
    await finger(t, 'touchmove', x, y);
    await t.wait(40);
  }
  await t.ok('sidebar-phone-reorder', () => t.page.evaluate(() => {
    const g = document.querySelector('.lifted');
    return g && g.textContent.includes('Reading list') && getComputedStyle(g).position === 'fixed';
  }), 'held for a moment and moved, a lifted copy of Reading list rides under the finger');
  await t.shot('phone-lifted');
  await finger(t, 'touchend', x, to.y + 4);
  await t.ok('sidebar-phone-reorder', async () => (await order(t)) === 'Reading list, Plan, Groceries, Garden'
    && (await t.page.locator('.lifted').count()) === 0, 'let go over the top of Plan, Reading list lands first in the list');
  await t.shot('phone-reorder');
};
