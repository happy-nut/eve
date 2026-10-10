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

test.each([
  ['an empty line at its end', '```\nx\n\n```'],
  ['two empty lines at its end', '```js\nx\n\n\n```'],
  ['no empty line at its end', '```\nx\n```'],
  ['nothing in it', '```\n```'],
  ['more after its language', '```js title="a.js" {1,3}\nx\n```'],
  ['an empty line at its end, in a quote', '> ```\n> x\n> \n> ```'],
  ['an empty line at its end, in a list', '- a\n\n  ```\n  x\n  \n  ```'],
])('code with %s is written as it was read', (_what, note) => {
  expect(save(note)).toBe(note);
});
