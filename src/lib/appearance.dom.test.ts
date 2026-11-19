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
  expect(appearance.textSize(1)).toBe(20); // 112%
  expect(appearance.textSize(1)).toBe(23); // 125%
  expect(appearance.s.size).toBe(18); // Settings keeps its own
  expect(appearance.textSize(0)).toBe(18);
  expect(appearance.s.size).toBe(18);
  appearance.textSize(-1);
  // the slider still sets the size under the steps
  appearance.set({ size: 22 });
  expect(appearance.textPx).toBe(20);
  expect(appearance.textSize(0)).toBe(22);
  // and the steps go on past the slider's end, as far as 48px
  appearance.set({ size: 28 });
  for (const px of [31, 35, 38, 42, 48, 48]) expect(appearance.textSize(1)).toBe(px);
  expect(appearance.textSize(0)).toBe(28);
});

test('a ⌘+ / ⌘- step is one a reader sees, but not a jump: about an eighth of the size each time, up to three times it', () => {
  // a step was 1px, 15 to 16, and the text hardly looked any different; then a quarter and more, and it leapt
  appearance.set({ size: 15, zoom: 0 });
  const seen = [15];
  for (let i = 0; i < 5; i++) seen.push(appearance.textSize(1));
  expect(seen).toEqual([15, 17, 19, 21, 23, 26]);
  for (let i = 1; i < seen.length; i++) { expect(seen[i] / seen[i - 1]).toBeGreaterThanOrEqual(1.08); expect(seen[i] / seen[i - 1]).toBeLessThanOrEqual(1.14); }
  for (let i = 0; i < 20; i++) appearance.textSize(1);
  expect(appearance.textPx).toBe(45);
  appearance.textSize(0);
  expect([appearance.textSize(-1), appearance.textSize(-1), appearance.textSize(-1), appearance.textSize(-1), appearance.textSize(-1)]).toEqual([14, 12, 11, 10, 9]);
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

test('a small-text note stays under the rest as ⌘- takes them small; a size set while zoomed still steps a step', () => {
  appearance.set({ size: 15, zoom: 0 });
  for (let i = 0; i < 3; i++) { appearance.textSize(-1); expect(appearance.smallPx).toBeLessThanOrEqual(appearance.textPx); }
  appearance.textSize(0);
  expect(appearance.smallPx).toBeLessThan(appearance.textPx);
  // at 200%, the slider moved: the text between two steps, and ⌘- took a pixel off it
  appearance.textSize(1); appearance.textSize(1); appearance.textSize(1);
  appearance.set({ size: 28 });
  const at = appearance.textPx;
  expect(at / appearance.textSize(-1)).toBeGreaterThanOrEqual(1.05);
  appearance.textSize(0);
});

test("Reset's Undo puts back all it reset: the code colours and the ⌘+ steps too", () => {
  appearance.set({ size: 18, zoom: 0, codeTheme: 'github', font: 'serif' });
  appearance.textSize(1);
  const before = { ...appearance.s };
  const was = appearance.reset();
  expect(appearance.s.codeTheme).not.toBe('github');
  appearance.set(was);
  expect(appearance.s).toEqual(before);
});

test("code's own light or dark is kept, and Reset (and its Undo) take it with the rest", () => {
  appearance.set({ theme: 'light', codeShade: 'dark' });
  expect(JSON.parse(localStorage.getItem('eve.appearance')!).codeShade).toBe('dark');
  const was = appearance.reset();
  expect(appearance.s.codeShade).toBe('auto');
  appearance.set(was);
  expect(appearance.s.codeShade).toBe('dark');
  appearance.reset();
});

test("the note's weight, like its font: Regular to begin with, named on the slider, kept, and put back by Reset", async () => {
  const { WEIGHT_MIN, WEIGHT_MAX, weightName } = await import('./appearance.svelte');
  expect(appearance.s.weight).toBe(400);
  expect([WEIGHT_MIN, WEIGHT_MAX]).toEqual([300, 600]);
  expect([300, 400, 500, 600].map(weightName)).toEqual(['Light', 'Regular', 'Medium', 'Semibold']);
  appearance.set({ weight: 500 });
  expect(JSON.parse(localStorage.getItem('eve.appearance')!).weight).toBe(500);
  appearance.reset();
  expect(appearance.s.weight).toBe(400);
});
