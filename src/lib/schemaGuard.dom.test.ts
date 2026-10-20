// Every kind of thing a note can hold, saved, read back and copied: one sample of each, written as the app writes it.
// A node or mark added to the editor without a sample here fails the first test, so a new block can't ship without
// its file and clipboard round trip being checked (a callout's copy once lost its title to its icon this way).
import { test, expect, afterEach } from 'vitest';
import { editorWith as make, md } from './testEditor';

// hundreds of editors: each one destroyed after its test (left alive, they made the file run for minutes)
const made: { destroy(): void }[] = [];
const editorWith = (s: string) => { const ed = make(s); made.push(ed); return ed; };
afterEach(() => { for (const ed of made.splice(0)) ed.destroy(); document.body.innerHTML = ''; });

const SAMPLES: Record<string, string> = {
  'marks and inline nodes': '# T\n\nplain **bold** *it* ~~s~~ <u>u</u> `code` ==hi== [l](https://x.y) [[Page]] [[Page|alias]] @2026-10-18 $x^2$ a\\\nb',
  'inline html': 'x <span style="color: red">y</span> z <input type="checkbox"> w',
  'coloured highlight': 'plain ==yellow== and <mark style="background-color: #c9f2d4">mint</mark> and **<mark style="background-color: #e5d8ff">lilac bold</mark>**',
  'code': '```js\nlet a = 1\n```',
  'lists': '- a\n- b\n\n1. one\n2. two\n\n- [ ] todo\n- [x] done',
  'quote': '> quote',
  'toggle': '<details open>\n<summary>T</summary>\n\nbody\n\n</details>',
  'callout': '> [!note] Title\n> body',
  'untitled callout': '> [!tip]\n> body',
  'formula': '$$\nx+1\n$$',
  'table': '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
  // columns dragged wider or narrower: their widths in a comment under the table, which other apps do not show
  'sized table': '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n\n<!-- eve:widths 120 - 240 -->',
  'divider': 'a\n\n---\n\nb',
  'picture': '![cap](assets/a.png)',
  'pdf': '[notes.pdf](assets/notes.pdf)',
  'video': '[clip.mp4](assets/clip.mp4)',
  'link card': 'https://example.com/',
  'board': '```kanban\n{\n  "columns": [\n    {\n      "title": "To do",\n      "cards": [\n        {\n          "title": "A",\n          "body": ""\n        }\n      ]\n    }\n  ]\n}\n```',
  'html around markdown': '<div align="center">\n\n**inside**\n\n</div>',
  'comments': '<!-- a comment -->\n\ntext <!-- c --> more',
  'raw html': '<iframe src="https://x.com"></iframe>',
};

const known = new Map<string, Set<string>>();
const kinds = (s: string) => {
  if (known.has(s)) return known.get(s)!;
  const seen = new Set<string>();
  known.set(s, seen);
  editorWith(s).state.doc.descendants((n) => { seen.add(n.type.name); n.marks.forEach((m) => seen.add('mark:' + m.type.name)); });
  return seen;
};

test('every node and mark the editor knows has a sample here', () => {
  const schema = editorWith('').schema;
  const all = [...Object.keys(schema.nodes).filter((n) => n !== 'doc' && n !== 'text'), ...Object.keys(schema.marks).map((m) => 'mark:' + m)];
  const covered = new Set(Object.values(SAMPLES).flatMap((s) => [...kinds(s)]));
  expect(all.filter((k) => !covered.has(k))).toEqual([]);
});

test.each(Object.entries(SAMPLES))('%s: saved as it was read, and again', (_k, note) => {
  const once = md(editorWith(note));
  expect(once).toBe(note);
  expect(md(editorWith(once))).toBe(once);
});

/** the note copied whole (⌘A ⌘C) and pasted into an empty one, through the clipboard's HTML as a webview passes it */
function copyPaste(note: string): string {
  const from = editorWith(note);
  from.commands.selectAll();
  const { dom, text } = from.view.serializeForClipboard(from.state.selection.content());
  const to = editorWith('');
  const data: Record<string, string> = { 'text/html': dom.innerHTML, 'text/plain': text };
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => data[t] ?? '', files: [], types: Object.keys(data) } });
  to.view.dom.dispatchEvent(e);
  return md(to);
}

