import { test, expect, afterEach } from 'vitest';
import { DOMSerializer, Fragment } from '@tiptap/pm/model';
import { editorWith, md, posOf, press } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });
// jsdom has none; ProseMirror's pasteHTML makes one to hand the paste handlers
(globalThis as any).ClipboardEvent ??= class extends Event { clipboardData = null; };

const note = '# T\n\n<details open>\n<summary>Title</summary>\n\nline one\n\nline two\n\n</details>\n\nafter';
// what the webview puts on the clipboard for two lines selected inside the toggle's body (ProseMirror's own HTML)
const bodyLines = '<div data-type="detailsContent" data-pm-slice="2 2 [&quot;details&quot;,{&quot;open&quot;:true}]"><p>line one</p><p>line two</p></div>';

test('lines copied from inside a toggle, pasted after it: just the lines, no new toggle', () => {
  const ed = editorWith(note);
  ed.commands.setTextSelection(posOf(ed, 'after', true));
  press(ed, 'Enter');
  ed.view.pasteHTML(bodyLines);
  expect(md(ed)).toBe(note + '\n\nline one\n\nline two');
});

test('pasted back inside the toggle: lines of its body', () => {
  const ed = editorWith(note);
  ed.commands.setTextSelection(posOf(ed, 'line two', true));
  press(ed, 'Enter');
  ed.view.pasteHTML(bodyLines);
  expect(md(ed)).toBe(note.replace('line two\n', 'line two\n\nline one\n\nline two\n'));
});

test('a whole toggle copied: pasted as a toggle', () => {
  const ed = editorWith(note);
  const toggle = ed.state.doc.child(1);
  const div = document.createElement('div');
  div.append(DOMSerializer.fromSchema(ed.schema).serializeFragment(Fragment.from(toggle)));
  (div.firstChild as HTMLElement).setAttribute('data-pm-slice', '0 0 []');
  ed.commands.setTextSelection(posOf(ed, 'after', true));
  press(ed, 'Enter');
  ed.view.pasteHTML(div.innerHTML);
  expect(md(ed).match(/<details/g)?.length).toBe(2);
  expect(md(ed)).toContain('after\n\n<details open>\n<summary>Title</summary>');
});
