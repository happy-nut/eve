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
  expect(appearance.textSize(1)).toBe(19);
  expect(appearance.textSize(1)).toBe(20);
  expect(appearance.s.size).toBe(18); // Settings keeps its own
  expect(appearance.textSize(0)).toBe(18);
  expect(appearance.s.size).toBe(18);
  appearance.textSize(-1);
  // the slider still sets the size under the steps
  appearance.set({ size: 22 });
  expect(appearance.textPx).toBe(21);
  expect(appearance.textSize(0)).toBe(22);
  // and the steps stop at the slider's ends
  appearance.set({ size: 28 });
  expect(appearance.textSize(1)).toBe(28);
  expect(appearance.textSize(0)).toBe(28);
});
