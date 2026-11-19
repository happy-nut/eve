const tipText = (t) => t.page.evaluate(() => document.querySelector('.tip')?.textContent.replace(/\s+/g, '') ?? null);
const hintText = (t) => t.page.evaluate(() => document.querySelector('.hint[role="status"]')?.textContent.replace(/\s+/g, '') ?? null);
const seen = (t) => t.page.evaluate(() => JSON.parse(localStorage.getItem('eve.hints') ?? '{}'));
const hover = async (t, selector) => {
  const b = await t.page.locator(selector).first().boundingBox();
  await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  return b;
};
const slash = async (t, item) => {
  await t.click('.tiptap > p >> nth=-1');
  await t.key('End');
  await t.key('Enter');
  await t.type(`/${item}`);
  await t.wait(300);
  await t.key('Enter');
  await t.wait(500);
  await t.type('x');
};
const later = (t) => t.page.clock.fastForward(26_000);
const CALLOUT = '💡Callouthasashortcut⌘⇧C×';

export default async (t) => {
  await t.page.clock.install();
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.wait(800);

  const nb = await hover(t, 'button[aria-label="New"]');
  await t.ok('tooltip-show', async () => (await tipText(t)) === 'New⌘N' && await t.page.evaluate((nb) => {
    const r = document.querySelector('.tip').getBoundingClientRect();
    return r.top >= nb.y + nb.height && Math.abs(r.left + r.width / 2 - (nb.x + nb.width / 2)) < 2;
  }, nb), 'resting on the top bar + shows a tip New ⌘ N centred under it');
  await t.shot('tip-new');
  await t.key('Shift');
  await t.ok('tooltip-hide', async () => (await tipText(t)) === null, 'a key press puts the tip away');

  const gb = await hover(t, 'aside button[aria-label="Settings"]');
  await t.ok('tooltip-show', async () => (await tipText(t)) === 'Settings⌘,' && await t.page.evaluate((gb) => {
    const r = document.querySelector('.tip').getBoundingClientRect();
    return r.bottom <= gb.y && r.left >= 0 && r.right <= innerWidth && r.top >= 0;
  }, gb), 'resting on the sidebar gear shows Settings ⌘ , above it, inside the window');
  await t.shot('tip-gear');
  await t.page.mouse.move(700, 450, { steps: 4 });
  await t.ok('tooltip-hide', async () => (await tipText(t)) === null, 'the mouse leaving the gear puts the tip away');
  await hover(t, 'button[aria-label="New"]');
  await t.ok('tooltip-hide', async () => (await tipText(t)) === 'New⌘N', 'back on +, the tip shows again');
  await t.page.mouse.down();
  await t.page.mouse.move(700, 450);
  await t.page.mouse.up();
  await t.ok('tooltip-hide', async () => (await tipText(t)) === null, 'a press puts it away');

  await slash(t, 'callout');
  await t.ok('hint-show', async () => (await hintText(t)) === CALLOUT && await t.page.evaluate(() => {
    const r = document.querySelector('.hint').getBoundingClientRect();
    const left = document.querySelector('aside').getBoundingClientRect().right;
    return Math.abs(r.left + r.width / 2 - (left + (innerWidth - left) / 2)) < 2 && innerHeight - r.bottom < 40;
  }), 'the / Callout item shows 💡 Callout has a shortcut ⌘ ⇧ C × centred over the note foot');
  await t.shot('hint-callout');
  await t.ok('hint-limits', async () => (await seen(t)).seen?.callout === 1, 'eve.hints counts the callout tip once');
  await t.wait(5500);
  await t.ok('hint-show', async () => (await hintText(t)) === null, 'the tip goes by itself after 5 s');

  await slash(t, 'callout');
  await t.wait(800);
  await t.ok('hint-limits', async () => (await hintText(t)) === null && (await seen(t)).seen?.callout === 1, 'a second callout at once shows no tip: two tips are 25 s apart');

  await later(t);
  await slash(t, 'callout');
  await t.ok('hint-limits', async () => (await hintText(t)) === CALLOUT && (await seen(t)).seen?.callout === 2, '26 s later the same tip shows a second time');
  await t.click('.hint button[aria-label="Dismiss"]');
  await t.ok('hint-dismiss', async () => (await hintText(t)) === null, 'the × puts the tip away at once');
  await t.type('zz');
  await t.ok('hint-dismiss', async () => (await t.markdown()).includes('xzz'), 'typing after the × goes on in the callout');
  await t.shot('hint-dismissed');

  await later(t);
  await slash(t, 'callout');
  await t.ok('hint-limits', async () => (await hintText(t)) === CALLOUT && (await seen(t)).seen?.callout === 3, 'after the ×, 26 s later, the tip still shows a third time');
  await t.shot('hint-third');
  await t.click('.hint button[aria-label="Dismiss"]');
  await later(t);
  await slash(t, 'callout');
  await t.wait(800);
  await t.ok('hint-limits', async () => (await hintText(t)) === null && (await seen(t)).seen?.callout === 3, 'a fourth time, 26 s on, no tip: one tip shows 3 times at most');
  await t.shot('hint-gone');

  await later(t);
  await t.key(`${t.mod}+Comma`);
  const sw = t.page.locator('input[aria-label="Show tips"]');
  await sw.scrollIntoViewIfNeeded();
  await t.click('input[aria-label="Show tips"]');
  await t.ok('hint-off', async () => (await seen(t)).off === true && !(await sw.isChecked()), 'Settings, General, Show tips switched off');
  await t.shot('tips-off');
  await t.key('Escape');
  await slash(t, 'divider');
  await t.wait(800);
  await t.ok('hint-off', async () => (await hintText(t)) === null && !(await seen(t)).seen?.divider, 'with tips off the / Divider item shows no tip');
  await t.shot('no-hint-off');
  await later(t);
  await t.key(`${t.mod}+Comma`);
  await sw.scrollIntoViewIfNeeded();
  await t.click('input[aria-label="Show tips"]');
  await t.ok('hint-off', async () => (await seen(t)).off === false && (await sw.isChecked()), 'Show tips switched back on');
  await t.key('Escape');
  await later(t);
  await slash(t, 'divider');
  await t.ok('hint-off', async () => (await hintText(t)) === '💡Dividerhasashortcut⌘⇧-×', 'switched back on, the same / Divider item does show its tip');
  await t.shot('hint-on-again');
};
