const tabs = (t) => t.page.evaluate(() => [...document.querySelectorAll('button[role="tab"]')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).join(','));
const sub = (t, label) => t.page.evaluate((l) => document.querySelector(`input[aria-label="${l}"]`)?.closest('label.row')?.querySelector('.sub')?.textContent.trim(), label);

export default async (t) => {
  await t.page.locator('button[aria-label="Back"]:visible').tap();
  await t.page.locator('button[aria-label="Settings"]:visible').tap();
  await t.ok('settings-open', async () => (await tabs(t)) === 'General,Appearance,Sync', 'the gear on the phone list opens Settings with General, Appearance, Sync and no Shortcuts');
  await t.shot('phone-settings');
  await t.page.locator('button[role="tab"]:visible:has-text("Appearance")').tap();
  await t.ok('settings-slider', async () => (await t.page.locator('input[aria-label="Size"]:visible').count()) === 1
    && (await t.page.locator('input[aria-label="Line height"]:visible').count()) === 1
    && (await t.page.locator('input[aria-label="Width"]').count()) === 0, 'the phone Text card has Size and Line height, no Width');
  const s = t.page.locator('input[aria-label="Size"]');
  await s.scrollIntoViewIfNeeded();
  const b = await s.boundingBox();
  await t.page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2);
  await t.ok('settings-slider', async () => (await sub(t, 'Size')) === '28px', 'a tap near the right end of Size makes it 28px');
  await t.shot('phone-size');
};
