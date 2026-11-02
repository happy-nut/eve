import { test, expect } from 'vitest';
import { slides, alone } from './slides';

const blocks = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return [...d.children]; };
const text = (s: Element[][]) => s.map((x) => x.map((b) => b.textContent).join('|'));

test('a new slide at each heading of the biggest size under the title, the title with what precedes the first', () => {
  expect(text(slides(blocks('<h1>Talk</h1><p>by me</p><h2>One</h2><p>a</p><h3>sub</h3><p>b</p><h2>Two</h2><p>c</p>'))))
    .toEqual(['Talk|by me', 'One|a|sub|b', 'Two|c']);
});

test('a divider is no place to cut: it stays among its lines', () => {
  expect(text(slides(blocks('<h1>T</h1><p>a</p><hr><p>b</p>')))).toEqual(['T|a||b']);
});

// a diagram a slide of its own (Present.svelte), under the headings it is under: the path to it, not every heading before
const chart = (b: Element) => b.tagName === 'FIGURE';
const crumb = (h: Element) => { const c = h.cloneNode(true) as Element; c.classList.add('again'); return c; };
const shown = (s: Element[][]) => s.map((x) => x.map((b) => (b.classList.contains('again') ? `(${b.textContent})` : b.textContent)).join('|'));

test("a diagram's slide is under its section's heading and the last subheading before it, not every one", () => {
  const deck = slides(blocks('<h1>T</h1><h2>Sec</h2><h3>a</h3><p>x</p><h3>b</h3><p>y</p><h3>c</h3><p>z</p><figure>D</figure><p>after</p>'));
  expect(shown(alone(deck, chart, crumb))).toEqual(['T', 'Sec|a|x|b|y|c|z', '(Sec)|(c)|D', '(Sec)|(c)|after']);
});

test('a deeper heading gives way to a shallower one: a new section starts the path again', () => {
  const deck = [blocks('<h2>One</h2><h3>a</h3><h4>deep</h4><p>x</p><h3>b</h3><p>y</p><figure>D</figure>')];
  expect(shown(alone(deck, chart, crumb))).toEqual(['One|a|deep|x|b|y', '(One)|(b)|D']);
});

test('a diagram right under its headings keeps them as they are; two diagrams each a slide', () => {
  const deck = [blocks('<h2>Flow</h2><figure>D1</figure><figure>D2</figure>')];
  expect(shown(alone(deck, chart, crumb))).toEqual(['Flow|D1', '(Flow)|D2']);
});
