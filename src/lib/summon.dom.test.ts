import { test, expect, vi } from 'vitest';

// the Mac app: the window is summoned through Tauri, counted here instead
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
const calls: string[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push(args ? `${cmd} ${JSON.stringify(args)}` : cmd);
    return cmd === 'is_front' ? false : undefined;
  },
}));
const { win, paintGround } = await import('./platform');

test('summoned, the window is seen only after the page has drawn in it: never a white page first', async () => {
  window.addEventListener('eve-summon', () => calls.push('eve-summon'), { once: true });
  let frames = 0;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => { frames++; calls.push(`frame ${frames}`); return raf(cb); };
  await win.toggle();
  await vi.waitFor(() => expect(calls).toContain('reveal_window'));
  window.requestAnimationFrame = raf;
  // shown unseen, the caret put back and the panes redrawn, two frames drawn, then seen
  const order = calls.filter((c) => c !== 'is_front');
  expect(order.indexOf('summon_window')).toBe(0);
  expect(order.indexOf('eve-summon')).toBeGreaterThan(0);
  expect(order.indexOf('reveal_window')).toBeGreaterThan(order.lastIndexOf('frame 2'));
  expect(order.indexOf('frame 1')).toBeGreaterThan(order.indexOf('eve-summon'));
});

test("the window's own ground is the page's: what shows before the page draws is the theme's colour, not white", async () => {
  calls.length = 0;
  document.documentElement.style.background = 'rgb(11, 12, 16)';
  await paintGround();
  expect(calls).toEqual(['set_ground {"r":11,"g":12,"b":16}']);
  calls.length = 0;
  await paintGround(); // the same colour again is not sent again
  expect(calls).toEqual([]);
});
