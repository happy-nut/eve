import { appearance } from './appearance.svelte';
import { notes } from './notes.svelte';
import { dailyId, dayKey, isWritten } from './daily';
import { isMobile, isTauri, widget } from './platform';
import { remindersIn } from './date';
import { titleOf } from './notes.svelte';

/**
 * The daily note reminder. A phone hands the time to Reminder.kt, whose alarm fires with the app closed
 * and reads the note file itself. The Mac keeps running in the background, so it simply looks every
 * half-minute: past the time, once a day, and only while today's note is still unwritten.
 */
const LAST = 'eve.reminder.last'; // the day the Mac last looked after the time

/** Phone: the alarm follows the settings (call from an $effect). */
export function syncPhoneReminder() {
  const s = appearance.s;
  widget.reminder(s.dailyNotes && s.dailyReminder, s.reminderAt, notes.dailyTemplate);
}

async function look() {
  const s = appearance.s;
  if (!s.dailyNotes || !s.dailyReminder) return;
  if (!notes.loaded) return; // the app just started and today's note is not read yet: the next look sees it
  const now = new Date(), key = dayKey(now);
  const [h, m] = s.reminderAt.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  try { if (localStorage.getItem(LAST) === key) return; localStorage.setItem(LAST, key); } catch { return; }
  const n = notes.all.find((x) => x.id === dailyId(key) && !x.deleted);
  if (n && isWritten(n.body, notes.dailyTemplate, key)) return;
  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted') return;
  sendNotification({ title: "Today's daily note", body: 'Nothing written yet today. A line or two?' });
}

const LINES = 'eve.remind.through'; // the moment the Mac last rang the reminders in notes up to

/**
 * The reminders written in notes (`@remind`, `@2026-10-26 09:00 ⏰`) whose time has come since the last look: each
 * rings once, on every device that has the note (Notion's ring everywhere too). A Mac asleep for a while rings what
 * it missed in the last day when it wakes, not older ones; the first look ever rings nothing old.
 */
export function dueReminders(all: readonly { id: string; body: string; deleted: boolean }[], since: number, now: number) {
  const from = Math.max(since, now - 86_400_000);
  return all.filter((n) => !n.deleted).flatMap((n) => remindersIn(n.body).filter((r) => r.at > from && r.at <= now).map((r) => ({ ...r, id: n.id, title: titleOf(n) })));
}

async function lookLines() {
  if (!notes.loaded) return;
  const now = Date.now();
  let since: number;
  try { since = Number(localStorage.getItem(LINES)) || now; localStorage.setItem(LINES, String(now)); } catch { return; }
  const due = dueReminders(notes.all, since, now);
  if (!due.length) return;
  const { sendNotification, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) return; // asked when the reminder was set
  for (const r of due) sendNotification({ title: r.title, body: r.line || `${r.day} ${r.time}` });
}

/** Mac: start looking. */
export function startReminder() {
  if (!isTauri || isMobile) return;
  const tick = () => { void look(); void lookLines(); };
  const iv = setInterval(tick, 30_000);
  tick();
  return () => clearInterval(iv);
}

/** Turning the reminder on (or setting one in a note) asks for the notification permission there and then, not at 9 pm. */
export async function askNotify() {
  if (isMobile) { widget.askNotify(); return; }
  if (!isTauri) return;
  const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) await requestPermission();
}
