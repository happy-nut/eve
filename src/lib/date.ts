import { Node, mergeAttributes, type Editor } from '@tiptap/core';
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

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/**
 * A day said in words, as Notion's @ takes it: `wednesday` (the coming one), `next wednesday` (next week's),
 * `next week` (next Monday), `in 3 days`, `in 2 weeks`, and the Korean `수요일`, `다음 주 수요일`, `다음 주`,
 * `3일 후`. A weekday may be its first three letters (`wed`). Null for anything else.
 */
export function spokenDay(text: string, now: Date = new Date()): string | null {
  const q = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const weekday = (w: string) => {
    const en = w.length >= 3 ? WEEKDAYS.findIndex((d) => d.startsWith(w)) : -1;
    const ko = /^([일월화수목금토])(요일)?$/.exec(w);
    return en >= 0 ? en : ko ? KO_WEEKDAYS.indexOf(ko[1]) : -1;
  };
  const today = now.getDay();
  const ahead = (n: number) => dayFrom(n, now);
  let m = /^in (\d{1,3}) (day|days|week|weeks)$/.exec(q) ?? /^(\d{1,3}) ?(일|주) ?(후|뒤)$/.exec(q);
  if (m) return ahead(+m[1] * (/^(week|weeks|주)$/.test(m[2]) ? 7 : 1));
  if (q === 'next week' || q === '다음 주' || q === '다음주') return ahead(((8 - today) % 7) || 7);
  m = /^(?:next |다음 ?주 )(.+)$/.exec(q);
  if (m) {
    const d = weekday(m[1]);
    // the day of next week: next Monday, and that many days on from it
    if (d >= 0) return ahead((((8 - today) % 7) || 7) + ((d + 6) % 7));
  }
  const d = weekday(q);
  if (d >= 0) return ahead(((d - today + 7) % 7) || 7);
  return null;
}

