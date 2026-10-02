// A real editor in jsdom for the *.dom.test.ts files: the note's own extensions, no app around it.
import { createEditor, getMarkdown } from './editor';
import type { Editor } from '@tiptap/core';

const noop = () => {};
const popup = { visible: () => false, show: noop, hide: noop, update: noop, key: () => false } as any;

export function editorWith(content: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  return createEditor({ element, content, onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI: popup, calendarUI: popup, emojiUI: popup });
}

export const md = getMarkdown;

/** Where `word` starts in the document (or ends, with `end`). */
export function posOf(ed: Editor, word: string, end = false): number {
  let p = -1;
  ed.state.doc.descendants((n, pos) => {
    if (p < 0 && n.isText && n.text!.includes(word)) p = pos + n.text!.indexOf(word) + (end ? word.length : 0);
  });
  if (p < 0) throw new Error(`no "${word}" in the note`);
  return p;
}

/** Type as a keyboard would, one character at a time, so input rules fire. */
export function type(ed: Editor, text: string) {
  const v = ed.view;
  for (const ch of text) {
    const { from, to } = v.state.selection;
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)));
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to));
  }
}

/** A key press through the editor's keymaps (Enter, Tab, …). */
export function press(ed: Editor, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  ed.view.dom.dispatchEvent(e);
  return e;
}

/** Paste plain text the way the clipboard hands it over. */
export function paste(ed: Editor, text: string) {
  // jsdom has no DataTransfer: the handlers only read these
  const clipboardData = { getData: (t: string) => (t === 'text/plain' ? text : ''), files: [], types: ['text/plain'] };
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: clipboardData });
  ed.view.dom.dispatchEvent(e);
  return e;
}

// jsdom lays nothing out: a range has no boxes, which ProseMirror asks for to place a popup at the caret
const box = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {} }) as DOMRect;
Range.prototype.getBoundingClientRect ??= box;
Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
document.elementFromPoint ??= () => null;
