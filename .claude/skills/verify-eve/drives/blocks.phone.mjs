const bar = (t, label) => t.page.locator(`.mbar button[aria-label="${label}"]`).tap();

export default async (t) => {
  const box = await t.page.locator('.tiptap p').last().boundingBox();
  await t.page.touchscreen.tap(box.x + box.width - 4, box.y + box.height / 2);
  await t.page.setViewportSize({ width: 390, height: 470 });
  await t.wait(400);
  await t.key('Enter');
  await t.type('1. one');
  await t.key('Enter');
  await bar(t, 'Indent');
  await t.type('two');
  await t.key('Enter');
  await bar(t, 'Indent');
  await t.type('three');
  await t.ok('block-list-nest', async () => /1\. one\n {3}1\. two\n {6}1\. three/.test(await t.markdown()),
    "on a phone the bar's Indent nests one / two / three three levels deep, saved as nested \"1.\" lists");
  await t.shot('phone-list-nest');

  for (let i = 0; i < 4; i++) await t.key('Enter');
  await bar(t, 'Highlight');
  await t.type('glow');
  await t.ok('block-highlight', async () => (await t.markdown()).includes('==glow==') && (await t.page.evaluate(() => {
    const m = [...document.querySelectorAll('.tiptap mark')].find((e) => e.textContent === 'glow');
    if (!m) return false;
    const [r, g, b] = getComputedStyle(m).backgroundColor.match(/\d+/g).map(Number);
    return r > 220 && g > 200 && b < g - 40;
  })), "on a phone the bar's Highlight makes what is typed next yellow, saved as ==glow==");
  await t.shot('phone-highlight');
};
