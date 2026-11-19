const stored = (t) => t.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('eve.notes.')).length);

export default async (t) => {
  const before = await stored(t);
  await t.click('.tiptap');
  await t.key(`${t.mod}+t`);
  await t.wait(800);
  await t.ok('tabs-phone', async () => before === 3 && (await stored(t)) === 3
    && await t.page.evaluate(() => !document.querySelector('.tabbar') && document.querySelector('.tiptap')?.textContent.startsWith('Plan')),
  'on a phone ⌘T makes no tab bar and no new note, Plan stays open');
  await t.shot('no-tabs');
};
