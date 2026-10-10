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
