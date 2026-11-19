export default async (t) => {
  await t.page.locator('.tiptap > p').last().tap();
  await t.key('End');
  await t.key('Enter');
  await t.type('/callout');
  await t.wait(300);
  await t.key('Enter');
  await t.wait(500);
  await t.type('x');
  await t.ok('hint-phone', async () => (await t.markdown()).includes('x') && (await t.page.locator('.tiptap [data-type="callout"], .tiptap .callout').count()) === 1,
    'the / Callout item makes a callout on the phone');
  await t.wait(1000);
  await t.ok('hint-phone', async () => (await t.page.locator('.hint').count()) === 0, 'and no 💡 tip shows on the phone');
  await t.shot('phone-no-hint');
  await t.page.locator('button[aria-label="Back"]:visible').tap();
  await t.page.locator('button[data-tip="Collapse"]:visible').tap();
  await t.wait(800);
  await t.ok('hint-phone', async () => (await t.page.locator('button[data-tip="Expand"]:visible').count()) === 1 && (await t.page.locator('.tip').count()) === 0,
    'a tap on the list fold button folds Plan and shows no tooltip');
  await t.shot('phone-no-tooltip');
};
