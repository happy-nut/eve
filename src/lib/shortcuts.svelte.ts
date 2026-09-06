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
  { id: 'toggleWindow', label: 'Summon / dismiss Eve (system-wide)', scope: 'global', keys: 'Mod-Shift-Space' },

  { id: 'newNote', label: 'New note', scope: 'app', keys: 'Mod-n' },
  { id: 'newGroup', label: 'New group', scope: 'app', keys: 'Mod-Shift-n' },
  { id: 'search', label: 'Search notes', scope: 'app', keys: 'Mod-k' },
  { id: 'toggleSidebar', label: 'Toggle sidebar', scope: 'app', keys: 'Mod-\\' },
  { id: 'focusSidebar', label: 'Focus sidebar (↑↓ move, ⌥↑↓ reorder, Space fold, ⌫ delete, Esc back)', scope: 'app', keys: 'Mod-Shift-e' },
  { id: 'back', label: 'Back (previous note)', scope: 'app', keys: 'Mod-[' },
  { id: 'forward', label: 'Forward', scope: 'app', keys: 'Mod-]' },
  { id: 'nextNote', label: 'Next note', scope: 'app', keys: 'Mod-Shift-ArrowDown' },
  { id: 'prevNote', label: 'Previous note', scope: 'app', keys: 'Mod-Shift-ArrowUp' },
  { id: 'deleteNote', label: 'Delete current note', scope: 'app', keys: 'Mod-Shift-Backspace' },
  { id: 'settings', label: 'Settings', scope: 'app', keys: 'Mod-,' },
  { id: 'hide', label: 'Hide window', scope: 'app', keys: 'Escape' },

  { id: 'bold', label: 'Bold', scope: 'editor', keys: 'Mod-b' },
  { id: 'italic', label: 'Italic', scope: 'editor', keys: 'Mod-i' },
  { id: 'underline', label: 'Underline', scope: 'editor', keys: 'Mod-u' },
  { id: 'strike', label: 'Strikethrough', scope: 'editor', keys: 'Mod-Shift-x' },
  { id: 'code', label: 'Inline code', scope: 'editor', keys: 'Mod-e' },
  { id: 'link', label: 'Link', scope: 'editor', keys: 'Mod-Shift-k' },
  { id: 'wikiLink', label: 'Link to note ([[)', scope: 'editor', keys: 'Mod-Shift-l' },
  { id: 'slash', label: 'Insert block menu (/)', scope: 'editor', keys: 'Mod-/' },
  { id: 'callout', label: 'Callout', scope: 'editor', keys: 'Mod-Shift-c' },
  { id: 'image', label: 'Insert image', scope: 'editor', keys: 'Mod-Shift-i' },
  { id: 'paragraph', label: 'Text', scope: 'editor', keys: 'Mod-Alt-0' },
  { id: 'h1', label: 'Heading 1', scope: 'editor', keys: 'Mod-Alt-1' },
  { id: 'h2', label: 'Heading 2', scope: 'editor', keys: 'Mod-Alt-2' },
  { id: 'h3', label: 'Heading 3', scope: 'editor', keys: 'Mod-Alt-3' },
  { id: 'h4', label: 'Heading 4', scope: 'editor', keys: 'Mod-Alt-4' },
  { id: 'h5', label: 'Heading 5', scope: 'editor', keys: 'Mod-Alt-5' },
  { id: 'bulletList', label: 'Bulleted list', scope: 'editor', keys: 'Mod-Shift-8' },
  { id: 'orderedList', label: 'Numbered list', scope: 'editor', keys: 'Mod-Shift-7' },
  { id: 'taskList', label: 'To-do list', scope: 'editor', keys: 'Mod-Shift-9' },
  { id: 'blockquote', label: 'Quote', scope: 'editor', keys: 'Mod-Shift-.' },
  { id: 'codeBlock', label: 'Code block', scope: 'editor', keys: 'Mod-Alt-c' },
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

/** KeyboardEvent -> "Mod-Shift-k". Returns '' for a bare modifier press. */
export function eventToKeys(e: KeyboardEvent): string {
  let key = e.key;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return '';
  if (key === ' ') key = 'Space';
  else if (key === '-') key = 'Minus';
  else if (key.length === 1) {
    // use the physical key for letters/digits so Alt/Shift combos are stable ("Alt-3" not "Alt-#")
    const code = e.code;
    if (/^Key[A-Z]$/.test(code)) key = code[3].toLowerCase();
    else if (/^Digit\d$/.test(code)) key = code[5];
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
