/**
 * Daily notes: one note per day, kept out of the sidebar's tree and opened from a calendar. A day's
 * note has a fixed id (daily-2026-09-27), so two devices that start the same day end up with one note,
 * merged by sync like any other. Pure: runs in Node for tests.
 */
export const DEFAULT_TEMPLATE = '# {{date}} {{weekday}}\n\n';
/** The daily template is a note of its own (edited from the calendar, synced like any note), out of the list. */
export const DAILY_TEMPLATE_ID = 'daily-template';
/** The calendar's own name and icon, as a note (synced, out of the list): renamed from the calendar's title. */
export const CALENDAR_NOTE_ID = 'daily-calendar';
export const CALENDAR_NAME = 'Daily notes';
/** notes the calendar keeps for itself: never in the list, the widget, or [[link]] targets */
export const isCalendarOwn = (id: string) => id === DAILY_TEMPLATE_ID || id === CALENDAR_NOTE_ID;

const pad = (n: number) => String(n).padStart(2, '0');
/** 2026-09-27, in local time */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dailyId = (key: string) => `daily-${key}`;
export const isDailyId = (id: string) => /^daily-\d{4}-\d{2}-\d{2}$/.test(id);
export const keyOfDaily = (id: string) => id.slice('daily-'.length);

const dateOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

/** The template with {{date}} (2026-09-27) and {{weekday}} (in the phone's or Mac's language) filled in. */
export function fillTemplate(template: string, key: string, locale?: string): string {
  const weekday = dateOf(key).toLocaleDateString(locale, { weekday: 'long' });
  return template.replaceAll('{{date}}', key).replaceAll('{{weekday}}', weekday);
}

/**
 * A new day's body: the template, filled in. A template that ends on a heading gets an empty line under
 * it (the editor's blank line, a no-break space), so the caret starts there and not at the end of the title.
 */
export function dailyBody(template: string, key: string, locale?: string): string {
  const body = fillTemplate(template, key, locale).trimEnd();
  const last = body.split('\n').at(-1) ?? '';
  return /^#{1,6}\s/.test(last) ? `${body}\n\n\u00a0` : `${body}\n`;
}

/**
 * Has anything been written in a day's note? Yes as soon as it has a line the template did not put
 * there (blank lines and the editor's no-break-space lines never count). Reminder.kt asks the same.
 */
export function isWritten(body: string, template: string, key: string, locale?: string): boolean {
  const norm = (l: string) => l.replace(/\u00a0/g, ' ').trim();
  const given = new Set(fillTemplate(template, key, locale).split('\n').map(norm));
  return body.split('\n').map(norm).some((l) => l && !given.has(l));
}

/** The 6 × 7 days a month view shows, Sunday first: the month's own days and its neighbours' around them. */
export function monthGrid(year: number, month: number): { key: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dayKey(d), inMonth: d.getMonth() === month };
  });
}
