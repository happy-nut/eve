// The menus a note opens by itself: right-click (or ⌥↩) inside it, and hovering a link.
import type { Editor } from '@tiptap/core';
import { ui, type MenuItem } from './ui.svelte';
import { openUrl, clipboardText, copyText } from './platform';
import { exportCurrent } from './transfer';
import { shortcuts } from './shortcuts.svelte';

/**
 * Right-click inside a note. The webview's own menu is Look Up / Translate / Speech / AutoFill — a wall
 * of things a note cannot use — so the app draws this one instead: the clipboard, the marks that have
 * keyboard shortcuts nobody remembers, and nothing else.
 */
export function noteMenu(editor: Editor, event: MouseEvent | null) {
  if (event) {
    // a right-click outside the selection moves the caret there first, the way every editor behaves
    const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    const sel = editor.state.selection;
    if (at && (at.pos < sel.from || at.pos > sel.to)) editor.commands.setTextSelection(at.pos);
  }
  const empty = editor.state.selection.empty;
  const linked = editor.isActive('link');
  // the caret on a link (⌥↩ there, or a right-click on it): the link's own menu, the same one hovering shows
  if (empty && linked) {
    const href = editor.getAttributes('link').href ?? '';
    const unlink = () => editor.chain().focus().extendMarkRange('link').unsetLink().run();
    const caret = editor.view.coordsAtPos(editor.state.selection.head);
    ui.openMenu(event ?? { clientX: Math.round(caret.left), clientY: Math.round(caret.bottom) }, linkItems(href, unlink));
    return;
  }
  /** execCommand is the one path that keeps ProseMirror's own clipboard serializer (markdown, nodes) */
  const clip = (cmd: 'cut' | 'copy') => () => { editor.commands.focus(); document.execCommand(cmd); };
  const keys = (id: string) => shortcuts.keysFor(id);
  // nothing greyed out: an item that cannot run is not on the list at all
  const items: MenuItem[] = [
    { label: 'Cut', keys: 'Mod-x', hide: empty, run: clip('cut') },
    { label: 'Copy', keys: 'Mod-c', hide: empty, run: clip('copy') },
    { label: 'Paste', keys: 'Mod-v', run: () => void clipboardText().then((t) => t && editor.view.pasteText(t)) },
    { label: 'Bold', sep: true, keys: keys('bold'), hide: empty, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', keys: keys('italic'), hide: empty, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Code', keys: keys('code'), hide: empty, run: () => editor.chain().focus().toggleCode().run() },
    linked
      ? { label: 'Remove link', run: () => editor.chain().focus().unsetLink().run() }
      : { label: 'Link…', keys: keys('link'), hide: empty, run: () => void linkSelection(editor) },
    { label: 'Select all', sep: true, keys: 'Mod-a', run: () => editor.chain().focus().selectAll().run() },
    { label: 'Export as Markdown…', sep: true, keys: keys('exportMd'), run: () => void exportCurrent('md') },
    { label: 'Export as PDF…', keys: keys('exportPdf'), run: () => void exportCurrent('pdf') },
    { label: 'Export as image…', keys: keys('exportPng'), run: () => void exportCurrent('png') },
  ];
  // from the keyboard (⌥↩) there is no pointer: the menu opens under the caret instead
  const caret = editor.view.coordsAtPos(editor.state.selection.head);
  ui.openMenu(event ?? { clientX: Math.round(caret.left), clientY: Math.round(caret.bottom) }, items);
}

/**
 * Hovering a link: what there is to do with it, under the link itself. An address gets a message and a
 * copy, a page gets opened or copied — the things you would otherwise select the text to do by hand.
 * It takes no focus, so the caret stays where it was writing.
 */
let hovered = '';
/** the pointer left the link: the next hover on it opens its menu again */
export const linkLeft = () => { hovered = ''; };
export function linkMenu(editor: Editor, a: HTMLAnchorElement) {
  const href = a.getAttribute('href') ?? '';
  if (!href || (ui.menu?.hover && hovered === href)) return;
  hovered = href;
  const unlink = () => {
    const at = editor.view.posAtDOM(a, 0);
    editor.chain().setTextSelection({ from: at, to: at + (a.textContent?.length ?? 0) }).unsetLink().setTextSelection(at).run();
  };
  const box = a.getBoundingClientRect();
  ui.openMenu({ clientX: Math.round(box.left), clientY: Math.round(box.bottom + 4) }, linkItems(href, unlink), true);
}

/** What a link offers, wherever it is asked: open (or write to) it, take the link off, copy it. */
function linkItems(href: string, unlink: () => void): MenuItem[] {
  const mail = href.startsWith('mailto:');
  return [
    { label: mail ? 'Send mail' : 'Open link', run: () => void openUrl(href) },
    { label: 'Remove link', run: unlink },
    // an address is copied bare: mailto: is of no use in a To: field
    { label: 'Copy link', run: () => void copyText(mail ? href.slice('mailto:'.length) : href) },
  ];
}


/** Ask for a URL and hang it on the selection (⌘K has no home in this editor). */
async function linkSelection(editor: Editor) {
  const href = (await ui.prompt('링크 주소', ''))?.trim();
  if (!href) return editor.commands.focus();
  editor.chain().focus().setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run();
}
