export const notes = {
  a: '# Talk\n\nWhat this is about.\n\n## Last part\n\nThe last words.\n',
};

const count = (t) => t.page.evaluate(() => document.querySelector('.present .count')?.textContent.trim() ?? null);

export default async (t) => {
  const before = await t.markdown();
  await t.page.locator('button[aria-label="More"]:visible').tap();
  await t.page.locator('.sheet :text-is("Present")').tap();
  await t.ok('present-phone', async () => (await count(t)) === '1 / 2', 'More, Present in the sheet starts the slides at 1 / 2 on the phone');
  await t.shot('phone-first');
  await t.page.touchscreen.tap(330, 500);
  await t.ok('present-phone', async () => (await count(t)) === '2 / 2', 'a tap on the right turns to 2 / 2');
  await t.page.touchscreen.tap(330, 500);
  await t.ok('present-phone', async () => (await count(t)) === 'End' && (await t.page.locator('.present .end').isVisible()), 'another tap shows End of presentation');
  await t.shot('phone-end');
  await t.page.locator('button[aria-label="End the presentation"]').tap();
  await t.ok('present-phone', async () => (await t.page.locator('.present').count()) === 0 && (await t.markdown()) === before, 'the ✕ leaves the slides, the note unchanged');
  await t.shot('phone-left');
};
