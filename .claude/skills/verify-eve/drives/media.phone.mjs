export const notes = { a: '# Plan\n\n![a blue box](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsUlEQVR42u3RAQkAAAgEsY9jJrMbxhoig0twS/XocbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAuABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAOteC/Ysd/xjJNNhAAAAAElFTkSuQmCC)\n' };

export default async (t) => {
  await t.page.locator('.tiptap img').tap();
  await t.ok('media-image-viewer', () => t.page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim()).join('|');
    return ['Copy image', 'left', 'center', 'right', 'Delete'].every((w) => items.includes(w));
  }), 'a tap on the picture opens its menu: Copy image, Align left, center, right, Delete');
  await t.shot('image-menu');
  await t.page.touchscreen.tap(195, 450);
  await t.ok('media-image-viewer', async () => await t.page.locator('[role="menuitem"]').count() === 0, 'a tap on the note above the menu closes it');
  await t.page.locator('.tiptap img').dblclick();
  await t.ok('media-image-viewer', async () => await t.page.locator('.viewer img').isVisible()
    && (await t.page.locator('.viewer').textContent()).includes('a blue box'), 'a double tap shows the picture full size with a blue box under it');
  await t.shot('viewer');
};
