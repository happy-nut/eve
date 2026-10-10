// Pictures, PDFs, videos, link cards and math in a note: where they land, what they keep, how the keys treat them.
import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf, press } from './testEditor';
import { NodeSelection } from '@tiptap/pm/state';
import { dropBlock } from './editor';

afterEach(() => { document.body.innerHTML = ''; });

/** where a file let go on the line holding `word` would go (jsdom has no layout: always below the line) */
function dropOn(note: string, word: string) {
  const ed = editorWith(note);
  const at = posOf(ed, word);
  ed.view.posAtCoords = () => ({ pos: at + 1, inside: -1 });
  const pos = dropBlock(ed.view, { clientX: 0, clientY: 10 } as DragEvent)!;
  return ed.state.doc.resolve(pos);
}

test('a file dropped on a list item goes into that item, not under the whole list', () => {
  const $p = dropOn('# L\n\n- one\n- two\n- three', 'two');
  expect($p.parent.type.name).toBe('listItem');
  expect($p.parent.textContent).toBe('two');
});

test('a file dropped in a table cell goes into that cell', () => {
  const $p = dropOn('# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |', '2');
  expect($p.parent.type.name).toBe('tableCell');
  expect($p.parent.textContent).toBe('2');
});

test('a file dropped on a line in a callout stays in the callout', () => {
  const $p = dropOn('# C\n\n> [!note] Title\n> first\n> second', 'first');
  expect($p.parent.type.name).toBe('callout');
});

test('a file dropped on a plain line goes right under it', () => {
  const $p = dropOn('# P\n\nfirst\n\nsecond', 'first');
  expect($p.depth).toBe(0);
  expect($p.nodeBefore?.textContent).toBe('first');
});

/** a card put into a note, saved, and the note opened again — twice */
function cardTwice(href: string) {
  const ed = editorWith('# t\n\nx');
  ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'bookmark', attrs: { href } });
  const once = md(ed);
  const back = editorWith(once);
  return { once, back, twice: md(back) };
}

test.each([
  'https://ko.wikipedia.org/wiki/서울',
  'https://ko.wikipedia.org/wiki/%EC%84%9C%EC%9A%B8',
  'https://example.com/[x]',
])('a card for %s is still a card when the note is opened again', (href) => {
  const { back, twice } = cardTwice(href);
  expect(back.state.doc.lastChild!.type.name).toBe('bookmark');
  // the address may come back encoded (%EC…), the same page; from then on the file stays as it is
  const again = editorWith(twice);
  expect(again.state.doc.lastChild!.type.name).toBe('bookmark');
  expect(md(again)).toBe(twice);
});

test.each([
  'https://example.com/*star*',
  'https://example.com/a)b',
  'https://example.com/path.',
])('a card markdown cannot write bare (%s) stays one whole link', (href) => {
  const { back, once, twice } = cardTwice(href);
  expect(once).toBe(`# t\n\nx\n\n<${href}>`);
  const line = back.state.doc.lastChild!;
  expect(line.textContent).toBe(href);
  expect(line.firstChild!.marks[0]?.attrs.href).toBe(href);
  expect(twice).toBe(once);
});

/** the picture after the note is saved and opened again, three times over */
function pictureAfterReopening(attrs: Record<string, unknown>, note = '# t\n\n![](assets/a.png)\n\nend') {
  const ed = editorWith(note);
  let pos = -1;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'image') pos = p; });
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, ...attrs }));
  let s = md(ed);
  for (let i = 0; i < 3; i++) s = md(editorWith(s));
  let image: any;
  editorWith(s).state.doc.descendants((n) => { if (n.type.name === 'image') image = n.attrs; });
  return image;
}

test.each(['2*3=6', '[draft]', 'C:\\path', '`code`', 'a ~~b~~', 'pic==hi==', 'cost $5$', 'a_b_c', 'Seoul|2024', 'v1.0|50', 'x <b> y', 'A & B'])(
  'the caption %s comes back as it was written',
  (alt) => {
    const image = pictureAfterReopening({ alt });
    expect(image.alt).toBe(alt);
    expect(image.width).toBe(null);
  },
);

test('a caption ending in |2024 keeps its own width beside it', () => {
  const image = pictureAfterReopening({ alt: 'Seoul|2024', width: 540 });
  expect(image).toMatchObject({ alt: 'Seoul|2024', width: 540 });
});

