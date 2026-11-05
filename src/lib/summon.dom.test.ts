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
  expect(calls).toEqual(['frame 1', 'frame 2', 'reveal_window {"n":7}', 'frame 3']); // and drawn again once seen
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

// summoned, the note's pane stayed white (the crumbs over it, a click or a scroll changing nothing) until another note
// was opened and this one again: the page had been loaded again while Eve was away, and its fade in, begun unseen, was
// kept at its first frame
test('a note opened unseen does not fade in, and what was part way into a fade is shown whole when Eve comes back', async () => {
  const { seenFade, endFades } = await import('./platform');
  const focused = vi.spyOn(document, 'hasFocus');
  focused.mockReturnValue(false);
  expect(seenFade(160).duration).toBe(0); // Eve away: no fade to be stuck in
  focused.mockReturnValue(true);
  expect(seenFade(160).duration).toBe(160); // a note opened while writing still fades in
  focused.mockRestore();
  document.body.innerHTML = '<main><div class="page"></div></main><aside><li></li></aside><p></p>';
  const finished: string[] = [];
  const anim = (name: string, endless = false) => ({ finish: () => { if (endless) throw new DOMException('endless', 'InvalidStateError'); finished.push(name); } });
  const [page, row, other] = ['.page', 'li', 'p'].map((s) => document.querySelector(s)!) as HTMLElement[];
  Object.assign(page, { getAnimations: () => [anim('page'), anim('spinner', true)] });
  Object.assign(row, { getAnimations: () => [anim('row')] });
  Object.assign(other, { getAnimations: () => [anim('other')] });
  endFades();
  expect(finished).toEqual(['page', 'row']); // a popup's own transition is left to run
  document.body.innerHTML = '';
});

// summoned, the note's pane was white under the crumbs until it was scrolled: WebKit had not drawn what the scroller
// holds, and a layer of its own for the page's text did not make it. The scrollers are moved by a pixel and back, as
// the user's scroll did, and by what they moved: the caret brought into sight meanwhile stays in sight
test('summoned or back, each scroller is scrolled a pixel and back, so WebKit draws what it holds', async () => {
  const { redrawPanes } = await import('./platform');
  document.body.innerHTML = '<main><div class="scroll"><div class="tiptap"></div></div></main><aside><ul class="tree"></ul></aside><div class="scroll" id="short"></div>';
  const [note, list, short] = ['main .scroll', '.tree', '#short'].map((s) => document.querySelector<HTMLElement>(s)!);
  const room = (el: HTMLElement, h: number) => Object.defineProperties(el, { scrollHeight: { value: h }, clientHeight: { value: 100 } });
  room(note, 1000); room(list, 1000); room(short, 100);
  note.scrollTop = 300; list.scrollTop = 0;
  const raf = window.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  window.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  redrawPanes();
  expect([note.scrollTop, list.scrollTop, short.scrollTop]).toEqual([299, 1, 0]); // at the top it goes down, a short one stays
  note.scrollTop += 40; // the caret brought into sight in the same frame
  while (frames.length) frames.shift()!(0);
  window.requestAnimationFrame = raf;
  expect([note.scrollTop, list.scrollTop]).toEqual([340, 0]);
  document.body.innerHTML = '';
});
