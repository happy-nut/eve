/**
 * The one place the window's keys are listened for. Each part of the app that wanted a key before the note had it, or
 * after nobody else did, had a listener of its own on the window — a diagram, a box being drawn, a formula, Settings,
 * a dialog, the emoji picker, the app's shortcuts — and which of them heard a key first was simply the order they
 * happened to be added in. Keys went to the wrong one (the list's ⌘N made a note while Settings was recording it, a
 * diagram's Esc hid the window), and the editor told the app "this one is yours" by writing a flag on the event.
 *
 * Now a part claims the keys it wants, for as long as it wants them, and this file decides who hears a key:
 *  - `capture`: before the note (or whatever has the keyboard) sees it; otherwise after, once it has bubbled up
 *  - a claim on an element hears only keys typed inside it; `whileTop`, only while that layer is the one on top
 *  - the higher `priority` first; claims of the same priority in the order they were made (as listeners always ran)
 *  - a handler that returns true has taken the key: it is prevented, and no claim after it hears it. One that
 *    returns nothing lets the rest hear it too (it may still have prevented or stopped it, as it always could)
 *  - a key typed while an IME is putting a word together (a Korean syllable, a Japanese reading) is the word's: it
 *    reaches no claim unless the claim says it wants those too (`composing`)
 */
import { ui, type LayerId } from './ui.svelte';
import { eventToKeys } from './shortcuts.svelte';

export type KeyHandler = (e: KeyboardEvent) => boolean | void;
/**
 * What a claim answers to: a key as `e.key` names it ('Escape', 'Enter', 'a'), a combo as the shortcuts write it
 * ('Mod-z', 'Mod-Shift-z'), or '*' for every key. The combo is looked for first, then the key, then '*'.
 */
export type KeyMap = Record<string, KeyHandler>;
export interface ClaimOptions {
  /** heard on the way down, before the note's own keymaps (and a capture claim can stop it reaching them) */
  capture?: boolean;
  /** heard only while this layer is the one on top (ui.layers): a dialog faded out under a menu hears nothing */
  whileTop?: LayerId;
  /** higher first; 0 by default */
  priority?: number;
  /** key releases rather than presses */
  keyup?: boolean;
  /** keys typed into an IME as well: what must see every key (the pointer/keyboard switch, a recording) */
  composing?: boolean;
}

/** how high the app's own claims sit: what is on top of the app before the app itself */
export const PRIORITY = {
  /** looks at every key and takes none (the keyboard/pointer switch, a tooltip going away) */
  watch: 1000,
  /** takes every key while it lasts (a shortcut being recorded) */
  record: 100,
  /** the app's shortcuts: the last to hear a key, after whatever is open over the app has had its say */
  app: -100,
} as const;

interface Claim { owner: HTMLElement | 'global'; map: KeyMap; o: ClaimOptions; seq: number; live: boolean }

/**
 * A key typed while an IME is putting a word together. WebKit sends the Enter that ends a Korean word with
 * isComposing already false (the composition has ended by then), but keyCode still 229 — that Enter answered a
 * dialog, picked from a list, made a new line with the word half typed. Every key handler in the app asks this.
 */
export const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;

let seq = 0;
// one list per phase and kind, kept in the order they are heard
const lists = new Map<string, Claim[]>();
const listOf = (o: ClaimOptions) => `${o.keyup ? 'up' : 'down'}:${o.capture ? 'capture' : 'bubble'}`;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  for (const type of ['keydown', 'keyup'] as const) {
    for (const capture of [true, false]) {
      const list = `${type === 'keyup' ? 'up' : 'down'}:${capture ? 'capture' : 'bubble'}`;
      window.addEventListener(type, (e) => dispatch(e as KeyboardEvent, lists.get(list)), capture);
    }
  }
}

function handlerFor(map: KeyMap, e: KeyboardEvent): KeyHandler | undefined {
  const combo = eventToKeys(e);
  return (combo && map[combo]) || map[e.key] || map['*'];
}

function dispatch(e: KeyboardEvent, list: Claim[] | undefined) {
  if (!list?.length) return;
  const ime = composing(e);
  const top = ui.layers.top?.id;
  const path = e.composedPath(); // through a shadow root too (the emoji picker's search box)
  for (const c of [...list]) { // (a handler may claim or let go as it runs)
    if (!c.live || (ime && !c.o.composing)) continue;
    if (c.o.whileTop && c.o.whileTop !== top) continue;
    if (c.owner !== 'global' && !path.includes(c.owner)) continue;
    const h = handlerFor(c.map, e);
    if (h?.(e) === true) {
      e.preventDefault();
      return;
    }
  }
}

/** Hear `map`'s keys while the result has not been called (an effect's or onMount's cleanup). */
export function claimKeys(owner: HTMLElement | 'global', map: KeyMap, o: ClaimOptions = {}): () => void {
  install();
  const c: Claim = { owner, map, o, seq: seq++, live: true };
  const key = listOf(o);
  const list = lists.get(key) ?? [];
  list.push(c);
  list.sort((a, b) => (b.o.priority ?? 0) - (a.o.priority ?? 0) || a.seq - b.seq);
  lists.set(key, list);
  return () => {
    c.live = false;
    const now = lists.get(key);
    if (now) lists.set(key, now.filter((x) => x !== c));
  };
}

/**
 * A key the editor stopped its own keymaps from acting on because it is bound to one of the app's shortcuts
 * (⌘B rebound to "focus sidebar", Esc to hide the window): prevented, so nothing in the note acts on it, but the
 * app's. It was a flag written on the event; now it is said here and read with `handledBy`.
 */
const forApp = new WeakSet<Event>();
export function leaveToApp(e: KeyboardEvent) { forApp.add(e); }

/**
 * Who has dealt with a key by the time it gets to the window: 'app' — the editor left it to the app's shortcuts;
 * 'taken' — something it reached acted on it (the note, a popup in it, a claim); null — nothing did.
 */
export function handledBy(e: KeyboardEvent): 'app' | 'taken' | null {
  if (forApp.has(e)) return 'app';
  return e.defaultPrevented ? 'taken' : null;
}
