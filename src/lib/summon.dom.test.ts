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
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
const login: string[] = [];
let loginOn = false;
vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: async () => loginOn,
  enable: async () => { loginOn = true; login.push('enable'); },
  disable: async () => { loginOn = false; login.push('disable'); },
}));
const keys: string[] = [];
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  unregisterAll: async () => {},
  register: async (k: string) => { keys.push(k); },
}));
const { win, paintGround, autostart, setGlobalHotkey, revealWhenDrawn } = await import('./platform');

test('summoned, the window is seen only after the page has drawn in it: never a white page first', async () => {
  window.addEventListener('eve-summon', () => calls.push('eve-summon'), { once: true });
  await win.toggle();
  await vi.waitFor(() => expect(calls).toContain('eve-summon'));
  expect(calls.filter((c) => c !== 'is_front')).toEqual(['summon_window', 'eve-summon']); // shown unseen, the caret put back
  // Rust asks the page (eve-reveal, summon 7): seen once two frames are drawn after it, and as that summon
  let frames = 0;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => { frames++; calls.push(`frame ${frames}`); return raf(cb); };
  calls.length = 0;
  await revealWhenDrawn(7);
  window.requestAnimationFrame = raf;
  expect(calls).toEqual(['frame 1', 'frame 2', 'reveal_window {"n":7}']);
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

// summoned after a login, the Eve that came up was a months-old build run from the code: each `tauri dev`, its pages
// kept apart from the app's, took itself for a first run and wrote itself in as the login item
test('the login item is this Eve: on at the first launch, written again at each launch while on, never by a build run from the code', async () => {
  localStorage.removeItem('eve.autostart.init');
  await autostart.keep(true);
  expect(login).toEqual([]); // a build run from the code
  await autostart.set(true, true);
  expect(login).toEqual([]);
  await autostart.keep(false);
  expect(login).toEqual(['enable']); // the first launch
  await autostart.keep(false);
  expect(login).toEqual(['enable', 'enable']); // on: written again, pointing at where this Eve runs from
  await autostart.set(false, false);
  login.length = 0;
  await autostart.keep(false);
  expect(login).toEqual([]); // turned off in Settings: left off
});

test('a build run from the code takes no summon key: only the app answers it', async () => {
  await setGlobalHotkey('Mod-Shift-e', true);
  expect(keys).toEqual([]);
  await setGlobalHotkey('Mod-Shift-e', false);
  expect(keys).toEqual(['CmdOrCtrl+Shift+E']);
});
