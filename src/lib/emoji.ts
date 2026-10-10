/**
 * `:smile` in a note: the emoji that fit the word best, Slack-style. The data is the emoji picker's own
 * (emojibase, English), fetched the first time it is needed. Pure apart from `loadEmoji`; tested in Node.
 */
export interface EmojiEntry {
  emoji: string; shortcodes?: string[]; annotation: string; tags?: string[]; order?: number; version?: number;
  /** set by searchEmoji: the shortcode the search hit (`smile` for `:smi`), to show under the row */
  code?: string;
}

/** What may follow the colon: a letter first (or Slack's +1 / -1), then a shortcode's own characters, two of them
 *  at least, as Slack asks. Anything else (a space, `12:30`, `//`) is not a search. One letter is a face, not a
 *  search: "great :D" then Enter put an emoji in place of the :D and ate the new line. */
export const EMOJI_QUERY = /^([a-z][a-z0-9_+-]|[+-]1)[a-z0-9_+-]*$/i;

/**
 * The best `limit` emoji for `query`, best first: a shortcode that is the word, then a name or tag that is
 * the word, then a shortcode starting with it, a word of the name, a tag. Ties: the shorter shortcode,
 * then the order the emoji keyboard has them in. `newest`: the newest emoji version this system can draw.
 */
export function searchEmoji(data: EmojiEntry[], query: string, limit = 5, newest = Infinity): EmojiEntry[] {
  const q = query.toLowerCase();
  if (!EMOJI_QUERY.test(q)) return [];
  const ranked: { e: EmojiEntry; tier: number; len: number }[] = [];
  for (const e of data) {
    if ((e.version ?? 0) > newest) continue; // newer than this system draws: an empty box
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

/**
 * The newest emoji version this system draws, found by drawing one emoji of each version: a version counts
 * when its emoji comes out in colour (a missing one is a grey box) and as one glyph (an unknown joined one
 * falls apart into two). Asked once per launch, a dozen tiny draws: not stored, because the webview's user
 * agent keeps an old macOS version and an OS update would not show in it. Infinity where nothing can be
 * drawn to ask (no canvas: tests, a server).
 */
const PROBES: [number, string][] = [
  [17, '🫪'], [16, '🫩'], [15.1, '🙂‍↔️'], [15, '🫨'], [14, '🫠'], [13.1, '❤️‍🔥'], [13, '🥲'], [12.1, '🧑‍🦰'], [12, '🥱'], [11, '🥰'], [5, '🤩'], [4, '🤣'],
];
let newest: number | undefined;
export function newestEmoji(): number {
  if (newest !== undefined) return newest;
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;
  if (!ctx) return (newest = Infinity);
  ctx.canvas.width = ctx.canvas.height = 32;
  ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textBaseline = 'top';
  const one = ctx.measureText('😀').width;
  const draws = (e: string) => {
    if (ctx.measureText(e).width > one * 1.5) return false; // fell apart into pieces
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillText(e, 0, 0);
    const px = ctx.getImageData(0, 0, 32, 32).data;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] && (Math.abs(px[i] - px[i + 1]) > 20 || Math.abs(px[i + 1] - px[i + 2]) > 20)) return true;
    return false; // no colour: the box drawn for a missing glyph
  };
  return (newest = PROBES.find(([, e]) => draws(e))?.[0] ?? 1);
}
