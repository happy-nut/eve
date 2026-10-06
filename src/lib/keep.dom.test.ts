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
