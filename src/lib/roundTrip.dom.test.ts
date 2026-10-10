import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

const save = (s: string) => md(editorWith(s));

test.each([
  ['a ")" in its file name', '![a](<a)b.png>)'],
  ['a " in its title', '![a](x.png "say \\"hi\\"")'],
  ['parentheses that pair up', '![a](a(1).png)'],
])('a picture with %s is still a picture', (_what, note) => {
  expect(save(note)).toBe(note);
  expect(editorWith(note).state.doc.firstChild!.type.name).toBe('image');
});
