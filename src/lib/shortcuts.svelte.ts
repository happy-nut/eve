// All key bindings live here. Keys use ProseMirror syntax: "Mod-Shift-b".
// Users can rebind anything at runtime; overrides persist in localStorage.

export type Scope = 'global' | 'app' | 'editor';
export interface Action {
  id: string;
  label: string;
  scope: Scope;
  keys: string;
}

export const DEFAULTS: Action[] = [
  { id: 'toggleWindow', label: 'Summon / dismiss Eve (system-wide)', scope: 'global', keys: 'Mod-Shift-e' },

  { id: 'newNote', label: 'New note', scope: 'app', keys: 'Mod-n' },
  // Notion's keys (notion.com/help/keyboard-shortcuts) wherever Notion has one for the same thing.
  // ⌘P searches, and so does ⌘K with no words chosen (with words chosen it links them: the editor's `link`)
  { id: 'search', label: 'Search notes', scope: 'app', keys: 'Mod-p' },
  { id: 'find', label: 'Find & replace in this note', scope: 'app', keys: 'Mod-f' },
  { id: 'focusSidebar', label: 'Sidebar: focus / close (↑↓ move, ←→ or Space fold / unfold, ⌥↑↓ reorder, ⌫ delete, Esc back)', scope: 'app', keys: 'Mod-\\' },
  { id: 'back', label: 'Back (previous note)', scope: 'app', keys: 'Mod-[' },
  { id: 'forward', label: 'Forward', scope: 'app', keys: 'Mod-]' },
  // ⌃⇧J / ⌃⇧K as Notion steps through a database's pages: ⌘⇧↑↓ moves the line, as there
  { id: 'nextNote', label: 'Next note', scope: 'app', keys: 'Ctrl-Shift-j' },
  { id: 'prevNote', label: 'Previous note', scope: 'app', keys: 'Ctrl-Shift-k' },
  { id: 'parentPage', label: 'The page this one is under', scope: 'app', keys: 'Mod-Shift-u' },
  { id: 'copyLink', label: 'Copy a link to this note (eve://)', scope: 'app', keys: 'Mod-l' },
  { id: 'theme', label: 'Dark / light theme', scope: 'app', keys: 'Mod-Shift-l' },
  // tabs, as Notion's desktop and a browser have them
  { id: 'newTab', label: 'New note in a new tab', scope: 'app', keys: 'Mod-t' },
  { id: 'closeTab', label: 'Close tab', scope: 'app', keys: 'Mod-w' },
  { id: 'reopenTab', label: 'Reopen closed tab', scope: 'app', keys: 'Mod-Shift-t' },
  { id: 'nextTab', label: 'Next tab', scope: 'app', keys: 'Ctrl-Tab' },
  { id: 'prevTab', label: 'Previous tab', scope: 'app', keys: 'Ctrl-Shift-Tab' },
  { id: 'deleteNote', label: 'Delete current note', scope: 'app', keys: 'Mod-Shift-Backspace' },
  // not Mod-Shift-s: the editor's own strikethrough takes that one before the app ever sees it
  { id: 'exportMd', label: 'Export note as Markdown…', scope: 'app', keys: 'Mod-Shift-m' },
  { id: 'exportPdf', label: 'Export note as PDF…', scope: 'app', keys: 'Mod-Shift-p' },
  { id: 'exportPng', label: 'Export note as an image…', scope: 'app', keys: 'Mod-Alt-p' },
  { id: 'settings', label: 'Settings', scope: 'app', keys: 'Mod-,' },
  // the note's text only: the list, menus and bars keep their size, so nothing around the note moves
  { id: 'textBigger', label: 'Larger text', scope: 'app', keys: 'Mod-=' },
  { id: 'textSmaller', label: 'Smaller text', scope: 'app', keys: 'Mod-Minus' },
  { id: 'textReset', label: 'Default text size', scope: 'app', keys: 'Mod-0' },
  { id: 'hide', label: 'Hide window', scope: 'app', keys: 'Escape' },

  { id: 'bold', label: 'Bold', scope: 'editor', keys: 'Mod-b' },
  { id: 'italic', label: 'Italic', scope: 'editor', keys: 'Mod-i' },
  { id: 'underline', label: 'Underline', scope: 'editor', keys: 'Mod-u' },
  { id: 'strike', label: 'Strikethrough', scope: 'editor', keys: 'Mod-Shift-s' },
  { id: 'highlight', label: 'Highlight (==)', scope: 'editor', keys: 'Mod-Shift-h' },
  { id: 'code', label: 'Inline code', scope: 'editor', keys: 'Mod-e' },
  { id: 'link', label: 'Link (with no words chosen: search notes)', scope: 'editor', keys: 'Mod-k' },
  { id: 'wikiLink', label: 'Link to note ([[)', scope: 'editor', keys: '' },
  { id: 'slash', label: 'Insert block menu (/)', scope: 'editor', keys: 'Mod-/' },
  { id: 'callout', label: 'Callout', scope: 'editor', keys: 'Mod-Shift-c' },
  { id: 'image', label: 'Insert image', scope: 'editor', keys: 'Mod-Shift-i' },
  { id: 'math', label: 'Equation in the line ($)', scope: 'editor', keys: 'Mod-Alt-e' },
  { id: 'paragraph', label: 'Text', scope: 'editor', keys: 'Mod-Alt-0' },
  { id: 'h1', label: 'Heading 1', scope: 'editor', keys: 'Mod-Alt-1' },
  { id: 'h2', label: 'Heading 2', scope: 'editor', keys: 'Mod-Alt-2' },
  { id: 'h3', label: 'Heading 3', scope: 'editor', keys: 'Mod-Alt-3' },
  // Notion has keys for three headings; #### and ##### (or the / menu) make the others, and a key can be given here
  { id: 'h4', label: 'Heading 4', scope: 'editor', keys: '' },
  { id: 'h5', label: 'Heading 5', scope: 'editor', keys: '' },
  { id: 'moveBlockUp', label: 'Move line / selection up', scope: 'editor', keys: 'Mod-Shift-ArrowUp' },
  { id: 'moveBlockDown', label: 'Move line / selection down', scope: 'editor', keys: 'Mod-Shift-ArrowDown' },
  { id: 'taskList', label: 'To-do list', scope: 'editor', keys: 'Mod-Alt-4' },
  { id: 'bulletList', label: 'Bulleted list', scope: 'editor', keys: 'Mod-Alt-5' },
  { id: 'orderedList', label: 'Numbered list', scope: 'editor', keys: 'Mod-Alt-6' },
  { id: 'toggle', label: 'Toggle', scope: 'editor', keys: 'Mod-Alt-7' },
  { id: 'toggleCheck', label: 'Check / uncheck a to-do, or open the link under the caret', scope: 'editor', keys: 'Mod-Enter' },
  { id: 'blockquote', label: 'Quote', scope: 'editor', keys: 'Mod-Shift-.' },
  { id: 'codeBlock', label: 'Code block', scope: 'editor', keys: 'Mod-Alt-8' },
  { id: 'newPage', label: 'New page under this one, linked here', scope: 'editor', keys: 'Mod-Alt-9' },
  { id: 'duplicate', label: 'Duplicate the line / selected lines', scope: 'editor', keys: 'Mod-d' },
  { id: 'toggleAll', label: 'Open / close every toggle', scope: 'editor', keys: 'Mod-Alt-t' },
  { id: 'selectBlock', label: 'Select the line, then the whole note', scope: 'editor', keys: 'Mod-a' },
  { id: 'divider', label: 'Divider', scope: 'editor', keys: 'Mod-Shift-Minus' },
];

