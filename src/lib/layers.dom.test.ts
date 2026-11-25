import { test, expect, beforeEach, afterEach } from 'vitest';
import { ui, type LayerId } from './ui.svelte';
import { watchFocus, allowFocusLoss } from './focusWatch';
import { notes } from './notes.svelte';

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
const own = { math: false, sheet: false, settings: false, search: false };
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
  trash: () => ui.openTrash(),
  history: () => ui.openHistory('n1'),
  present: () => ui.openPresent(note),
  search: () => { own.search = true; ui.searching(() => (own.search = false)); },
} satisfies Record<LayerId, () => void>;
const IDS = Object.keys(OPENERS) as LayerId[];

/** each one's own state, as the app draws it */
const SHOWN: Record<LayerId, () => boolean> = {
  photo: () => !!ui.photo, math: () => own.math, sheet: () => own.sheet, emoji: () => !!ui.emoji, menu: () => !!ui.menu,
  confirm: () => !!ui.pending, diagramView: () => ui.diagramView !== null, find: () => ui.find, pdf: () => !!ui.pdf,
  card: () => !!ui.card, settings: () => own.settings, trash: () => ui.trash, history: () => ui.historyOf !== null, present: () => !!ui.present,
  search: () => own.search,
};

/** opened, the keyboard goes into it as its component takes it (a button of its own DOM), which leaves the page as
 *  it closes */
function open(id: LayerId) {
  OPENERS[id]();
  const sel = ui.layers.top?.ownSelector;
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

// a modal layer drawn without taking the keyboard (its component loaded on first use, or written without a focus())
// still has it: ui.layers puts it into the box as the box is drawn; one that lets go of it says so and claims its keys
test.each(IDS)('%s: opened, the keyboard is in it once it is drawn, or it lets go of it on purpose', async (id) => {
  OPENERS[id]();
  const l = ui.layers.top!;
  expect(l.id).toBe(id);
  if (!l.modal) return;
  if (l.letsGoOfKeyboard) { expect(l.grabsKeys).toBe(true); return; }
  const sel = l.ownSelector!;
  const box = document.createElement('div');
  for (const [, cls] of sel.matchAll(/\.([\w-]+)/g)) box.classList.add(cls);
  for (const [, k, v] of sel.matchAll(/\[([\w-]+)="([^"]*)"\]/g)) box.setAttribute(k, v);
  box.innerHTML = '<button>in it</button>';
  await Promise.resolve();
  document.body.append(box);
  await new Promise((r) => setTimeout(r, 0));
  expect(box.contains(document.activeElement)).toBe(true);
  ui.layers.closeTop('putAway');
  box.remove();
  await settled();
  expect(document.activeElement).toBe(note);
});

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
  const esc = !!ui.layers.top?.closesOnEsc;
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

test('phone-hardware-back: the order they opened in is the order back takes them: a sheet over a card, a dialog over Settings', () => {
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

test('a layer is off the stack before its close runs: what the close opens goes on top, not under it', () => {
  let seen: LayerId | null | undefined;
  ui.openedSheet(() => { seen = ui.layers.top?.id ?? null; OPENERS.card(); });
  ui.layers.closeTop('back');
  expect(seen).toBeNull();
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

test('the list\'s search ends as the keyboard leaves it, and leaves the keyboard where it went', () => {
  const field = document.body.appendChild(document.createElement('input'));
  const row = document.body.appendChild(document.createElement('button'));
  field.focus();
  let off = () => {};
  field.addEventListener('focus', () => { off = ui.searching(() => {}); });
  field.addEventListener('blur', () => off());
  field.blur();
  field.focus();
  expect(ui.layers.top?.id).toBe('search');
  row.focus();
  expect(ui.layers.has('search')).toBe(false);
  expect(document.activeElement).toBe(row);
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

// a modal layer holds the app's shortcuts too: with Settings up, ⌘N made a note behind it and took the keyboard
// there, ⌘⇧⌫ asked to delete the hidden note. (A sheet is a phone's: no shortcuts there.)
test.each(IDS.filter((id) => id !== 'sheet'))('%s: modal, it holds the app\'s shortcuts while it is up', (id) => {
  const box = open(id);
  if (ui.layers.top?.modal) expect(ui.layers.grabbing).toBe(true);
  ui.layers.closeAll('esc');
  box.remove();
});

// Tab with a modal layer up goes round its own controls: it walked out of the Trash and Version history onto the
// toolbar and the list's search behind them
test.each(IDS.filter((id) => id !== 'sheet'))('%s: modal, Tab goes round its own controls', (id) => {
  const box = open(id);
  if (ui.layers.top?.modal && ui.layers.top.ownSelector) {
    box.insertAdjacentHTML('beforeend', '<button>second</button>');
    const [first, last] = box.querySelectorAll('button');
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    expect(ui.layers.trapTab(tab)).toBe(true);
    expect(document.activeElement).toBe(first);
    first.focus();
    expect(ui.layers.trapTab(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }))).toBe(true);
    expect(document.activeElement).toBe(last);
  }
  ui.layers.closeAll('esc');
  box.remove();
});

test('another note opened: a card and a diagram open over the one left close with it; a card opened over the new one stays', () => {
  const [a, b] = [notes.create('# Left\n\nx'), notes.create('# Opened\n\ny')];
  notes.currentId = a.id;
  OPENERS.card();
  OPENERS.diagramView();
  notes.currentId = b.id;
  expect([!!ui.card, ui.diagramView]).toEqual([false, null]);
  notes.currentId = a.id;
  OPENERS.card();
  expect(!!ui.card).toBe(true);
});
