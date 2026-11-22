import { ui, type LayerId } from './ui.svelte';
import { eventToKeys } from './shortcuts.svelte';

export type KeyHandler = (e: KeyboardEvent) => boolean | void;
export type KeyMap = Record<string, KeyHandler>;
export interface ClaimOptions {
  capture?: boolean;
  whileTop?: LayerId;
  priority?: number;
  keyup?: boolean;
  composing?: boolean;
}

export const PRIORITY = {
  watch: 1000,
  top: 500,
  record: 100,
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
const lists = new Map<string, Claim[]>();
const listOf = (o: ClaimOptions) => `${o.keyup ? 'up' : 'down'}:${o.capture ? 'capture' : 'bubble'}`;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  for (const type of ['keydown', 'keyup'] as const) {
    for (const capture of [true, false]) {
      const list = listOf({ keyup: type === 'keyup', capture });
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
  const path = e.composedPath();
  for (const c of [...list]) {
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

const forApp = new WeakSet<Event>();
export function leaveToApp(e: KeyboardEvent) { forApp.add(e); }

export function handledBy(e: KeyboardEvent): 'app' | 'taken' | null {
  if (forApp.has(e)) return 'app';
  return e.defaultPrevented ? 'taken' : null;
}
