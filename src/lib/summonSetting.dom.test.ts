import { test, expect, vi } from 'vitest';
import { allowFocusLoss } from './focusWatch';

// Settings in the Mac app, its calls to Tauri counted
const calls: string[] = [];
const invoke = async (cmd: string, args?: Record<string, unknown>) => { calls.push(args ? `${cmd} ${JSON.stringify(args)}` : cmd); return undefined; };
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke, transformCallback: () => 0 };
vi.mock('@tauri-apps/api/core', () => ({ invoke, convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
// with the summon key Eve was hidden from the Dock and ⌘Tab, and so ⌘Tab could not bring it: summoning can be turned
// off, and then Eve is an app like any other, in the Dock and ⌘Tab, and takes no key from the other apps
test('summoning turned off: Eve back in the Dock and ⌘Tab, and kept there while it is off', async () => {
  const { mount, unmount, flushSync } = await import('svelte');
  const { default: Settings } = await import('../Settings.svelte');
  const { appearance } = await import('./appearance.svelte');
  allowFocusLoss(); // Settings alone, nothing under it to give the keyboard back to
  localStorage.setItem('eve.dock', 'hidden');
  calls.length = 0;
  const app = mount(Settings, { target: document.body, props: { onClose: () => {}, hotkeyError: null } });
  flushSync();
  const row = (label: string) => [...document.querySelectorAll('label.row')].find((r) => r.textContent?.includes(label))!.querySelector('input')!;
  expect(row('Summon with a hotkey').checked).toBe(true);
  row('Summon with a hotkey').click();
  flushSync();
  expect(appearance.s.summon).toBe(false);
  await vi.waitFor(() => expect(calls).toContain('set_dock_hidden {"hidden":false}'));
  expect(row('Hide from Dock').checked).toBe(false);
  expect(row('Hide from Dock').disabled).toBe(true); // nothing would bring a hidden Eve up
  row('Summon with a hotkey').click();
  flushSync();
  expect(appearance.s.summon).toBe(true);
  expect(row('Hide from Dock').disabled).toBe(false);
  unmount(app);
  document.body.innerHTML = '';
});