/**
 * The days the `@` picker offers, narrowed by what has been typed so far. `exact`: what was typed names that day
 * in full (`today`, `오늘`, `2026-09-24`), not just the start of it.
 */
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
    // a Korean machine, where nothing else on screen is English), or the date being typed out. From the start of a
    // word only: "cc @a" found the "a" inside "today" and the calendar came up over a name
    .filter((d) => !q || d.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || d.alias.startsWith(q) || d.iso.startsWith(q));
  const said = spokenDay(q, now);
  if (said && !days.some((d) => d.iso === said)) days.unshift({ iso: said, label: dateLabel(said, now, locale), alias: q });
  const out = days.map(({ iso, label, alias }) => ({ iso, label, exact: q === alias || q === label.toLowerCase() || q === iso }));
  if (typed && !out.some((d) => d.iso === typed)) out.unshift({ iso: typed, label: dateLabel(typed, now, locale), exact: true });
  else if (typed) for (const d of out) if (d.iso === typed) d.exact = true;
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
 * `@2026-09-24 09:00 ⏰`: a day with a reminder (Notion's `@remind`), written so any other app still reads it as the
 * day, the time and an alarm clock. A time is kept only with the clock: "@2026-09-24 09:00" alone is a day and words.
 */
export const REMIND = '⏰';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (t: string): boolean => TIME.test(t);

/** A chip's words: the day as it reads now, and for a reminder the clock and its time */
export function chipLabel(a: { readonly [attr: string]: any }, now: Date = new Date(), locale?: string): string { // a node's attrs
  const day = dateLabel(a.date, now, locale);
  return a.remind && a.time ? `${REMIND} ${day} ${a.time}` : day;
}

/**
 * The time a new reminder for `iso` rings: 09:00, as Notion's does, or on today the next whole hour (still today:
 * 23:59 late in the evening).
 */
export function remindTime(iso: string, now: Date = new Date()): string {
  if (daysFrom(iso, now) !== 0) return '09:00';
  const h = now.getHours() + 1;
  return h > 23 ? '23:59' : `${pad(h)}:00`;
}

/** `@remind…` typed: the days it offers as reminders (with nothing after it, today's is the one ↩ takes) */
export function remindChoices(query: string, now: Date = new Date(), locale?: string) {
  const m = /^(?:remind|알림)/i.exec(query.trim());
  if (!m) return null;
  const rest = query.trim().slice(m[0].length);
  const days = dayChoices(rest, now, locale);
  return days.map((d, i) => ({ ...d, exact: d.exact || (!rest && i === 0), remind: true, time: remindTime(d.iso, now) }));
}

/** One reminder in a note's markdown: when it rings (ms), and the line it is on as words */
export interface LineReminder { at: number; day: string; time: string; line: string }

const IN_LINE = /(?<![\w@])@(\d{4}-\d{2}-\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d) ⏰/g;

/**
 * The reminders a note's markdown holds, in order. A done to-do's ring no more; one in code is code, not a reminder.
 * The line comes as words, its marks (list, quote, heading) and the reminder itself left out. Reminder.kt reads
 * the files the same way on the phone.
 */
export function remindersIn(body: string): LineReminder[] {
  const out: LineReminder[] = [];
  // the fence a line is in ('' a plain one): code is code, but a board's cards are words, and a card's reminder rings
  // (its line is the card's JSON string, read as its words)
  let fence: string | null = null;
  for (const line0 of body.split('\n')) {
    const open = /^\s*(?:```|~~~)(\w*)/.exec(line0);
    if (open) { fence = fence === null ? open[1] : null; continue; }
    if ((fence !== null && fence !== 'kanban') || /^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(line0)) continue;
    const raw = fence === 'kanban' ? line0.replace(/^\s*"[^"]*":\s*"/, '').replace(/",?\s*$/, '').replace(/\\n/g, ' ') : line0;
    for (const m of raw.matchAll(IN_LINE)) {
      if (daysFrom(m[1]) === null) continue;
      const [y, mo, d] = m[1].split('-').map(Number), [h, mi] = m[2].split(':').map(Number);
      const line = raw.replace(IN_LINE, '').replace(/^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/, '').replace(/\s+/g, ' ').trim();
      out.push({ at: new Date(y, mo - 1, d, h, mi).getTime(), day: m[1], time: m[2], line });
    }
  }
  return out;
}

/**
 * `@2026-09-24` in a file becomes a chip when the note is read back. Exported on its own so the one
 * part with a sharp edge — telling a date from the `@` in an address — can be tested against a real
 * markdown-it without an editor.
 */
export function dateMarkdown(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'datemention', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40) return false; // '@'
    // an address is not a date: not an `@` after what an address's name is made of. Anything else may stand before
    // one, as a chip is written back: bold around it (`**@…**`), a word in Korean ("마감@…"); they read back as text
    if (state.pos > 0 && /[A-Za-z0-9._%+-]/.test(state.src[state.pos - 1])) return false;
    const m = /^@(\d{4}-\d{2}-\d{2})(?: ((?:[01]\d|2[0-3]):[0-5]\d) ⏰)?(?![\d-])/.exec(state.src.slice(state.pos));
    if (!m || daysFrom(m[1]) === null) return false;
    if (!silent) {
      const t = state.push('datemention', '', 0);
      t.content = m[1];
      t.meta = { time: m[2] ?? '' };
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.datemention = (tokens, i) => {
    const d = tokens[i].content, time: string = tokens[i].meta?.time ?? '';
    return time
      ? `<span data-date="${d}" data-time="${time}" data-remind="">${chipLabel({ date: d, time, remind: true })}</span>`
      : `<span data-date="${d}">${dateLabel(d)}</span>`;
  };
}

export interface DateMentionOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
  /** a chip clicked: its menu (change the reminder's time, turn it on or off), the editor's to show */
  onChip: (editor: Editor, pos: number, dom: HTMLElement) => void;
}

export const DateMention = Node.create<DateMentionOptions>({
  name: 'dateMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { suggestion: { char: '@', pluginKey: new PluginKey('dateMention') }, onChip: () => {} };
  },

  addAttributes() {
    return {
      date: { default: '', parseHTML: (el) => el.getAttribute('data-date') },
      // a reminder's time (HH:MM), and whether it rings; a time without the clock is not kept (it is not written)
      time: { default: '', parseHTML: (el) => (isTime(el.getAttribute('data-time') ?? '') ? el.getAttribute('data-time') : ''), renderHTML: (a) => (a.time ? { 'data-time': a.time } : {}) },
      remind: { default: false, parseHTML: (el) => el.hasAttribute('data-remind') && isTime(el.getAttribute('data-time') ?? ''), renderHTML: (a) => (a.remind ? { 'data-remind': '' } : {}) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-date]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-date': node.attrs.date, class: 'datechip' }),
      chipLabel(node.attrs),
    ];
  },

  addNodeView() {
    const onChip = this.options.onChip;
    return ({ node, editor, getPos }) => {
      const date: string = node.attrs.date;
      const dom = document.createElement('span');
      dom.className = node.attrs.remind ? 'datechip remind' : 'datechip';
      dom.dataset.date = date;
      dom.textContent = chipLabel(node.attrs);
      dom.title = node.attrs.remind ? `${date} ${node.attrs.time}` : date; // the day itself, for when the chip says "yesterday"
      // a click opens its menu (a reminder's time, or one set); the chip is chosen by the click as before
      dom.addEventListener('click', () => { const pos = typeof getPos === 'function' ? getPos() : undefined; if (typeof pos === 'number' && editor.isEditable) onChip(editor, pos, dom); });
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
          state.write(node.attrs.remind && isTime(node.attrs.time) ? `@${node.attrs.date} ${node.attrs.time} ${REMIND}` : `@${node.attrs.date}`);
        },
        parse: { setup: dateMarkdown },
      },
    };
  },
});

/**
 * When a note was last written, as a list shows it: "now", "5 min. ago", "3 hr. ago" today; "yesterday"; a
 * month and day this year; the full date before. '' when it never was (0).
 */
export function editedLabel(ms: number, now: Date = new Date(), locale?: string): string {
  if (!ms) return '';
  const at = new Date(ms), mins = Math.floor((now.getTime() - ms) / 60000);
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (mins < 1) return rel.format(0, 'second');
  if (isoDay(at) === isoDay(now)) return mins < 60 ? rel.format(-mins, 'minute') : rel.format(-Math.floor(mins / 60), 'hour');
  if (daysFrom(isoDay(at), now) === -1) return rel.format(-1, 'day');
  return at.toLocaleDateString(locale, at.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}
