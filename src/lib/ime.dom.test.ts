import { test, expect, afterEach } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { editorWith, md, posOf } from './testEditor';
import { domObserverOf, whenComposed } from './ime';

// What an input method does with a syllable (한 from ㅎ, 하, 한) can't be had in jsdom: WebKit losing it is not here.
// What is here is the page around it: while the syllable is put together, nothing the app draws changes in the note
// outside the line it goes into, and in that line the decorations stay as they were; once it is in, they are drawn.
// ProseMirror's own drawing of the line itself (it redraws the spans after a syllable typed at a coloured word's end,
// held or not) and of the editor's own element are its business, not the app's.

afterEach(() => { document.body.innerHTML = ''; });

/** the editor with the keyboard in it at `pos` (jsdom focuses only what has a tabindex) */
function caretAt(ed: Editor, pos: number) {
  ed.view.dom.tabIndex = 0;
  ed.commands.setTextSelection(pos);
  ed.view.focus();
}

/** what an input method does: the steps of the syllable written into the text at the caret, each read by the editor */
function compose(ed: Editor, steps: string[]) {
  const v = ed.view;
  v.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  const sel = document.getSelection()!;
  let node = sel.focusNode!, at = sel.focusOffset;
  if (node.nodeType !== Node.TEXT_NODE) {
    const text = document.createTextNode('');
    node.insertBefore(text, node.childNodes[at] ?? null);
    node = text;
    at = 0;
  }
  const text = node as Text;
  let was = '';
  for (const step of steps) {
    text.replaceData(at, was.length, step);
    was = step;
    sel.collapse(text, at + step.length);
    v.dom.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: step }));
    domObserverOf(v)?.flush?.();
  }
  return async () => {
    v.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: was }));
    await new Promise((r) => setTimeout(r, 150));
  };
}

/** the element the caret's line is written in: a node view's own parts (a code block's language chip, a to-do's box) are outside it */
type ViewDesc = { node?: { isTextblock: boolean }; dom: Node; contentDOM?: Node };
function lineAt(view: EditorView): Element {
  for (let el: Node | null = view.domAtPos(view.state.selection.head).node; el; el = el.parentNode) {
    const desc: ViewDesc | undefined = (el as Node & { pmViewDesc?: ViewDesc }).pmViewDesc;
    if (desc?.node?.isTextblock && desc.dom === el) return (desc.contentDOM ?? el) as Element;
  }
  throw new Error('no line at the caret');
}

/** the line's decorations: each element in it with a class, by its classes (a mark's element, ProseMirror's own, has none) */
const drawingOf = (line: Element) => [...line.querySelectorAll('[class]:not(br)')].map((e) => e.className);
const describe = (r: MutationRecord) => `${r.type} on ${(r.target as Element).nodeName?.toLowerCase()}${r.attributeName ? ` [${r.attributeName}]` : ''} ${(r.target as Element).className ?? ''}`.trim();

const grammars = async (ed: Editor) => {
  for (let i = 0; i < 100 && ed.view.dom.querySelector('pre') && !ed.view.dom.querySelector('[class*="hljs-"]'); i++) await new Promise((r) => setTimeout(r, 20));
};

const codeColours = (ed: Editor) => [...ed.view.dom.querySelectorAll('pre [class*="hljs-"]')].map((e) => e.className);
const longLink = (ed: Editor) => ed.view.dom.querySelector('.long-link')?.textContent ?? null;

