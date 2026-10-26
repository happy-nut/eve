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
