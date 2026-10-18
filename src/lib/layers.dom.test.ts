import { test, expect, beforeEach, afterEach } from 'vitest';
import { ui, type LayerId } from './ui.svelte';
import { watchFocus, allowFocusLoss } from './focusWatch';

// Every layer (ui.layers) in one place: whatever opens over the app must close on a phone's back, one at a time and
// the newest first, on Esc if it says so, all at once when a note is brought up from outside, and leave the keyboard
// somewhere every time. A layer added without an opener here fails `npm run check`.

let note: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true"></div></main>';
  note = document.querySelector('main .tiptap')!;
  note.focus();
});
afterEach(() => {
  ui.layers.closeAll('putAway');
  document.body.innerHTML = '';
});

/** what each layer's component does with its close (Settings: App's settingsOpen; a sheet: its owner's open) */
const own = { math: false, sheet: false, settings: false };
const OPENERS = {
  photo: () => ui.viewImage('pic.png'),
  math: () => { own.math = true; const off = ui.editingMath(() => { own.math = false; off(); }); },
  sheet: () => { own.sheet = true; ui.openedSheet(() => (own.sheet = false)); }, // (it unmounts later, as it slides away)
  emoji: () => void ui.pickEmoji(new DOMRect()),
  menu: () => ui.openMenu({ clientX: 0, clientY: 0 }, [{ label: 'One' }]),
  confirm: () => void ui.ask('Sure?'),
  diagramView: () => ui.viewDiagram(() => {}),
  find: () => ui.openFind(),
  pdf: () => ui.openPdf('a.pdf', 'a.pdf'),
  card: () => void ui.openCard({ title: 'Card', body: '' }, () => {}),
  settings: () => { own.settings = true; const off = ui.openedSettings(() => { own.settings = false; queueMicrotask(off); }); },
} satisfies Record<LayerId, () => void>;
const IDS = Object.keys(OPENERS) as LayerId[];

/** each one's own state, as the app draws it */
const SHOWN: Record<LayerId, () => boolean> = {
  photo: () => !!ui.photo, math: () => own.math, sheet: () => own.sheet, emoji: () => !!ui.emoji, menu: () => !!ui.menu,
  confirm: () => !!ui.pending, diagramView: () => ui.diagramView !== null, find: () => ui.find, pdf: () => !!ui.pdf,
  card: () => !!ui.card, settings: () => own.settings,
};

/** opened, the keyboard goes into it as its component takes it (a button of its own DOM), which leaves the page as
 *  it closes */
function open(id: LayerId) {
  OPENERS[id]();
  const sel = ui.layers.top?.own;
  const box = document.createElement('div');
  for (const [, cls] of (sel ?? '').matchAll(/\.([\w-]+)/g)) box.classList.add(cls);
  for (const [, k, v] of (sel ?? '').matchAll(/\[([\w-]+)="([^"]*)"\]/g)) box.setAttribute(k, v);
  box.innerHTML = '<button>in it</button>';
  document.body.append(box);
  box.querySelector('button')!.focus();
  return box;
}
/** what the emoji picker waits before it puts the keyboard back */
const settled = () => new Promise((r) => setTimeout(r, 80));

test.each(IDS)('%s: back closes it and only it, and the keyboard goes back where it was', async (id) => {
  const under: LayerId = id === 'pdf' ? 'card' : 'pdf';
  OPENERS[under]();
  const box = open(id);
  expect(ui.layers.top?.id).toBe(id);
  expect(SHOWN[id]()).toBe(true);
  expect(ui.layers.closeTop('back')).toBe(true);
  box.remove();
  await settled();
  expect(ui.layers.has(id)).toBe(false);
  expect(SHOWN[id]()).toBe(false);
  expect(ui.layers.has(under)).toBe(true);
  expect(SHOWN[under]()).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(note);
});

test.each(IDS)('%s: Esc closes it if it says so', async (id) => {
  const box = open(id);
  const esc = !!ui.layers.top?.esc;
  expect(ui.layers.escape()).toBe(esc);
  expect(ui.layers.has(id)).toBe(!esc);
  expect(SHOWN[id]()).toBe(!esc);
  ui.layers.closeAll('esc');
  box.remove();
  await settled();
  expect(document.activeElement).toBe(note);
});

test('putAway empties the stack, whatever is open, the keyboard back in the note', async () => {
  const boxes = IDS.map(open);
  expect(ui.layers.count).toBe(IDS.length);
  ui.layers.closeAll('putAway');
  for (const b of boxes) b.remove();
  await settled();
  expect(ui.layers.count).toBe(0);
  for (const id of IDS) expect(SHOWN[id]()).toBe(false);
  expect(document.activeElement).toBe(note);
});

test('the order they opened in is the order back takes them: a sheet over a card, a dialog over Settings', () => {
  OPENERS.card();
  OPENERS.sheet();
  ui.layers.closeTop('back');
  expect([own.sheet, !!ui.card]).toEqual([false, true]);
  ui.layers.closeTop('back');
  expect(ui.card).toBeNull();
  OPENERS.settings();
  OPENERS.confirm();
  ui.layers.closeTop('back');
  expect([!!ui.pending, own.settings]).toEqual([false, true]);
  ui.layers.closeTop('back');
  expect(own.settings).toBe(false);
  expect(ui.layers.closeTop('back')).toBe(false); // nothing left: back goes on to the list
});

test('a sheet closing is off the stack at once: the next back is for what is under it, not for it sliding away', () => {
  OPENERS.card();
  let unmount = () => {};
  unmount = ui.openedSheet(() => {}); // its owner closes it, and it stays mounted while it slides down
  ui.layers.closeTop('back');
  expect(ui.layers.top?.id).toBe('card');
  unmount();
  expect(ui.layers.top?.id).toBe('card');
});

test('opened from something since gone, the keyboard goes to the note', () => {
  const b = document.body.appendChild(document.createElement('button'));
  b.focus();
  ui.openMenu({ clientX: 0, clientY: 0 }, [{ label: 'Delete' }]);
  b.remove();
  ui.closeMenu();
  expect(document.activeElement).toBe(note);
});

test('a layer that is not modal (a PDF) leaves the keyboard where it has gone since', () => {
  OPENERS.pdf();
  const b = document.body.appendChild(document.createElement('button'));
  b.focus(); // a click in the list, the panel still up
  ui.closePdf();
  expect(document.activeElement).toBe(b);
});

test('the watch hears the keyboard dropped on <body> when what had it leaves the page', async () => {
  allowFocusLoss();
  const heard: string[] = [];
  const stop = watchFocus((w) => heard.push(w));
  const b = document.body.appendChild(document.createElement('button'));
  b.focus();
  b.remove();
  await new Promise((r) => setTimeout(r, 60)); // (removals are polled)
  stop();
  expect(heard).toEqual(['focus lost to <body> (removed) from <button> (removed)']);
});

test('…but not while a layer closes and puts it back, nor when it is let go on purpose', async () => {
  const heard: string[] = [];
  const stop = watchFocus((w) => heard.push(w));
  const box = open('menu');
  ui.closeMenu();
  box.remove();
  const { letGo } = await import('./focusWatch');
  note.focus();
  letGo();
  await new Promise((r) => setTimeout(r, 60)); // (removals are polled)
  stop();
  expect(heard).toEqual([]);
});
