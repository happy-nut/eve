import type { Editor } from '@tiptap/core';
import type { NodeSelection } from '@tiptap/pm/state';
import { cardable, cardToLink, linkToCard } from './bookmark';
import { ui, type MenuItem } from './ui.svelte';
import { openUrl, clipboardText, copyText } from './platform';
import { exportCurrent } from './transfer';
import { shortcuts } from './shortcuts.svelte';
import { imageMenu } from './image';
import { highlightMenu } from './highlight';
import { COLORS, colorAt, colorText } from './textColor';

type At = { clientX: number; clientY: number };
type LinkMark = NonNullable<ReturnType<typeof linkMarkAtCaret>>;

const linkMarkAtCaret = (editor: Editor) => {
  const $h = editor.state.selection.$head;
  return [...$h.marks(), ...($h.nodeAfter?.marks ?? []), ...($h.nodeBefore?.marks ?? [])].find((m) => m.type.name === 'link');
};

function presentFromCaret(editor: Editor) {
  const d = editor.view.domAtPos(editor.state.selection.from).node;
  let b: Node | null = d;
  while (b && b.parentNode !== editor.view.dom) b = b.parentNode;
  ui.openPresent(editor.view.dom, b as Element | null);
}

function bookmarkMenu(editor: Editor, at: At, href: string) {
  ui.openMenu(at, [{ label: 'Show as link', run: () => void cardToLink(editor) }, ...linkItems(href, null).map((i, n) => (n ? i : { ...i, sep: true }))]);
}

function linkMenu(editor: Editor, at: At, linkMark: LinkMark) {
  const href = (linkMark.attrs.href as string | undefined) ?? '';
  const unlink = () => editor.chain().focus().extendMarkRange('link').unsetLink().run();
  const card = cardable(editor, href) ? [{ label: 'Show as card', run: () => void linkToCard(editor) }] : [];
  ui.openMenu(at, [...card, ...linkItems(href, unlink).map((i, n) => (n || !card.length ? i : { ...i, sep: true }))]);
}

export function noteMenu(editor: Editor, event: MouseEvent | null) {
  if (event) {
    const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    const sel = editor.state.selection;
    if (at && (at.pos < sel.from || at.pos > sel.to)) editor.commands.setTextSelection(at.pos);
  }
  const empty = editor.state.selection.empty;
  const linkMark = linkMarkAtCaret(editor);
  const caret = editor.view.coordsAtPos(editor.state.selection.head);
  const at = event ?? { clientX: Math.round(caret.left), clientY: Math.round(caret.bottom) };
  const sel = editor.state.selection as NodeSelection;
  if (sel.node?.type.name === 'bookmark') {
    bookmarkMenu(editor, at, sel.node.attrs.href);
    return;
  }
  if (sel.node?.type.name === 'image') {
    const pos = sel.from;
    const shown = (editor.view.nodeDOM(pos) as HTMLElement | null)?.querySelector('img');
    imageMenu(editor, () => pos, at, shown?.src || sel.node.attrs.src);
    return;
  }
  if (empty && linkMark) {
    linkMenu(editor, at, linkMark);
    return;
  }
  textMenu(editor, at, empty, !!linkMark);
}

function textMenu(editor: Editor, at: At, empty: boolean, linked: boolean) {
  /** execCommand is the one path that keeps ProseMirror's own clipboard serializer (markdown, nodes) */
  const clip = (cmd: 'cut' | 'copy') => () => { editor.commands.focus(); document.execCommand(cmd); };
  const keys = (id: string) => shortcuts.keysFor(id);
  const items: MenuItem[] = [
    { label: 'Cut', keys: 'Mod-x', hide: empty, run: clip('cut') },
    { label: 'Copy', keys: 'Mod-c', hide: empty, run: clip('copy') },
    { label: 'Paste', keys: 'Mod-v', run: () => void clipboardText().then((t) => t && editor.view.pasteText(t)) },
    { label: 'Bold', sep: true, keys: keys('bold'), hide: empty, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', keys: keys('italic'), hide: empty, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Strikethrough', keys: keys('strike'), hide: empty, run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Highlight…', keys: keys('highlight'), hide: empty, run: () => highlightMenu(editor) },
    { label: 'Text color…', hide: empty, run: () => textColorMenu(editor, at) },
    { label: 'Code', keys: keys('code'), hide: empty, run: () => editor.chain().focus().toggleCode().run() },
    linked
      ? { label: 'Remove link', run: () => editor.chain().focus().unsetLink().run() }
      : { label: 'Link…', keys: keys('link'), hide: empty, run: () => void linkSelection(editor) },
    { label: 'Select all', sep: true, keys: 'Mod-a', hide: !empty, run: () => editor.chain().focus().selectAll().run() },
    { label: 'Find & replace…', keys: keys('find'), hide: !empty, run: () => ui.openFind() },
    { label: 'Present', keys: keys('present'), hide: !empty, run: () => ui.openPresent(editor.view.dom) },
    { label: 'Present from here', keys: keys('presentHere'), hide: !empty, run: () => presentFromCaret(editor) },
    { label: 'Export…', sep: true, hide: !empty, run: () => exportMenu(at) },
  ];
  ui.openMenu(at, items);
}

function textColorMenu(editor: Editor, at: At) {
  const { from, to } = editor.state.selection;
  const now = colorAt(editor);
  ui.openMenu(at, [
    ...COLORS.map((c) => ({ label: c.label, swatch: c.hex, checked: now === c.name, run: () => colorText(editor, from, to, c.name) })),
    { label: 'Default', sep: true, hide: !now, run: () => colorText(editor, from, to, null) },
  ]);
}

function linkItems(href: string, unlink: (() => void) | null): MenuItem[] {
  const mail = href.startsWith('mailto:');
  return [
    { label: mail ? 'Send mail' : 'Open link', keys: shortcuts.keysFor('toggleCheck'), run: () => void openUrl(href) },
    { label: 'Remove link', hide: !unlink, run: () => unlink?.() },
    { label: 'Copy link', run: () => void copyText(mail ? href.slice('mailto:'.length) : href) },
  ];
}

async function linkSelection(editor: Editor) {
  const href = (await ui.prompt('링크 주소', ''))?.trim();
  if (!href) return editor.commands.focus();
  editor.chain().focus().setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run();
}

export function exportMenu(at: At) {
  const keys = (id: string) => shortcuts.keysFor(id);
  ui.openMenu(at, [
    { label: 'Markdown…', keys: keys('exportMd'), run: () => void exportCurrent('md') },
    { label: 'PDF…', keys: keys('exportPdf'), run: () => void exportCurrent('pdf') },
    { label: 'Image…', keys: keys('exportPng'), run: () => void exportCurrent('png') },
  ]);
}

