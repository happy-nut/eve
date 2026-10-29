// The ⋮⋮ handle's drag (blockHandle.ts): a block let go between two others goes there whole, in one step ⌘Z takes back
import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';
import { moveBlockTo } from './blockHandle';
import type { Editor } from '@tiptap/core';

let ed: Editor | null = null;
afterEach(() => { ed?.destroy(); ed = null; document.body.innerHTML = ''; });

/** where each top-level block starts, the title first */
const starts = (e: Editor) => { const out: number[] = []; e.state.doc.forEach((_n, pos) => out.push(pos)); return out; };

test('a block dragged below another goes there, its list and all; one ⌘Z puts it back', () => {
  ed = editorWith('# Title\n\nfirst\n\n- a\n- b\n\nlast\n');
  const before = md(ed);
  const [, first, , last] = starts(ed);
  ed.view.dispatch(moveBlockTo(ed.state, first, last)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\n- a\n- b\n\nfirst\n\nlast');
  ed.commands.undo();
  expect(md(ed)).toBe(before);
});

test('…and above, and let go on itself or right beside itself it stays', () => {
  ed = editorWith('# Title\n\nfirst\n\nsecond\n');
  const [, first, second] = starts(ed);
  ed.view.dispatch(moveBlockTo(ed.state, second, first)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\nsecond\n\nfirst');
  const [, a] = starts(ed);
  const size = ed.state.doc.nodeAt(a)!.nodeSize;
  expect(moveBlockTo(ed.state, a, a)).toBeNull();
  expect(moveBlockTo(ed.state, a, a + size)).toBeNull();
});

test('let go with ⌥ held, a copy goes there and the block stays', () => {
  ed = editorWith('# Title\n\nfirst\n\nsecond\n');
  const [, first, second] = starts(ed);
  ed.view.dispatch(moveBlockTo(ed.state, first, second + ed.state.doc.nodeAt(second)!.nodeSize, true)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\nfirst\n\nsecond\n\nfirst');
});

/** where the list item whose first line reads `text` starts */
const itemAt = (e: Editor, text: string) => {
  let at = -1;
  e.state.doc.descendants((n, pos) => { if (at < 0 && /Item$/.test(n.type.name) && n.firstChild?.textContent === text) at = pos; });
  return at;
};

test("a list's line dragged out of its list goes there as a list of its own kind; its sub-items go with it", () => {
  ed = editorWith('# Title\n\n- a\n- b\n  - b1\n- c\n\nlast\n');
  const before = md(ed);
  const last = starts(ed)[2];
  ed.view.dispatch(moveBlockTo(ed.state, itemAt(ed, 'b'), last + ed.state.doc.nodeAt(last)!.nodeSize)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\n- a\n- c\n\nlast\n\n- b\n  - b1');
  ed.commands.undo();
  expect(md(ed)).toBe(before);
});

test("the only line of its list dragged out takes its list along: no empty list left, numbers start again", () => {
  ed = editorWith('# Title\n\nfirst\n\n3. only\n\n- [ ] todo\n');
  const [, first] = starts(ed);
  ed.view.dispatch(moveBlockTo(ed.state, itemAt(ed, 'only'), first)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\n1. only\n\nfirst\n\n- [ ] todo');
  // and a to-do into a toggle's body, the only block of a quote out of it
  ed = editorWith('# Title\n\n> - [x] done\n\n<details open>\n<summary>T</summary>\n\nbody\n\n</details>\n');
  let inBody = -1;
  ed.state.doc.descendants((n, pos) => { if (inBody < 0 && n.type.name === 'detailsContent') inBody = pos + 1; });
  ed.view.dispatch(moveBlockTo(ed.state, itemAt(ed, 'done'), inBody)!);
  expect(md(ed).trimEnd()).toMatch(/^# Title\n\n>\s*\n\n<details open>\n<summary>T<\/summary>\n\n- \[x\] done\n\nbody\n\n<\/details>$/);
});

test("a to-do let go between two numbered lines goes between them: the list is split there, the rest counts on", () => {
  ed = editorWith('# Title\n\n1. one\n2. two\n\n- [ ] todo\n\nplain\n');
  const between = itemAt(ed, 'two');
  ed.view.dispatch(moveBlockTo(ed.state, itemAt(ed, 'todo'), between)!);
  expect(md(ed).trimEnd()).toBe('# Title\n\n1. one\n\n- [ ] todo\n\n2. two\n\nplain');
  // a plain line too
  const [, , , , plain] = starts(ed);
  ed.view.dispatch(moveBlockTo(ed.state, plain, itemAt(ed, 'two'))!);
  expect(md(ed).trimEnd()).toBe('# Title\n\n1. one\n\n- [ ] todo\n\nplain\n\n2. two');
});
