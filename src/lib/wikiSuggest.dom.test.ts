import { test, expect, afterEach } from 'vitest';
import { createEditor } from './editor';
import { posOf, press, type } from './testEditor';
import type { SuggestItem } from './slash';
import { TextSelection } from '@tiptap/pm/state';

const settle = () => new Promise((r) => setTimeout(r, 0));
const made: { destroy(): void }[] = [];
afterEach(async () => { await settle(); for (const e of made.splice(0)) e.destroy(); document.body.innerHTML = ''; });

// the [[ picker, driven as Suggest.svelte is: Enter picks the first row while it is up
function editor(content: string) {
  let shown: SuggestItem[] = [], pick: ((i: SuggestItem) => void) | null = null;
  const noop = () => {};
  const off = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false, month: noop } as any;
  const suggestionUI = {
    show(items: SuggestItem[], _r: DOMRect | null, cb: (i: SuggestItem) => void) { shown = items; pick = cb; },
    move: noop, expand: () => false, collapse: () => false,
    select() { if (!shown.length) return false; pick!(shown[0]); return true; },
    hide() { shown = []; },
    visible: () => shown.length > 0,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content, onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI, calendarUI: off, emojiUI: off });
  made.push(ed);
  return { ed, shown: () => shown.map((s) => s.label) };
}
const links = (ed: any) => { const out: string[] = []; ed.state.doc.descendants((n: any) => { if (n.type.name === 'wikiLink') out.push(n.attrs.title); }); return out; };

for (const line of ['In numpy write np.array([[1, 2 then more', 'Ideas: [[draft for later, then more']) {
  test(`an old "[[" in "${line}" opens nothing when the caret comes back; Enter is a new line`, async () => {
    const { ed, shown } = editor(`# T\n\n${line}`);
    ed.commands.focus();
    ed.commands.setTextSelection(posOf(ed, line.slice(-6), true)); // the caret put there (a click, End)
    await settle();
    expect(shown()).toEqual([]);
    press(ed, 'Enter');
    expect(ed.state.doc.childCount).toBe(3);
    expect(links(ed)).toEqual([]);
    expect(ed.getText()).toContain(line);
  });
}

test('a "[[" just typed opens the picker, spaces and ← → included; a click elsewhere ends it', async () => {
  const { ed, shown } = editor('# T\n\nsee ');
  ed.commands.focus('end');
  type(ed, '[[My Pag');
  await settle();
  expect(shown()).toEqual(['My Pag']);
  // the caret moved inside the title by a key (← then →, as the arrows do it): still picking
  const at = ed.state.selection.head;
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, at - 1)));
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, at)));
  type(ed, 'e');
  await settle();
  expect(shown()).toEqual(['My Page']);
  press(ed, 'Enter');
  expect(links(ed)).toEqual(['My Page']);

  // typed, then a click away and back: not again
  const b = editor('# T\n\nsee ');
  b.ed.commands.focus('end');
  type(b.ed, '[[x');
  await settle();
  expect(b.shown()).toEqual(['x']);
  const end = b.ed.state.selection.head;
  b.ed.view.dispatch(b.ed.state.tr.setSelection(TextSelection.create(b.ed.state.doc, 2)).setMeta('pointer', true));
  b.ed.view.dispatch(b.ed.state.tr.setSelection(TextSelection.create(b.ed.state.doc, end)).setMeta('pointer', true));
  await settle();
  expect(b.shown()).toEqual([]);
});

test('"[[Bob]]" typed out by hand closes the picker: Enter after it is a new line, what follows stays text', async () => {
  for (const tail of [' and more', '])']) {
    const { ed, shown } = editor('# T\n\nNote:');
    ed.commands.focus('end');
    type(ed, ' see [[Bob]]' + tail);
    await settle();
    expect(shown()).toEqual([]);
    press(ed, 'Enter');
    expect(ed.state.doc.childCount).toBe(3);
    expect(ed.state.doc.child(1).textContent).toBe('Note: see [[Bob]]' + tail);
  }
});
