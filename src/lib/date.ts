import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type MarkdownIt from 'markdown-it';

/**
 * `@2026-09-24` — an inline atom holding one day. What is stored is the day itself; what is shown is
 * how that day reads now, so a note written yesterday says "yesterday" today and the date the day
 * after. Markdown keeps the bare `@2026-09-24`, so the note is still a plain file anywhere else.
 *
 * Typing `@` opens the picker (today / yesterday / tomorrow, or a date typed out in full).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A day as `YYYY-MM-DD`, in the writer's own time zone. Never `toISOString()` — that is UTC, where a
 * note written on a Seoul evening is already dated tomorrow.
 */
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** That day, shifted. */
export const dayFrom = (n: number, now: Date = new Date()): string =>
  isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));

/** Whole days from today to `iso` (negative = past). Null when `iso` is not a day. */
export function daysFrom(iso: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const then = new Date(+m[1], +m[2] - 1, +m[3]);
  if (then.getMonth() !== +m[2] - 1) return null; // 2026-02-31 rolled into March: not a day
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // rounded, because a day across a daylight-saving boundary is 23 or 25 hours long
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/**
 * How a stored day reads right now: the nearby ones by name, in the reader's own language, and the
 * rest as the date. Intl already knows every language's word for yesterday, so there is no table here.
 */
export function dateLabel(iso: string, now: Date = new Date(), locale?: string): string {
  const diff = daysFrom(iso, now);
  if (diff === null) return iso;
  if (Math.abs(diff) <= 1) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day');
  return iso.replace(/-/g, '.');
}

/** A day typed out in full — `2026-09-24`, `2026.9.24`, `2026/09/24`. Null when it is not one. */
export function typedDay(text: string): string | null {
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  return daysFrom(iso, new Date(+m[1], +m[2] - 1, +m[3])) === null ? null : iso;
}

/** The days the `@` picker offers, narrowed by what has been typed so far. */
export function dayChoices(query: string, now: Date = new Date(), locale?: string) {
  const q = query.trim().toLowerCase();
  const typed = typedDay(q);
  const days = [
    { n: 0, alias: 'today' },
    { n: -1, alias: 'yesterday' },
    { n: 1, alias: 'tomorrow' },
  ]
    .map(({ n, alias }) => ({ iso: dayFrom(n, now), label: dateLabel(dayFrom(n, now), now, locale), alias }))
    // the name in the reader's language, the English one whatever the language (`@tod` has to work on
    // a Korean machine, where nothing else on screen is English), or the date being typed out
    .filter((d) => !q || d.label.toLowerCase().includes(q) || d.alias.startsWith(q) || d.iso.includes(q));
  const out = days.map(({ iso, label }) => ({ iso, label }));
  if (typed && !out.some((d) => d.iso === typed)) out.unshift({ iso: typed, label: dateLabel(typed, now, locale) });
  return out;
}

/** That day, moved by whole days. */
export const shiftDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

/** That day, moved by whole months — 31 January back a month is 28 February, not 3 March. */
export function shiftMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m + n, 0).getDate(); // day 0 of the month after the target = its last day
  return isoDay(new Date(y, m - 1 + n, Math.min(d, last)));
}

/**
 * The month `iso` falls in, as six weeks of seven days starting on a Sunday. Always six, so the
 * calendar is the same height whichever month it shows and the popup never jumps under the cursor.
 * The days either side of the month are real days too — clicking one picks it.
 */
export function monthGrid(iso: string): string[][] {
  const [y, m] = iso.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) =>
      isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))),
  );
}

/** Whether two days are in the same month — the ones that are not are drawn faint. */
export const sameMonth = (a: string, b: string): boolean => a.slice(0, 7) === b.slice(0, 7);

/** "September 2026" / "2026년 9월", in the reader's language. */
export const monthName = (iso: string, locale?: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(y, m - 1, 1));
};

/** S M T W T F S / 일 월 화…, in the reader's language, starting on the Sunday the grid starts on. */
export function weekdayNames(locale?: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const sunday = new Date(2026, 0, 1);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i)));
}

/**
 * `@2026-09-24` in a file becomes a chip when the note is read back. Exported on its own so the one
 * part with a sharp edge — telling a date from the `@` in an address — can be tested against a real
 * markdown-it without an editor.
 */
export function dateMarkdown(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'datemention', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40) return false; // '@'
    // an address is not a date: only an `@` that starts a word is one
    if (state.pos > 0 && /[^\s([{]/.test(state.src[state.pos - 1])) return false;
    const m = /^@(\d{4}-\d{2}-\d{2})(?![\d-])/.exec(state.src.slice(state.pos));
    if (!m || daysFrom(m[1]) === null) return false;
    if (!silent) state.push('datemention', '', 0).content = m[1];
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.datemention = (tokens, i) => {
    const d = tokens[i].content;
    return `<span data-date="${d}">${dateLabel(d)}</span>`;
  };
}

export interface DateMentionOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export const DateMention = Node.create<DateMentionOptions>({
  name: 'dateMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { suggestion: { char: '@', pluginKey: new PluginKey('dateMention') } };
  },

  addAttributes() {
    return { date: { default: '', parseHTML: (el) => el.getAttribute('data-date') } };
  },

  parseHTML() {
    return [{ tag: 'span[data-date]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-date': node.attrs.date, class: 'datechip' }),
      dateLabel(node.attrs.date),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const date: string = node.attrs.date;
      const dom = document.createElement('span');
      dom.className = 'datechip';
      dom.dataset.date = date;
      dom.textContent = dateLabel(date);
      dom.title = date; // the day itself, for when the chip says "yesterday" and you want the date
      // ponytail: the wording is worked out when the chip is drawn. An app left open across midnight
      // keeps yesterday's reading until the note is opened again; re-read the day on a timer if that
      // ever matters.
      return { dom };
    };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`@${node.attrs.date}`);
        },
        parse: { setup: dateMarkdown },
      },
    };
  },
});