/** `seen`: what the case is about, before the syllable, while it is put together, and once it is in */
const CASES: { name: string; note: string; at: (ed: Editor) => number; steps?: string[]; seen?: [(ed: Editor) => unknown, unknown, unknown] }[] = [
  { name: 'a line', note: '# T\n\nword', at: (ed) => posOf(ed, 'word', true) },
  { name: 'a heading', note: '# T\n\n## Head', at: (ed) => posOf(ed, 'Head', true) },
  { name: 'a list item', note: '# T\n\n- one', at: (ed) => posOf(ed, 'one', true) },
  { name: 'a quote', note: '# T\n\n> said', at: (ed) => posOf(ed, 'said', true) },
  // its box and hidden label are the stock to-do's, drawn again at every key (사과 came out ㅅㅏ과, 58f4611)
  { name: 'a to-do', note: '# T\n\n- [ ] 하나', at: (ed) => posOf(ed, '하나', true) },
  { name: 'an empty to-do', note: '# T\n\n- [ ] one\n- [ ] ', at: (ed) => ed.state.doc.content.size - 3 },
  { name: 'a callout', note: '# T\n\n> [!💡]\n> body', at: (ed) => posOf(ed, 'body', true) },
  { name: "a toggle's title", note: '# T\n\n<details open>\n<summary>Title</summary>\n\nbody\n\n</details>', at: (ed) => posOf(ed, 'Title', true) },
  { name: 'a table cell', note: '# T\n\n| a | b |\n| --- | --- |\n| c | d |', at: (ed) => posOf(ed, 'c', true) },
  { name: "a footnote's own line", note: '# T\n\ntext[^1]\n\n[^1]: note', at: (ed) => posOf(ed, 'note', true) },
  // the colours of code drawn anew under the word: "// 주석" stayed uncoloured, or WebKit lost letters (dc6592e)
  { name: 'code turned into a comment', note: '# T\n\n```typescript\nconst a: number = 1;\n```', at: (ed) => posOf(ed, 'const'), steps: ['/', '//'],
    seen: [codeColours, ['hljs-keyword', 'hljs-attr', 'hljs-built_in', 'hljs-number'], ['hljs-comment']] },
  // the caret drawn by the code's own letter (a966b2f): it stays while the syllable is put together beside it
  { name: 'beside inline code', note: '# T\n\nw `ab`', at: (ed) => posOf(ed, 'ab', true) },
  // a bare address is cut short once the caret leaves it
  { name: 'just after a bare address', note: '# T\n\nsee https://example.com/a/rather/long/path/to/somewhere', at: (ed) => posOf(ed, 'somewhere', true),
    seen: [longLink, null, 'https://example.com/a/rather/long/path/to/somewhere'] },
];

test.each(CASES)('in $name, a syllable being typed changes nothing the app draws until it is in', async ({ note, at, steps = ['ㅎ', '하', '한'], seen }) => {
  const ed = editorWith(note);
  await grammars(ed);
  caretAt(ed, at(ed));
  const [what, before, after] = seen ?? [() => null, null, null];
  expect(what(ed)).toEqual(before);
  const line = lineAt(ed.view);
  const drawing = drawingOf(line);
  const watch = new MutationObserver(() => {});
  watch.observe(ed.view.dom, { subtree: true, childList: true, attributes: true, characterData: true });

  const end = compose(ed, steps);
  expect(ed.view.composing).toBe(true);
  expect(ed.state.doc.textContent).toContain(steps[steps.length - 1]);
  const outside = watch.takeRecords().filter((r) => r.target.isConnected && !line.contains(r.target) && !(r.target === ed.view.dom && r.type === 'attributes'));
  expect(outside.map(describe), 'changed outside the line while the syllable was put together').toEqual([]);
  expect(drawingOf(line), "the line's decorations while the syllable was put together").toEqual(drawing);
  expect(what(ed), 'while the syllable was put together').toEqual(before);

  await end();
  watch.disconnect();
  expect(md(ed)).toContain(steps[steps.length - 1]);
  expect(what(ed), 'once the syllable is in').toEqual(after);
});

test('a node view draws what it holds back once the syllable is in, the last of it, once', async () => {
  const ed = editorWith('# T\n\nword');
  caretAt(ed, posOf(ed, 'word', true));
  const drawn: number[] = [];
  let latest = 0;
  const draw = () => { drawn.push(latest); };
  whenComposed(ed.view, draw);
  expect(drawn, 'drawn at once while nothing is being typed').toEqual([0]);

  const end = compose(ed, ['ㅎ', '하']);
  for (latest = 1; latest <= 3; latest++) whenComposed(ed.view, draw);
  expect(drawn).toEqual([0]);
  await end();
  expect(drawn).toEqual([0, 4]);
});
