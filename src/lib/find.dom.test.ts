import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';
import { FIND, findState, replaceAll, replaceOne, setQuery } from './find';

// jsdom draws nothing, so it has no scrollIntoView; showing a match scrolls to it
Element.prototype.scrollIntoView ??= () => {};
afterEach(() => { document.body.innerHTML = ''; });

test.each([
  ['Eve', 'Eve likes Eve. Ask Eve about Eve.'], // the search ignores case: the replacement matches again
  ['steve', 'steve likes steve. Ask steve about steve.'], // the replacement holds the query
  ['you', 'you likes you. Ask you about you.'],
])('replacing one by one with "%s" walks on through the note', (text, all) => {
  const ed = editorWith('eve likes eve. Ask eve about eve.');
  setQuery(ed, 'eve');
  for (let i = 0; i < 4; i++) replaceOne(ed, text);
  expect(ed.state.doc.textContent).toBe(all);
  // and once round, it sits on the first again rather than anywhere past the end
  if (findState(ed).hits.length) expect(findState(ed).index).toBe(0);
});

test.each([
  ['İstanbul eve', 'eve', 'İstanbul X'], // "İ" lower-cased is two characters: the matches after it were one off
  ['EVE and Eve', 'eve', 'X and X'],
  ['오늘 회의, 내일 회의', '회의', '오늘 X, 내일 X'],
  ['a (b) [c]? a.b', '(b) [c]?', 'a X a.b'],
  ['a.b axb', 'a.b', 'X axb'],
])('replace all in "%s" finds "%s" where it is', (note, query, out) => {
  const ed = editorWith(note);
  setQuery(ed, query);
  replaceAll(ed, 'X');
  expect(ed.state.doc.textContent).toBe(out);
});

test('a phrase is found across bold and links, and replaced in the marks of its first letter', () => {
  const ed = editorWith('The **quick** brown fox, the quick [brown](https://x.com) one');
  setQuery(ed, 'quick brown');
  expect(findState(ed).hits.length).toBe(2);
  const { from, to } = findState(ed).hits[0];
  expect(ed.state.doc.textBetween(from, to)).toBe('quick brown');
  replaceAll(ed, 'slow red');
  expect(ed.state.doc.textContent).toBe('The slow red fox, the slow red one');
  expect(md(ed)).toBe('The **slow red** fox, the slow red one');
});

test('words in a [[link]] or a date are found and shown, but Replace leaves them alone', () => {
  const ed = editorWith('see [[Project plan]] and the plan @2026-10-20');
  setQuery(ed, 'plan');
  const { hits } = findState(ed);
  expect(hits.length).toBe(2);
  expect(hits[0].atom).toBe(true);
  expect(ed.state.doc.nodeAt(hits[0].from)?.type.name).toBe('wikiLink');
  setQuery(ed, 'oct');
  // the date reads as its day on screen ("Oct 20" or a word for it); whatever it shows is what is found
  const label = ed.view.dom.querySelector('.datechip')?.textContent ?? '';
  if (/oct/i.test(label)) expect(findState(ed).hits.length).toBe(1);
  setQuery(ed, 'plan');
  replaceOne(ed, 'idea');
  expect(md(ed)).toBe('see [[Project plan]] and the idea @2026-10-20');
  setQuery(ed, 'plan');
  replaceAll(ed, 'X');
  expect(md(ed)).toBe('see [[Project plan]] and the idea @2026-10-20');
});

test('a long note is searched quickly', () => {
  const ed = editorWith(Array.from({ length: 3000 }, (_, i) => `line ${i} with **some** words and [[Link ${i}]]`).join('\n\n'));
  // the search alone (jsdom takes its time drawing 3000 highlights, which a browser does not)
  const t = performance.now();
  const next = ed.state.apply(ed.state.tr.setMeta(FIND, { query: 'some words', index: 0 }));
  expect(FIND.getState(next)!.hits.length).toBe(3000);
  expect(performance.now() - t).toBeLessThan(300);
}, 30_000); // building a 3000-line note in jsdom is slow when the whole suite runs at once; the search is what's timed
