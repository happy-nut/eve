// Plain text pasted as lines: indented lines are lines (not code), blank lines stay as many as they were, and code
// copied from VS Code is a code block on an empty line.
import { test, expect } from 'vitest';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { editorWith, md, posOf, press } from './testEditor';

/** paste `text` with the clipboard's other kinds (`more`: type → data) the way a browser hands them over */
function pasteWith(ed: Editor, text: string, more: Record<string, string> = {}) {
  const all: Record<string, string> = { 'text/plain': text, ...more };
  const clipboardData = { getData: (t: string) => all[t] ?? '', files: [], types: Object.keys(all) };
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: clipboardData });
  ed.view.dom.dispatchEvent(e);
}

/** the note after `clip` is pasted on a new line after `word`; read back the same, and an undo gives back the note */
function pasted(note: string, word: string, clip: string, more: Record<string, string> = {}, newLine = true) {
  const ed = editorWith(note);
  ed.commands.setTextSelection(posOf(ed, word, true));
  if (newLine) press(ed, 'Enter');
  const before = md(ed);
  ed.view.dispatch(closeHistory(ed.state.tr));
  pasteWith(ed, clip, more);
  const out = md(ed);
  expect(md(editorWith(out))).toBe(out);
  ed.commands.undo();
  expect(md(ed)).toBe(before);
  return { out, ed: editorWith(out) };
}

const lines = (ed: Editor) => { const l: string[] = []; ed.state.doc.forEach((n) => l.push(`${n.type.name}:${n.textContent}`)); return l; };

test('indented lines are lines keeping their spaces, not a code block', () => {
  const { out, ed } = pasted('start', 'start', 'Shopping list\n    milk\n\teggs\nThen call mom');
  expect(out).not.toContain('```');
  expect(lines(ed)).toEqual(['paragraph:start', 'paragraph:Shopping list', 'paragraph:    milk', 'paragraph:\teggs', 'paragraph:Then call mom']);
});

test('a blank line between pasted lines is one blank line', () => {
  const { ed } = pasted('start', 'start', 'one\n\ntwo\n\n\nthree\n');
  expect(lines(ed)).toEqual(['paragraph:start', 'paragraph:one', 'paragraph:', 'paragraph:two', 'paragraph:', 'paragraph:', 'paragraph:three']);
});

test('markdown in plain text is still read as markdown', () => {
  expect(pasted('start', 'start', '# Title\n- a\n- b').out).toBe('start\n\n# Title\n\n- a\n- b');
  expect(pasted('start', 'start', '```js\nlet a = 1\n```').out).toBe('start\n\n```js\nlet a = 1\n```');
});

const VSCODE = (mode: string) => ({ 'vscode-editor-data': JSON.stringify({ version: 1, isFromEmptySelection: false, mode }) });

test('code from VS Code on an empty line is a code block in its language', () => {
  const code = 'def f():\n    return **x**\n\n\nprint(f())';
  const { out } = pasted('start', 'start', code + '\n', VSCODE('python'));
  expect(out).toBe('start\n\n```python\n' + code + '\n```');
  expect(pasted('start', 'start', 'echo hi', VSCODE('shellscript')).out).toBe('start\n\n```bash\necho hi\n```');
  expect(pasted('start', 'start', 'just text', VSCODE('plaintext')).out).toBe('start\n\n```\njust text\n```');
});

test('code from VS Code in a line of text is plain lines, its markdown signs kept as typed', () => {
  const { ed } = pasted('start', 'start', 'a **b**\n  c', VSCODE('markdown'), false);
  expect(lines(ed)).toEqual(['paragraph:starta **b**', 'paragraph:  c']);
  expect(pasted('start', 'start', '`x` y', VSCODE('typescript'), false).ed.state.doc.textContent).toBe('start`x` y');
});
