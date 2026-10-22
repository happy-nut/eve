import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML makes one
(globalThis as any).ClipboardEvent ??= class extends Event { clipboardData = null; };
afterEach(() => { document.body.innerHTML = ''; });

test.each([
  ['kbd, sub, sup and abbr', 'press <kbd>Ctrl</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <abbr title="HyperText">HTML</abbr>'],
  ['a comment at the end of an item', '- a <!-- c -->\n- b'],
  ['a comment in a heading', '# Title <!-- draft -->'],
  ['a comment in a quote', '> a <!-- c --> b'],
])('%s in a note is written back as it was', (_what, note) => {
  const once = md(editorWith(note));
  expect(once).toBe(note);
  expect(md(editorWith(once))).toBe(once);
});

test('a one-line div keeps its tag, its text still markdown inside it', () => {
  expect(md(editorWith('<div align="center">centered</div>'))).toBe('<div align="center">\n\ncentered\n\n</div>');
});

test('handlers and javascript: addresses are not kept', () => {
  expect(md(editorWith('<span onclick="alert(1)" title="t">s</span> <abbr title="x" onmouseover="x()">a</abbr>'))).toBe('<span title="t">s</span> <abbr title="x">a</abbr>');
});

test('HTML pasted from a page is taken for its text, as before', () => {
  const ed = editorWith('');
  ed.commands.focus('end');
  ed.view.pasteHTML('<div class="post"><p>a <span style="color:red">red</span> word</p></div>');
  expect(md(ed).trim()).toBe('a red word');
});

test.each([
  ['a [[link]]', 'see [[Other note]] here, [[Other note#Part|shown]]'],
  ['a link inside kept HTML', 'a <span style="color: red">see [[Other note]]</span> b'],
])('%s is still itself, not taken for HTML', (_what, note) => {
  expect(md(editorWith(note))).toBe(note);
});

test('a style keeps what text may wear, not where it sits; no class or id', () => {
  expect(md(editorWith('<span style="position:fixed;inset:0;color:red" class="mhead" id="x">s</span>'))).toBe('<span style="color:red">s</span>');
});
