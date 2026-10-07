import { test, expect, afterEach } from 'vitest';
import { editorWith } from './testEditor';
import { keepToNote } from './keep';

afterEach(() => { document.body.innerHTML = ''; });

test('a Keep note opens in the editor as it read in Keep', () => {
  const k = keepToNote({
    title: 'Plan', textContent: '# not a heading\n> not a quote\na <b> tag\n\nlast', isTrashed: false,
    listContent: [{ text: 'open', isChecked: false }, { text: 'done', isChecked: true }],
  })!;
  const ed = editorWith(k.body);
  const blocks: string[] = [];
  ed.state.doc.forEach((n) => blocks.push(`${n.type.name}:${n.textContent}`));
  expect(blocks).toEqual([
    'heading:Plan',
    'paragraph:# not a heading',
    'paragraph:> not a quote',
    'paragraph:a <b> tag',
    'paragraph:',
    'paragraph:last',
    'taskList:opendone',
  ]);
  const items: boolean[] = [];
  ed.state.doc.descendants((n) => { if (n.type.name === 'taskItem') items.push(n.attrs.checked); });
  expect(items).toEqual([false, true]);
});

test('text that looks like markdown reads back as it was typed in Keep', () => {
  const lines = ['1. first', '2) second', '- dash', '* star', '+ plus', '- [x] done', '---', '***', '___', '```', '~~~',
    '*bold* _it_ **b** ~~s~~ `code` [link](x) \\* back', 'AT&amp;T &copy; &#35;', 'a | b | c', '<b>tag</b>', 'Learn C #'];
  const k = keepToNote({ title: 'Issue #', textContent: [...lines, '    four spaces', '\tTab line', 'after'].join('\n'), isTrashed: false,
    annotations: [{ url: 'https://e.com/x y', title: 'A [b] *c*' }] })!;
  const ed = editorWith(k.body);
  const blocks: string[] = [];
  ed.state.doc.forEach((n) => blocks.push(`${n.type.name}:${n.textContent}`));
  expect(blocks).toEqual([
    'heading:Issue #',
    ...lines.map((l) => `paragraph:${l}`),
    'paragraph:    four spaces',
    'paragraph:    Tab line',
    'paragraph:after',
    'bulletList:A [b] *c*',
  ]);
  let href = '';
  ed.state.doc.descendants((n) => { for (const m of n.marks) if (m.type.name === 'link') href = m.attrs.href; });
  expect(href).toBe('https://e.com/x%20y');
});

test('a title of only "#", or a long first line cut through an emoji, stays whole', () => {
  const hash = editorWith(keepToNote({ title: '#', textContent: 'x', isTrashed: false })!.body);
  expect(hash.state.doc.firstChild!.textContent).toBe('#');
  const long = 'a'.repeat(39) + '😀' + 'b'.repeat(30);
  const title = editorWith(keepToNote({ title: '', textContent: long, isTrashed: false })!.body).state.doc.firstChild!.textContent;
  expect(title).toBe('a'.repeat(39) + '😀…');
  expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no half of an emoji
});
