// A click in the empty page under a note's last line: the caret at the note's end. Left to WebKit it sometimes landed
// on a line in the middle of a long note.
import { test, expect, afterEach } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { editorWith, md, posOf } from './testEditor';

const made: { destroy(): void }[] = [];
const make = (s: string) => { const ed = editorWith(s); made.push(ed); return ed; };
afterEach(() => { for (const e of made.splice(0)) e.destroy(); document.body.innerHTML = ''; });

// jsdom lays nothing out: every box is at 0, so any click lower than that is under the note
const click = (ed: ReturnType<typeof make>, init: MouseEventInit = {}) =>
  ed.view.dom.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 500, detail: 1, ...init }));

test('under a line of text: the caret at the end of that last line', () => {
  const ed = make('# T\n\nfirst\n\nlast line');
  ed.commands.setTextSelection(posOf(ed, 'first'));
  click(ed);
  const { $head } = ed.state.selection;
  expect($head.parent.type.name).toBe('paragraph');
  expect($head.pos).toBe(ed.state.doc.content.size - 1);
});

test('under a picture or a table: a new empty line after it, the caret on it, and nothing else changed', () => {
  for (const note of ['# T\n\n![a](assets/a.png)', '# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n']) {
    const ed = make(note);
    ed.commands.setTextSelection(2);
    const before = md(ed).trimEnd();
    click(ed);
    expect(ed.state.selection.$head.parent.type.name).toBe('paragraph');
    expect(ed.state.selection.$head.parent.content.size).toBe(0);
    expect(ed.state.doc.lastChild!.type.name).toBe('paragraph');
    expect(md(ed).trimEnd()).toBe(before);
  }
});

test('a drag that ended down there, a shift-click, a double click: left as they are', () => {
  const ed = make('# T\n\nfirst\n\nlast line');
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posOf(ed, 'first'), posOf(ed, 'last', true))));
  const sel = ed.state.selection;
  click(ed);
  expect(ed.state.selection.eq(sel)).toBe(true);
  ed.commands.setTextSelection(posOf(ed, 'first'));
  const at = ed.state.selection.head;
  click(ed, { shiftKey: true });
  click(ed, { detail: 2 });
  expect(ed.state.selection.head).toBe(at);
});
