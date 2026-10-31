import { test, expect } from 'vitest';
import { slides, paginate, sentences, join } from './slides';

const blocks = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return [...d.children]; };
const text = (s: Element[][]) => s.map((x) => x.map((b) => b.textContent).join('|'));

test('a new slide at each heading of the biggest size under the title, the title with what precedes the first', () => {
  expect(text(slides(blocks('<h1>Talk</h1><p>by me</p><h2>One</h2><p>a</p><h3>sub</h3><p>b</p><h2>Two</h2><p>c</p>'))))
    .toEqual(['Talk|by me', 'One|a|sub|b', 'Two|c']);
});

test('a divider is no place to cut: it stays among its lines', () => {
  expect(text(slides(blocks('<h1>T</h1><p>a</p><hr><p>b</p>')))).toEqual(['T|a||b']);
});

// a screen that holds three blocks
const three = (b: Element[]) => b.length <= 3;
const again = (h: Element) => h.cloneNode(true) as Element;

test('a slide longer than the screen goes on to the next, under its heading again', () => {
  const deck = slides(blocks('<h1>T</h1><p>x</p><h2>Long</h2><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><h2>Short</h2><p>s</p>'));
  expect(text(paginate(deck, three, again))).toEqual(['T|x', 'Long|1|2', 'Long|3|4', 'Long|5', 'Short|s']);
});

test('a note with no headings is cut by the screen alone', () => {
  expect(text(paginate(slides(blocks('<p>1</p><p>2</p><p>3</p><p>4</p>')), three, again))).toEqual(['1|2|3', '4']);
});

test('a block too tall for any screen is a slide of its own; a divider left at a slide\'s edge goes', () => {
  const tall = (b: Element[]) => !b.some((x) => x.textContent === 'tall') || b.length === 1;
  expect(text(paginate(slides(blocks('<p>a</p><p>tall</p><p>b</p>')), tall, again))).toEqual(['a', 'tall', 'b']);
  expect(text(paginate(slides(blocks('<p>1</p><p>2</p><p>3</p><hr><p>4</p>')), three, again))).toEqual(['1|2|3', '4']);
});

test('a subheading at the foot of a slide goes on with its words, under the slide\'s heading again', () => {
  const deck = slides(blocks('<h1>T</h1><p>x</p><h1>A</h1><p>1</p><h2>Sub</h2><p>2</p>'));
  expect(text(paginate(deck, three, again))).toEqual(['T|x', 'A|1', 'A|Sub|2']);
});

test('a slide gone on to the next keeps its heading and the subheading it is under on top; a new subheading takes the old one\'s place', () => {
  const deck = slides(blocks('<h1>T</h1><h1>A</h1><h2>S1</h2><p>1</p><p>2</p><p>3</p><h2>S2</h2><p>4</p><p>5</p>'));
  expect(text(paginate(deck, (b) => b.length <= 4, again))).toEqual(['T', 'A|S1|1|2', 'A|S1|3', 'A|S2|4|5']);
});

test('a paragraph cut into its sentences, its bold and links kept, put back together the same', () => {
  const [p] = blocks('<p>One <b>two.</b> Three? <a href="x">Four</a>! Five</p>');
  const parts = sentences(p);
  expect(parts.map((x) => x.textContent)).toEqual(['One two.', ' Three?', ' Four!', ' Five']);
  expect(join(parts).map((x) => x.innerHTML)).toEqual([p.innerHTML]);
  expect(sentences(blocks('<p>Just one sentence.</p>')[0])).toHaveLength(1);
});

test('a long paragraph goes on from where the screen ends, a short one goes whole; the note\'s title is not shown again', () => {
  // a screen of five sentences, a heading or paragraph counted as one
  const room = (b: Element[]) => b.reduce((n, x) => n + Math.max(1, x.textContent!.split('.').length - 1), 0) <= 5;
  const deck = slides(blocks('<h1>Novel</h1><p>a. b. c.</p><p>d. e. f. g. h. i.</p><p>j. k.</p>'));
  const out = paginate(deck, room, again, sentences);
  expect(text(out)).toEqual(['Novel|a. b. c.|d.', ' e. f. g. h. i.', 'j. k.']);
});
