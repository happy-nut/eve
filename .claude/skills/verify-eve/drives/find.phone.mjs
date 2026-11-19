import { notes } from './find.mjs';

export { notes };

const tap = (t, sel, opts) => t.page.locator(sel, opts).first().tap();

export default async (t) => {
  await tap(t, '.mhead button[aria-label="More"]');
  await tap(t, 'button[role="menuitem"]', { hasText: 'Find & replace' });
  await t.page.waitForSelector('.find');
  await t.type('cat');
  await t.ok('find-bar', () => t.page.evaluate(() => document.querySelector('.find .count')?.textContent.trim() === '1/2'
    && document.querySelectorAll('.tiptap .find-hit').length === 2 && document.querySelector('.tiptap .find-hit.current')?.textContent === 'cat'),
  "on a phone ⋯ → Find & replace… opens the bar; \"cat\" marks both cats and it reads 1/2");
  await t.shot('phone-find');

  await tap(t, '.find button[aria-label="Replace"]');
  await t.type('dog');
  await tap(t, '.find button[aria-label="Replace all"]');
  await t.ok('find-replace', async () => (await t.page.evaluate(() => document.querySelector('.tiptap p').textContent === 'The dog sat. A dog ran.'))
    && (await t.markdown()).includes('The dog sat. A dog ran.'), 'on a phone Replace all puts "dog" in for both, on screen and in the saved note');
  await tap(t, '.find button[aria-label="Close"]');
  await t.ok('find-replace', () => t.page.evaluate(() => !document.querySelector('.find')), 'the bar\'s Close takes it away');
  await t.shot('phone-replaced');
};
