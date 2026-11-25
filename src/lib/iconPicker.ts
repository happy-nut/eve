import { EMOJI_QUERY, searchEmoji, type EmojiEntry } from './emoji';
import { CUSTOM_ICONS, customUrl } from './icons';
import { save, saved } from './stored';

export const COLUMNS = 9;

export interface Cell { pick: string; face: string; url?: string; code: string; name: string }

export interface Tab { name: string; face: string; group: number | 'eve' }
export const TABS: readonly Tab[] = [
  { group: 0, name: 'Smileys and emoticons', face: '😀' },
  { group: 1, name: 'People and body', face: '👋' },
  { group: 3, name: 'Animals and nature', face: '🐱' },
  { group: 4, name: 'Food and drink', face: '🍎' },
  { group: 5, name: 'Travel and places', face: '🏠️' },
  { group: 6, name: 'Activities', face: '⚽' },
  { group: 7, name: 'Objects', face: '📝' },
  { group: 8, name: 'Symbols', face: '⛔️' },
  { group: 9, name: 'Flags', face: '🏁' },
  { group: 'eve', name: 'Eve', face: '✨' },
];

export const TONES = ['Default', 'Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark'] as const;
export const TONE_FACES = ['✌️', '✌🏻', '✌🏼', '✌🏽', '✌🏾', '✌🏿'] as const;

const EVE_CELLS: Cell[] = CUSTOM_ICONS.map((c) => ({ pick: `:${c.name}:`, face: '', url: customUrl(c), code: c.name, name: c.label }));

const drawn = (e: { version?: number }, newest: number) => (e.version ?? 0) <= newest;
const SKIN_PARTS = 2;
const shown = (e: EmojiEntry, newest: number) => e.group !== SKIN_PARTS && drawn(e, newest);

function cellOf(e: EmojiEntry, tone: number, newest: number): Cell {
  const skin = tone ? e.skins?.find((s) => s.tone === tone && drawn(s, newest)) : undefined;
  const face = skin?.emoji ?? e.emoji;
  return { pick: face, face, code: e.shortcodes?.[0] ?? e.annotation.replace(/\s+/g, '_'), name: e.annotation };
}

export function tabCells(data: readonly EmojiEntry[] | null, tone: number, newest: number): Cell[][] {
  const by = new Map<number, Cell[]>();
  const sorted = [...(data ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const e of sorted) {
    if (!shown(e, newest) || e.group === undefined) continue;
    let list = by.get(e.group);
    if (!list) by.set(e.group, (list = []));
    list.push(cellOf(e, tone, newest));
  }
  return TABS.map((t) => (t.group === 'eve' ? EVE_CELLS : by.get(t.group) ?? []));
}

const words = (e: EmojiEntry) => [...e.annotation.toLowerCase().split(/[\s:,-]+/), ...(e.tags ?? []), ...(e.shortcodes ?? []).flatMap((c) => [c, ...c.split('_')])];

export function findCells(data: readonly EmojiEntry[] | null, query: string, tone: number, newest: number): Cell[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const own = EVE_CELLS.filter((c) => c.code.startsWith(q) || c.name.toLowerCase().startsWith(q));
  if (!data) return own;
  const ask = q.split(/\s+/);
  const found = ask.length === 1 && EMOJI_QUERY.test(q)
    ? searchEmoji(data, q, Infinity, newest).filter((e) => e.group !== SKIN_PARTS)
    : data.filter((e) => shown(e, newest) && ask.every((w) => words(e).some((t) => t.startsWith(w)))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [...own, ...found.map((e) => cellOf(e, tone, newest))];
}

export type Spot = 'search' | number;
export interface Place { tab: number; spot: Spot }
export type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function arrow(key: Arrow, at: Place, len: number, tabLens?: readonly number[]): Place {
  const { tab, spot } = at;
  if (spot === 'search') return key === 'ArrowDown' && len ? { tab, spot: 0 } : at;
  const col = spot % COLUMNS, row = Math.floor(spot / COLUMNS), lastRow = Math.floor((len - 1) / COLUMNS);
  switch (key) {
    case 'ArrowRight': return { tab, spot: Math.min(spot + 1, len - 1) };
    case 'ArrowLeft': return { tab, spot: spot > 0 ? spot - 1 : 'search' };
    case 'ArrowDown':
      if (row < lastRow) return { tab, spot: Math.min(spot + COLUMNS, len - 1) };
      for (let t = tab + 1; tabLens && t < tabLens.length; t++) if (tabLens[t]) return { tab: t, spot: Math.min(col, tabLens[t] - 1) };
      return at;
    case 'ArrowUp':
      if (row > 0) return { tab, spot: spot - COLUMNS };
      for (let t = tab - 1; tabLens && t >= 0; t--) {
        const n = tabLens[t];
        if (n) return { tab: t, spot: Math.min(Math.floor((n - 1) / COLUMNS) * COLUMNS + col, n - 1) };
      }
      return { tab, spot: 'search' };
  }
}

const RECENT = 'eve.icons.recent', TONE = 'eve.icons.tone';
const POPULAR = ['😊', '😒', '❤️', '👍', '😍', '😂', '😭', '☺️', '😔', '😩', '😏', '💕', '🙌', '😘'];

export const savedTone = (): number => { const t = saved(TONE, 0); return Number.isInteger(t) && t >= 0 && t < TONES.length ? t : 0; };
export const saveTone = (t: number) => save(TONE, t);
function recentPicks(): string[] {
  const list: unknown = saved(RECENT, []);
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
}
export function remember(pick: string) {
  save(RECENT, [pick, ...recentPicks().filter((p) => p !== pick)].slice(0, COLUMNS));
}

export function recentCells(data: readonly EmojiEntry[] | null): Cell[] {
  const picks = [...new Set([...recentPicks(), ...POPULAR])].slice(0, COLUMNS);
  const named = new Map<string, EmojiEntry>();
  for (const e of data ?? []) {
    named.set(e.emoji, e);
    for (const s of e.skins ?? []) named.set(s.emoji, e);
  }
  return picks.map((pick) => {
    const own = EVE_CELLS.find((c) => c.pick === pick);
    if (own) return own;
    const e = named.get(pick);
    return { pick, face: pick, code: e?.shortcodes?.[0] ?? '', name: e?.annotation ?? pick };
  });
}
