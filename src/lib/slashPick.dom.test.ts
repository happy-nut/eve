// What ↩ and ⇥ do with the / menu up: a "/" in a sentence is the sentence's own until a letter after it finds a block.
import { test, expect, afterEach } from 'vitest';
import { createEditor, getMarkdown } from './editor';
import { posOf, press, type } from './testEditor';
import type { SuggestItem } from './slash';

const tick = () => new Promise((r) => setTimeout(r, 0));
// the menu comes up a moment after the "/" (the picker's own update): waited for, up to three seconds, rather than
// one turn of the loop — on a busy machine (CI, the whole suite at once) it came later still than half a second, and
// ↓ ↩ went to the line instead
let menuUp = () => false; // the newest editor's
const settle = async () => { await tick(); for (let i = 0; i < 300 && !menuUp(); i++) await new Promise((r) => setTimeout(r, 10)); };
const made: { destroy(): void }[] = [];
afterEach(async () => { await tick(); for (const e of made.splice(0)) e.destroy(); document.body.innerHTML = ''; });

function editor(content: string) {
  let shown: SuggestItem[] = [], sel = 0, pick: (i: SuggestItem) => void = () => {}, pointed = false;
  const picked: string[] = [];
  const noop = () => {};
  const off = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false, month: noop } as any;
  const suggestionUI = {
    show(items: SuggestItem[], _r: DOMRect | null, cb: (i: SuggestItem) => void) { shown = items; sel = 0; pick = cb; pointed = false; },
    move(d: number) { sel = (sel + d + shown.length) % shown.length; },
    expand: () => false, collapse: () => false,
    // a new page would go to it: only said, not made
    select() { if (!shown.length) return false; picked.push(shown[sel].label); if (shown[sel].label !== 'New page') pick(shown[sel]); return true; },
    hide() { shown = []; },
    visible: () => shown.length > 0,
    chosen: () => pointed,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content, onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI, calendarUI: off, emojiUI: off });
  made.push(ed);
  menuUp = suggestionUI.visible;
  return { ed, picked, point: () => { pointed = true; } };
}
/** a note with the caret on an empty line under its title */
function onEmptyLine() {
  const e = editor('# T\n\nx');
  e.ed.commands.setTextSelection(posOf(e.ed, 'x', true));
  e.ed.commands.deleteRange({ from: posOf(e.ed, 'x'), to: posOf(e.ed, 'x', true) });
  return e;
}
const lines = (ed: ReturnType<typeof createEditor>) => { const l: string[] = []; ed.state.doc.forEach((n) => l.push(n.textContent)); return l; };

test.each(['Root dir is /', 'A / B /', 'and /'])('"%s" then ↩ is a new line, nothing picked', async (text) => {
  const { ed, picked } = onEmptyLine();
  type(ed, text);
  await settle();
  press(ed, 'Enter');
  expect(picked).toEqual([]);
  expect(lines(ed)).toEqual(['T', text, '']);
});

test('⇥ after a "/" in a sentence picks nothing either', async () => {
  const { ed, picked } = onEmptyLine();
  type(ed, 'path /');
  await settle();
  press(ed, 'Tab');
  expect(picked).toEqual([]);
  expect(lines(ed)[1]).toBe('path /');
});

// each its own test, in a note that has the keyboard as one typed into does: three notes in one test raced — the
// first's pick focuses it a frame later, and ↓ in the second (its code-block check measures, focusing the note it
// measures and giving the keyboard back) then blurred the second, which put its menu away, now and then on CI
const inSentence = () => {
  const e = editor('# T\n\nsee');
  e.ed.view.focus();
  e.ed.commands.setTextSelection(posOf(e.ed, 'see', true));
  return e;
};

test('in a sentence, a letter that finds something makes ↩ pick', async () => {
  const { ed, picked } = inSentence();
  type(ed, ' /head');
  await settle();
  press(ed, 'Enter');
  expect(picked).toEqual(['Heading 1']);
  expect(getMarkdown(ed)).toBe('# T\n\n# see '); // the space before the / stays
});

test('in a sentence, the pointer makes ↩ pick', async () => {
  const { ed, picked, point } = inSentence();
  type(ed, ' /');
  await settle();
  point();
  press(ed, 'Enter');
  expect(picked).toEqual(['New page']);
});

test('a "/" opening an empty line: ↩ picks the first, as before', async () => {
  const { ed, picked } = onEmptyLine();
  type(ed, '/');
  await settle();
  press(ed, 'Enter');
  expect(picked).toEqual(['New page']);
});
