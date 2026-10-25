// Every editing key, at the start and the end of every line, in every kind of block, alone and inside the others.
// Whatever a key does there, the note stays a valid one, saves the same twice, and one ⌘Z gives back exactly what
// was there before. Most of the editing bugs fixed so far broke one of these three somewhere nobody had pressed it.
import { test, expect, afterEach } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { editorWith as make, md, press } from './testEditor';

const made: { destroy(): void }[] = [];
const editorWith = (s: string) => { const ed = make(s); made.push(ed); return ed; };

const BLOCKS: Record<string, string> = {
  'a line': 'one two',
  'a heading': '## Head line',
  'a bulleted list': '- one\n- two\n  - three',
  'a numbered list': '1. one\n2. two\n   1. three',
  'to-dos': '- [ ] one\n- [x] two\n  - [ ] three',
  'a quote': '> one\n>\n> two',
  'a toggle': '<details open>\n<summary>Title</summary>\n\nbody one\n\nbody two\n\n</details>',
  'a callout': '> [!note] Title\n> body one\n>\n> body two',
  'code': '```js\nlet a = 1\nlet b = 2\n```',
  'a table': '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
};
const INSIDE = {
  'on its own': (b: string) => b,
  'in a list item': (b: string) => '- item\n\n' + b.split('\n').map((l) => (l ? `  ${l}` : '')).join('\n'),
  'in a callout': (b: string) => '> [!tip] Box\n' + b.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'),
  'in a toggle': (b: string) => `<details open>\n<summary>T</summary>\n\n${b}\n\n</details>`,
};
const KEYS: [string, KeyboardEventInit][] = [
  ['Enter', {}], ['Backspace', {}], ['Delete', {}], ['Tab', {}], ['Tab', { shiftKey: true }],
  ['ArrowUp', { altKey: true }], ['ArrowDown', { altKey: true }],
  ['7', { ctrlKey: true, shiftKey: true }], ['8', { ctrlKey: true, shiftKey: true }], ['9', { ctrlKey: true, shiftKey: true }],
  ['1', { ctrlKey: true, altKey: true }], ['0', { ctrlKey: true, altKey: true }], ['.', { ctrlKey: true, shiftKey: true }],
  ['c', { ctrlKey: true, altKey: true }], ['Enter', { shiftKey: true }], ['Enter', { ctrlKey: true }],
  // Notion's: to-do, bullets, numbers, toggle, code; move the line; duplicate; every toggle; strike; the line chosen
  // (⌘⌥9 goes to a new page, and is left out as the / menu's New page is)
  ['4', { ctrlKey: true, altKey: true }], ['5', { ctrlKey: true, altKey: true }], ['6', { ctrlKey: true, altKey: true }],
  ['7', { ctrlKey: true, altKey: true }], ['8', { ctrlKey: true, altKey: true }],
  ['ArrowUp', { ctrlKey: true, shiftKey: true }], ['ArrowDown', { ctrlKey: true, shiftKey: true }],
  ['d', { ctrlKey: true }], ['t', { ctrlKey: true, altKey: true }], ['s', { ctrlKey: true, shiftKey: true }], ['a', { ctrlKey: true }],
];
const name = (k: string, o: KeyboardEventInit) => (o.ctrlKey ? '⌘' : '') + (o.altKey ? '⌥' : '') + (o.shiftKey ? '⇧' : '') + k;

/** the start and end of every line of text in the note, with a line of text above and below it all */
function carets(note: string): number[] {
  const out = new Set<number>();
  editorWith(note).state.doc.descendants((n, pos) => {
    if (!n.isTextblock) return true;
    out.add(pos + 1); out.add(pos + 1 + n.content.size);
    return false;
  });
  return [...out];
}

/** the matrix for the blocks put `where` (one test file each, so the four run side by side) */
export function keyMatrix(where: keyof typeof INSIDE) {
  const wrap = INSIDE[where];
  afterEach(() => { for (const ed of made.splice(0)) ed.destroy(); document.body.innerHTML = ''; });
  for (const [kind, block] of Object.entries(BLOCKS)) {
    const note = `above\n\n${wrap(block)}\n\nbelow`;
    test(`${kind} ${where}: every key at every line's ends keeps the note whole, and ⌘Z takes it back`, () => {
      const problems: string[] = [];
      // one editor pressed in, its state put back before each key (a new editor each time took minutes), and one
      // to read each result back in
      const ed = editorWith(note), reread = editorWith('');
      const doc0 = ed.state.doc, before = md(ed);
      for (const at of carets(note)) {
        for (const [key, init] of KEYS) {
          ed.view.updateState(EditorState.create({ doc: doc0, plugins: ed.state.plugins, selection: TextSelection.create(doc0, at) }));
          const label = `${name(key, init)} at ${at} (“${doc0.resolve(at).parent.textContent.slice(0, 12)}”)`;
          try { press(ed, key, init); } catch (e) { problems.push(`${label}: threw ${(e as Error).message}`); continue; }
          try { ed.state.doc.check(); } catch (e) { problems.push(`${label}: invalid note ${(e as Error).message}`); continue; }
          // a line break in text outside code is no line the file can hold: it reads back as a space
          let broken = '';
          ed.state.doc.descendants((n, _p, parent) => { if (n.isText && n.text!.includes('\n') && !parent?.type.spec.code) broken ||= parent!.type.name; });
          if (broken) problems.push(`${label}: a newline inside a ${broken}'s text`);
          const after = md(ed);
          reread.commands.setContent(after);
          const again = md(reread);
          if (again !== after) problems.push(`${label}: saves differently the second time\n${JSON.stringify(after)}\n${JSON.stringify(again)}`);
          if (!ed.state.doc.eq(doc0)) {
            ed.commands.undo();
            if (md(ed) !== before) problems.push(`${label}: one ⌘Z gave back\n${JSON.stringify(md(ed))}\nnot\n${JSON.stringify(before)}`);
          }
        }
      }
      expect(problems).toEqual([]);
    }, 120_000);
  }
}