test('a caption in a table cell comes back as it was written', () => {
  const image = pictureAfterReopening({ alt: '2*3=6 [x]' }, '# t\n\n| a |\n| --- |\n| ![](assets/a.png) |');
  expect(image.alt).toBe('2*3=6 [x]');
});

test('a width written smaller than a drag can make is read as the smallest width', () => {
  let image: any;
  editorWith('# t\n\n![pic|50](assets/a.png)').state.doc.descendants((n) => { if (n.type.name === 'image') image = n.attrs; });
  expect(image).toMatchObject({ alt: 'pic', width: 120 });
});

/** a note with "see $x$ ok" whose formula is set to `latex` (and `after` typed right behind it), saved and reopened twice */
function formulaReopened(latex: string, after = '') {
  const ed = editorWith('# t\n\nsee $x$ ok');
  let pos = -1;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'mathInline') pos = p; });
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { latex }));
  if (after) ed.view.dispatch(ed.state.tr.insertText(after, pos + 1));
  const once = md(ed);
  const back = editorWith(once);
  const found: string[] = [];
  back.state.doc.descendants((n) => { if (n.type.name === 'mathInline') found.push(n.attrs.latex); });
  return { found, text: back.state.doc.lastChild!.textContent, once, twice: md(back) };
}

test.each([
  ['spaces typed around it', ' x^2 ', 'x^2'],
  ['a TeX line break at its end', 'a\\\\', 'a\\\\{}'],
  ['a line break inside', 'a\nb', 'a b'],
])('a formula with %s is still a formula when the note is opened again', (_what, latex, back) => {
  const { found, once, twice } = formulaReopened(latex);
  expect(found).toEqual([back]);
  expect(twice).toBe(once);
});

test('a formula with a digit right after it is still a formula, the digit still after it', () => {
  const { found, text, once, twice } = formulaReopened('x', '2');
  expect(found).toEqual(['x']);
  expect(text).toBe('see 2 ok');
  expect(twice).toBe(once);
});

test.each([
  ['a picture', '![cap](assets/a.png)', 'image'],
  ['a PDF', '[d.pdf](assets/d.pdf)', 'pdf'],
  ['a video', '[v.mp4](assets/v.mp4)', 'video'],
  ['a link card', 'https://example.com/', 'bookmark'],
  ['a formula block', '$$\nx^2\n$$', 'mathBlock'],
])('⌫ under %s selects it first and removes it the second time; Delete over it does the same', (_what, block, type) => {
  const note = `# t\n\nabove\n\n${block}\n\nbelow`;
  const back = editorWith(note);
  back.commands.setTextSelection(posOf(back, 'below'));
  press(back, 'Backspace');
  expect((back.state.selection as NodeSelection).node?.type.name).toBe(type);
  expect(md(back)).toBe(md(editorWith(note)));
  press(back, 'Backspace');
  expect(md(back)).toBe('# t\n\nabove\n\nbelow');

  const fwd = editorWith(note);
  fwd.commands.setTextSelection(posOf(fwd, 'above', true));
  press(fwd, 'Delete');
  expect((fwd.state.selection as NodeSelection).node?.type.name).toBe(type);
  press(fwd, 'Delete');
  expect(md(fwd)).toBe('# t\n\nabove\n\nbelow');
});

test('⌫ at the start of a line under plain text still joins the two lines', () => {
  const ed = editorWith('# t\n\nabove\n\nbelow');
  ed.commands.setTextSelection(posOf(ed, 'below'));
  press(ed, 'Backspace');
  expect(md(ed)).toBe('# t\n\nabovebelow');
});

test('resizing a video leaves the player alone; only another file loads anew', () => {
  const ed = editorWith('# t\n\n[v.mp4](assets/v.mp4)');
  const video = ed.view.dom.querySelector('video')!;
  let loads = 0;
  const own = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
  Object.defineProperty(video, 'src', { get: () => own.get!.call(video), set: (v) => { loads++; own.set!.call(video, v); } });
  let pos = -1;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'video') pos = p; });
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, width: 300 }));
  expect(video.style.width).toBe('300px');
  expect(loads).toBe(0);
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, src: 'assets/w.mp4' }));
  expect(loads).toBe(1);
});

test('↩ after such an address leaves it a link instead of making a card that would not come back', () => {
  const ed = editorWith('# t\n\nhttps://example.com/*star*');
  ed.commands.setTextSelection(ed.state.doc.content.size - 1);
  press(ed, 'Enter');
  ed.state.doc.forEach((n) => expect(n.type.name).not.toBe('bookmark'));
});
