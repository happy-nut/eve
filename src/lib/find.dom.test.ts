import { test, expect, afterEach } from 'vitest';
import { editorWith } from './testEditor';
import { findState, replaceOne, setQuery } from './find';

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
