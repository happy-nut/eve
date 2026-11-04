import { test, expect } from 'vitest';
import { appearance, FONTS } from './appearance.svelte';

test('a custom font not named yet writes in the system font, not in a font called "system"', () => {
  appearance.set({ font: 'custom', custom: '' });
  expect(appearance.stack).toBe(FONTS[0].stack);
  appearance.set({ custom: '   ' });
  expect(appearance.stack).toBe(FONTS[0].stack);
  appearance.set({ custom: 'Pretendard' });
  expect(appearance.stack).toBe('Pretendard');
  appearance.set({ font: 'serif' });
  expect(appearance.stack).toBe(FONTS[1].stack);
});

test('⌘+ / ⌘- step on top of the Settings size, and ⌘0 goes back to it, not to the default', () => {
  appearance.set({ size: 18, zoom: 0 });
  expect(appearance.textSize(1)).toBe(20); // 110%
  expect(appearance.textSize(1)).toBe(23); // 125%
  expect(appearance.s.size).toBe(18); // Settings keeps its own
  expect(appearance.textSize(0)).toBe(18);
  expect(appearance.s.size).toBe(18);
  appearance.textSize(-1);
  // the slider still sets the size under the steps
  appearance.set({ size: 22 });
  expect(appearance.textPx).toBe(20);
  expect(appearance.textSize(0)).toBe(22);
  // and the steps stop at the slider's ends
  appearance.set({ size: 28 });
  expect(appearance.textSize(1)).toBe(28);
  expect(appearance.textSize(0)).toBe(28);
});

test('a ⌘+ / ⌘- step is one a reader sees, as a browser zooms: a tenth or more of the size each time', () => {
  // a step was 1px, 15 to 16, and the text hardly looked any different
  appearance.set({ size: 15, zoom: 0 });
  const seen = [15];
  for (let i = 0; i < 5; i++) seen.push(appearance.textSize(1));
  expect(seen).toEqual([15, 17, 19, 23, 26, 28]);
  for (let i = 1; i < seen.length - 1; i++) expect(seen[i] / seen[i - 1]).toBeGreaterThanOrEqual(1.1);
  appearance.textSize(0);
  expect([appearance.textSize(-1), appearance.textSize(-1), appearance.textSize(-1)]).toEqual([14, 12, 12]);
  appearance.textSize(0);
});

test('⌘+ / ⌘- make the page wider and narrower with the text, as a browser zooms; ⌘0 back to Settings\' width', () => {
  // the text grew and the page did not: fewer words a line at each step, the margins left as they were
  appearance.set({ size: 16, zoom: 0, width: 800 });
  expect(appearance.widthPx).toBe(800);
  appearance.textSize(1); appearance.textSize(1);
  expect(appearance.widthPx).toBe(1000); // 20 / 16 of it
  appearance.textSize(-1); appearance.textSize(-1); appearance.textSize(-1); appearance.textSize(-1);
  expect(appearance.widthPx).toBe(650); // 13 / 16
  appearance.textSize(0);
  expect(appearance.widthPx).toBe(800);
  // Settings' own size leaves the width as Settings has it
  appearance.set({ size: 20 });
  expect(appearance.widthPx).toBe(800);
});

test("a code colour theme gives the page its code colours, both its sets; Eve's own leaves app.css's, and Reset goes back to it", async () => {
  const { codeColors, CODE_THEMES } = await import('./appearance.svelte');
  expect(codeColors('github')['--hl-key']).toBe('light-dark(#cf222e, #ff7b72)');
  expect(Object.values(codeColors('eve')).every((v) => v === null)).toBe(true);
  expect(Object.values(codeColors('gone')).every((v) => v === null)).toBe(true); // a theme no longer there: Eve's
  expect(CODE_THEMES.length).toBeGreaterThan(3);
  appearance.set({ codeTheme: 'dracula' });
  appearance.reset();
  expect(appearance.s.codeTheme).toBe('eve');
});
