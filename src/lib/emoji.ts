/**
 * `:smile` in a note: the emoji that fit the word best, Slack-style. The data is the emoji picker's own
 * (emojibase, English), fetched the first time it is needed. Pure apart from `loadEmoji`; tested in Node.
 */
export interface EmojiEntry {
  emoji: string; shortcodes?: string[]; annotation: string; tags?: string[]; order?: number; version?: number;
  /** set by searchEmoji: the shortcode the search hit (`smile` for `:smi`), to show under the row */
  code?: string;
}

/** What may follow the colon: a letter first (or Slack's +1 / -1), then a shortcode's own characters.
 *  Anything else (a space, `12:30`, `//`) is not a search. */
export const EMOJI_QUERY = /^([a-z]|[+-]1)[a-z0-9_+-]*$/i;

/** Newer emoji than this draw as an empty box on a phone or Mac that predates them. */
const NEWEST = 14;

/**
 * The best `limit` emoji for `query`, best first: a shortcode that is the word, then a name or tag that is
 * the word, then a shortcode starting with it, a word of the name, a tag. Ties: the shorter shortcode,
 * then the order the emoji keyboard has them in.
 */
export function searchEmoji(data: EmojiEntry[], query: string, limit = 5): EmojiEntry[] {
  const q = query.toLowerCase();
  if (!EMOJI_QUERY.test(q)) return [];
  const ranked: { e: EmojiEntry; tier: number; len: number }[] = [];
  for (const e of data) {
    if ((e.version ?? 0) > NEWEST) continue;
    const codes = e.shortcodes ?? [], tags = e.tags ?? [], words = e.annotation.toLowerCase().split(/[\s:,-]+/);
    const name = e.annotation.toLowerCase();
    const tier =
      codes.includes(q) ? 0
      : name === q || tags.includes(q) ? 1
      : codes.some((c) => c.startsWith(q)) ? 2
      : words.some((w) => w.startsWith(q)) ? 3
      : tags.some((t) => t.startsWith(q)) ? 4
      : -1;
    if (tier < 0) continue;
    const len = Math.min(...codes.filter((c) => c.startsWith(q)).map((c) => c.length), 99);
    ranked.push({ e, tier, len });
  }
  ranked.sort((a, b) => a.tier - b.tier || a.len - b.len || (a.e.order ?? 0) - (b.e.order ?? 0));
  return ranked.slice(0, limit).map(({ e }) => ({ ...e, code: e.shortcodes?.find((c) => c.startsWith(q)) ?? e.shortcodes?.[0] ?? e.annotation }));
}

let loading: Promise<EmojiEntry[]> | null = null;
/** The emoji list, fetched once (about 430 KB, so not with the app's start). */
export function loadEmoji(): Promise<EmojiEntry[]> {
  loading ??= import('emoji-picker-element-data/en/emojibase/data.json?url')
    .then((m) => fetch(m.default))
    .then((r) => r.json() as Promise<EmojiEntry[]>)
    .catch((e) => { loading = null; throw e; });
  return loading;
}
