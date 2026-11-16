import { test, expect, afterEach } from 'vitest';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { editorWith, md, press } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

/** a drag from the end of the title to the start of "end" */
function dragAcross(note: string) {
  const ed = editorWith(note);
  const doc = ed.state.doc;
  const from = doc.firstChild!.nodeSize - 1;
  let to = 0;
  doc.forEach((n, pos) => { if (n.textContent === 'end') to = pos + 1; });
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(doc, from, to)).setMeta('pointer', true)); // as ProseMirror marks a mouse's
  return ed;
}

test('a drag that holds nothing but the picture becomes the picture', () => {
  const ed = dragAcross('# t\n\n![](assets/a.png)\n\nend');
  expect(ed.state.selection).toBeInstanceOf(NodeSelection);
});

test('⇧ + an arrow across the picture keeps the end the selection grew from', () => {
  const ed = editorWith('# t\n\n![](assets/a.png)\n\nend');
  const doc = ed.state.doc, from = doc.firstChild!.nodeSize - 1;
  let to = 0;
  doc.forEach((n, pos) => { if (n.textContent === 'end') to = pos + 1; });
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(doc, from, to))); // no pointer: the keyboard
  expect(ed.state.selection).toBeInstanceOf(TextSelection);
  expect(ed.state.selection.anchor).toBe(from);
});

test.each([
  ['a divider', '# t\n\n![](assets/a.png)\n\n---\n\nend'],
  ['empty lines', '# t\n\n![](assets/a.png)\n\n \n\n \n\nend'],
])('a drag across the picture and %s takes them all, and ⌫ removes them all', (_what, note) => {
  const ed = dragAcross(note);
  expect(ed.state.selection).not.toBeInstanceOf(NodeSelection);
  press(ed, 'Backspace');
  expect(md(ed).trim()).toBe('# tend');
});

// A click on a picture opens its menu, and the menu takes the keyboard: ⌫ or ⌦ after it did nothing, the picture
// stayed. The menu has Delete, on ⌫ (⌦ the same), as Notion deletes a picture clicked on.
test.each(['Backspace', 'Delete'])('a picture clicked on, %s deletes it', async (key) => {
  const { mount, unmount, flushSync } = await import('svelte');
  const { default: Menu } = await import('../Menu.svelte');
  const { ui } = await import('./ui.svelte');
  const { imageMenu } = await import('./image');
  (Element.prototype as any).scrollIntoView ??= () => {}; // jsdom draws nothing: no scrolling, no motion
  (Element.prototype as any).animate ??= () => ({ finished: Promise.resolve(), cancel() {}, onfinish: null });
  const ed = editorWith('# t\n\n![](assets/a.png)\n\nend');
  let at = 0;
  ed.state.doc.forEach((n, pos) => { if (n.firstChild?.type.name === 'image' || n.type.name === 'image') at = n.type.name === 'image' ? pos : pos + 1; });
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, at)));
  ed.view.focus(); // as a click on it leaves the keyboard: in the note
  imageMenu(ed, () => at, { clientX: 10, clientY: 10 }, 'assets/a.png');
  const m = mount(Menu, { target: document.body });
  flushSync();
  const menu = document.querySelector('.menu') as HTMLElement;
  expect(menu.contains(document.activeElement)).toBe(true); // the keyboard is on the menu
  menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  flushSync();
  expect(ui.menu).toBeNull();
  expect(md(ed)).not.toContain('a.png');
  expect(md(ed)).toContain('end');
  await new Promise((r) => setTimeout(r, 300)); // the menu gone from the page (it slides away), the keyboard is in the note
  expect(ed.view.dom.contains(document.activeElement)).toBe(true);
  unmount(m);
});
