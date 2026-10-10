import { test, expect, afterEach } from 'vitest';
import { editorWith } from './testEditor';
import { findState, replaceAll, replaceOne, setQuery } from './find';

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
