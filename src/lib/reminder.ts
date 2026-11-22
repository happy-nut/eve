import { appearance } from './appearance.svelte';
import { notes, titleOf } from './notes.svelte';
import { dailyId, dayKey, isWritten } from './daily';
import { isMobile, isTauri, widget } from './platform';
import { remindersIn } from './date';

const DAILY_REMINDED_DAY_KEY = 'eve.reminder.last';

export function syncPhoneReminder() {
  const s = appearance.s;
  widget.reminder(s.dailyNotes && s.dailyReminder, s.reminderAt, notes.dailyTemplate);
}

async function look() {
  const s = appearance.s;
  if (!s.dailyNotes || !s.dailyReminder) return;
  if (!notes.loaded) return;
  const now = new Date(), key = dayKey(now);
  const [h, m] = s.reminderAt.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  try { if (localStorage.getItem(DAILY_REMINDED_DAY_KEY) === key) return; localStorage.setItem(DAILY_REMINDED_DAY_KEY, key); } catch { return; }
  const n = notes.all.find((x) => x.id === dailyId(key) && !x.deleted);
  if (n && isWritten(n.body, notes.dailyTemplate, key)) return;
  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted') return;
  sendNotification({ title: "Today's daily note", body: 'Nothing written yet today. A line or two?' });
}

const NOTE_REMINDERS_RANG_THROUGH_KEY = 'eve.remind.through';

export function dueReminders(all: readonly { id: string; body: string; deleted: boolean }[], since: number, now: number) {
  const from = Math.max(since, now - 86_400_000);
  return all.filter((n) => !n.deleted).flatMap((n) => remindersIn(n.body).filter((r) => r.at > from && r.at <= now).map((r) => ({ ...r, id: n.id, title: titleOf(n) })));
}

async function lookLines() {
  if (!notes.loaded) return;
  const now = Date.now();
  let since: number;
  try { since = Number(localStorage.getItem(NOTE_REMINDERS_RANG_THROUGH_KEY)) || now; localStorage.setItem(NOTE_REMINDERS_RANG_THROUGH_KEY, String(now)); } catch { return; }
  const due = dueReminders(notes.all, since, now);
  if (!due.length) return;
  const { sendNotification, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) return;
  for (const r of due) sendNotification({ title: r.title, body: r.line || `${r.day} ${r.time}` });
}

export function startReminder() {
  if (!isTauri || isMobile) return;
  const tick = () => { void look(); void lookLines(); };
  const iv = setInterval(tick, 30_000);
  tick();
  return () => clearInterval(iv);
}

export async function askNotify() {
  if (isMobile) { widget.askNotify(); return; }
  if (!isTauri) return;
  const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) await requestPermission();
}
