import { describe, it, expect } from 'vitest';
import { hints } from './hints.svelte';

describe('Show tips', () => {
  it('is on by default and shows a tip', () => {
    expect(hints.on).toBe(true);
    hints.show('a', 'Bold has a shortcut', 'Mod-b');
    expect(hints.current?.text).toBe('Bold has a shortcut');
  });
  it('turned off, hides the tip on screen, shows no more, and stays off', () => {
    hints.setOn(false);
    expect(hints.current).toBeNull();
    hints.show('b', 'Italic has a shortcut', 'Mod-i');
    expect(hints.current).toBeNull();
    expect(JSON.parse(localStorage.getItem('eve.hints')!).off).toBe(true);
  });
});
