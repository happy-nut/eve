export const DEFAULT_TEMPLATE = '# {{date}} {{weekday}}\n\n';
export const DAILY_TEMPLATE_ID = 'daily-template';
export const CALENDAR_NOTE_ID = 'daily-calendar';
export const CALENDAR_NAME = 'Daily notes';
export const isCalendarOwn = (id: string) => id === DAILY_TEMPLATE_ID || id === CALENDAR_NOTE_ID;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dailyId = (key: string) => `daily-${key}`;
export const isDailyId = (id: string) => /^daily-\d{4}-\d{2}-\d{2}$/.test(id);
export const keyOfDaily = (id: string) => id.slice('daily-'.length);

const dateOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

export function fillTemplate(template: string, key: string, locale?: string): string {
  const weekday = dateOf(key).toLocaleDateString(locale, { weekday: 'long' });
  return template.replaceAll('{{date}}', key).replaceAll('{{weekday}}', weekday);
}

export function dailyBody(template: string, key: string, locale?: string): string {
  const body = fillTemplate(template, key, locale).trimEnd();
  const last = body.split('\n').at(-1) ?? '';
  return /^#{1,6}\s/.test(last) ? `${body}\n\n\u00a0` : `${body}\n`;
}

export function isWritten(body: string, template: string, key: string, locale?: string): boolean {
  const norm = (l: string) => l.replace(/\u00a0/g, ' ').trim();
  const given = new Set(fillTemplate(template, key, locale).split('\n').map(norm));
  return body.split('\n').map(norm).some((l) => l && !given.has(l));
}

export function monthGrid(year: number, month: number): { key: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dayKey(d), inMonth: d.getMonth() === month };
  });
}
