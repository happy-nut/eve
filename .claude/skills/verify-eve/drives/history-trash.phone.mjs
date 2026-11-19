const touch = (t, type, dx) => t.page.evaluate(([type, dx]) => {
  const el = document.querySelector('aside [data-note="c"]');
  const r = el.getBoundingClientRect();
  const at = { clientX: r.right - 20 + dx, clientY: r.top + r.height / 2, target: el, identifier: 1 };
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [at] });
  Object.defineProperty(e, 'changedTouches', { value: [at] });
  el.dispatchEvent(e);
}, [type, dx]);
const question = (t) => t.page.evaluate(() => document.querySelector('.box[role="dialog"]')?.innerText ?? '');

export default async (t) => {
  await t.click('button[aria-label="Back"]:visible');
  await t.page.waitForSelector('aside [data-note="c"]', { state: 'visible' });
  await touch(t, 'touchstart', 0);
  for (let i = 1; i <= 10; i++) { await touch(t, 'touchmove', -25 * i); await t.wait(16); }
  await t.ok('trash-swipe', () => t.page.evaluate(() => {
    const row = document.querySelector('aside [data-note="c"]');
    const act = row.closest('.note-row').querySelector('.swipe-act');
    const shown = getComputedStyle(act);
    return shown.display === 'flex' && act.textContent.trim() === 'Delete' && shown.backgroundColor === 'rgb(255, 69, 58)'
      && row.getBoundingClientRect().left < act.getBoundingClientRect().left - 100;
  }), 'the row pulled left slides over a red Delete');
  await t.shot('swiping');
  await touch(t, 'touchend', -250);
  await t.ok('trash-swipe', async () => (await question(t)).includes('Delete “Reading list”?'), 'let go, the question Delete “Reading list”? comes up');
  await t.wait(1000);
  await t.shot('question');
  await t.click('button.primary:has-text("Delete")');
  await t.ok('trash-swipe', () => t.page.evaluate(() => localStorage.getItem('eve.notes.c').includes('\ndeleted: true\n')
    && !document.querySelector('aside [data-note="c"]')), 'Delete takes Reading list off the list into the Trash');
};