test.each(Object.entries(SAMPLES))('%s: copied and pasted into another note, unchanged', (_k, note) => {
  expect(copyPaste(note)).toBe(note);
});

// Each block inside each container a note can nest it in, written as the app writes the container.
const INSIDE: Record<string, (body: string) => string> = {
  'a quote': (b) => b.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'),
  'a callout': (b) => '> [!note] Box\n' + b.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'),
  'a toggle': (b) => `<details open>\n<summary>T</summary>\n\n${b}\n\n</details>`,
  'a list item': (b) => '- item\n\n' + b.split('\n').map((l) => (l ? `  ${l}` : '')).join('\n'),
};
const BLOCKS = ['code', 'lists', 'quote', 'toggle', 'callout', 'formula', 'table', 'sized table', 'divider', 'picture', 'board'];

for (const [where, wrap] of Object.entries(INSIDE)) {
  test.each(BLOCKS)(`%s inside ${where}: saved as it was read, and copied unchanged`, (k) => {
    const note = wrap(SAMPLES[k]).replace(/\n+$/, '');
    const once = md(editorWith(note));
    expect(md(editorWith(once))).toBe(once); // stable, whatever spelling it settles on
    expect(kinds(once)).toEqual(kinds(note)); // and nothing turned into something else
    expect(copyPaste(once)).toBe(once);
  });
}

// what another app gets as plain text is the note's own markdown (a chat, a terminal, another editor)
test.each(Object.entries(SAMPLES))('%s: copied as plain text, it is its markdown', (_k, note) => {
  const ed = editorWith(note);
  ed.commands.selectAll();
  const { text } = ed.view.serializeForClipboard(ed.state.selection.content());
  expect(text.replace(/\n+$/, '')).toBe(note.replace(/\n+$/, ''));
});

// any two blocks one after the other: neither runs into the other (a list swallowing the line after it, a table its
// next paragraph), and the pair saves the same twice
const PAIRS = [...BLOCKS, 'marks and inline nodes', 'html around markdown', 'comments', 'link card'];
test.each(PAIRS.flatMap((a) => PAIRS.map((b) => [a, b])))('%s then %s: both kept', (a, b) => {
  const note = `${SAMPLES[a].replace(/\n+$/, '')}\n\n${SAMPLES[b].replace(/\n+$/, '')}`;
  const first = editorWith(note), once = md(first), again = editorWith(once);
  expect(md(again)).toBe(once);
  expect(again.state.doc.childCount).toBe(first.state.doc.childCount);
  expect(kinds(once)).toEqual(kinds(note));
});

// one block picked out of the middle of a note (a drag over it, from the line above's end to the line below's start)
// and pasted on an empty line: that block, nothing of its neighbours
test.each(BLOCKS)('%s, copied from between two lines, pasted alone', (k) => {
  const note = `above\n\n${SAMPLES[k].replace(/\n+$/, '')}\n\nbelow`;
  const from = editorWith(note);
  const doc = from.state.doc, first = doc.child(0), last = doc.child(doc.childCount - 1);
  from.commands.setTextSelection({ from: first.nodeSize - 1, to: doc.content.size - last.nodeSize + 1 });
  const { dom, text } = from.view.serializeForClipboard(from.state.selection.content());
  const to = editorWith('');
  const data: Record<string, string> = { 'text/html': dom.innerHTML, 'text/plain': text };
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => data[t] ?? '', files: [], types: Object.keys(data) } });
  to.view.dom.dispatchEvent(e);
  // an empty line left around it (the slice's open ends, the line kept after a block) is no part of it
  const got = md(to).split('\n\n').filter((b) => b.trim() && b.trim() !== '&nbsp;').join('\n\n');
  expect(kinds(got)).toEqual(kinds(SAMPLES[k]));
});
