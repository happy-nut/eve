import { test, expect } from 'vitest';
import { slides } from './slides';

const blocks = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return [...d.children]; };
const text = (s: Element[][]) => s.map((x) => x.map((b) => b.textContent).join('|'));

test('a new slide at each heading of the biggest size under the title, the title with what precedes the first', () => {
  expect(text(slides(blocks('<h1>Talk</h1><p>by me</p><h2>One</h2><p>a</p><h3>sub</h3><p>b</p><h2>Two</h2><p>c</p>'))))
    .toEqual(['Talk|by me', 'One|a|sub|b', 'Two|c']);
});

test('a divider starts a slide too and is not shown; nothing empty is left between two', () => {
  expect(text(slides(blocks('<h1>T</h1><p>a</p><hr><p>b</p><hr><hr><p>c</p>')))).toEqual(['T|a', 'b', 'c']);
});

test('a note with no headings or dividers is one slide', () => {
  expect(text(slides(blocks('<h1>T</h1><p>a</p><p>b</p>')))).toEqual(['T|a|b']);
});