const LS_KEY = 'eve.shortcuts';

class Shortcuts {
  overrides = $state<Record<string, string>>(load());
  actions = $derived(DEFAULTS.map((a) => ({ ...a, keys: this.overrides[a.id] ?? a.keys })));

  keysFor(id: string) {
    return this.actions.find((a) => a.id === id)?.keys ?? '';
  }
  /** Bind `keys` to `id`. Returns the conflicting action instead if another action already uses them. */
  set(id: string, keys: string): Action | null {
    const clash = this.actions.find((a) => a.keys === keys && a.id !== id);
    if (clash) return clash;
    this.overrides[id] = keys;
    localStorage.setItem(LS_KEY, JSON.stringify(this.overrides));
    return null;
  }
  reset(id?: string) {
    if (id) delete this.overrides[id];
    else this.overrides = {};
    localStorage.setItem(LS_KEY, JSON.stringify(this.overrides));
  }
  /** Find the action (of the given scopes) bound to a key event. */
  match(e: KeyboardEvent, scopes: Scope[]): Action | undefined {
    const k = eventToKeys(e);
    if (!k) return undefined; // a modifier alone, and an action left without a key, are not a match
    return this.actions.find((a) => a.keys === k && scopes.includes(a.scope));
  }
}

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** the character a punctuation key types without Shift (a US layout's, as the default keys are written) */
const UNSHIFTED: Record<string, string> = {
  Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Backquote: '`', Equal: '=',
};

/** KeyboardEvent -> "Mod-Shift-k". Returns '' for a bare modifier press. */
export function eventToKeys(e: KeyboardEvent): string {
  let key = e.key;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return '';
  if (key === ' ') key = 'Space';
  // the physical key, as for digits: with Shift held it reads "_", and ⌘⇧- was recorded as a key no list writes
  else if (key === '-' || e.code === 'Minus') key = 'Minus';
  else if (key.length === 1) {
    // use the physical key for letters/digits so Alt/Shift combos are stable ("Alt-3" not "Alt-#")
    const code = e.code;
    if (/^Key[A-Z]$/.test(code)) key = code[3].toLowerCase();
    else if (/^Digit\d$/.test(code)) key = code[5];
    // and for punctuation under Shift: ⌘⇧. reads ">", recorded as a key nothing listens for (the default writes ".")
    else if (e.shiftKey && code in UNSHIFTED) key = UNSHIFTED[code];
    else key = key.toLowerCase();
  }
  const mods = [
    (isMac ? e.metaKey : e.ctrlKey) && 'Mod',
    isMac && e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
  ].filter(Boolean);
  return [...mods, key].join('-');
}

/** One symbol per key for chip rendering: "Mod-Shift-k" -> ["⌘", "⇧", "K"] */
export function keyParts(keys: string): string[] {
  const sym: Record<string, string> = {
    Mod: isMac ? '⌘' : 'Ctrl', Ctrl: '⌃', Alt: isMac ? '⌥' : 'Alt', Shift: '⇧',
    Space: '␣', Escape: 'Esc', Backspace: '⌫', Enter: '↩', Minus: '-', Tab: '⇥',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return keys ? keys.split('-').map((p) => sym[p] ?? (p.length === 1 ? p.toUpperCase() : p)) : [];
}

/** Pretty-print for the UI: "Mod-Shift-k" -> "⌘⇧K" */
export function prettyKeys(keys: string): string {
  const sym: Record<string, string> = {
    Mod: isMac ? '⌘' : 'Ctrl+', Ctrl: '⌃', Alt: isMac ? '⌥' : 'Alt+', Shift: '⇧',
    Space: '␣', Escape: 'Esc', Backspace: '⌫', Enter: '↩', Minus: '-',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return keys.split('-').map((p) => sym[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join('');
}

export const shortcuts = new Shortcuts();
