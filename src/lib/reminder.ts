import { appearance } from './appearance.svelte';
import { notes } from './notes.svelte';
import { dailyId, dayKey, isWritten } from './daily';
import { isMobile, isTauri, widget } from './platform';

/**
 * The daily note reminder. A phone hands the time to Reminder.kt, whose alarm fires with the app closed
 * and reads the note file itself. The Mac keeps running in the background, so it simply looks every
 * half-minute: past the time, once a day, and only while today's note is still unwritten.
 */
const LAST = 'eve.reminder.last'; // the day the Mac last looked after the time

/** Phone: the alarm follows the settings (call from an $effect). */
export function syncPhoneReminder() {
  const s = appearance.s;
  widget.reminder(s.dailyNotes && s.dailyReminder, s.reminderAt, s.dailyTemplate);
}

async function look() {
  const s = appearance.s;
  if (!s.dailyNotes || !s.dailyReminder) return;
  const now = new Date(), key = dayKey(now);
  const [h, m] = s.reminderAt.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  try { if (localStorage.getItem(LAST) === key) return; localStorage.setItem(LAST, key); } catch { return; }
  const n = notes.all.find((x) => x.id === dailyId(key) && !x.deleted);
  if (n && isWritten(n.body, s.dailyTemplate, key)) return;
  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted') return;
  sendNotification({ title: "Today's daily note", body: 'Nothing written yet today. A line or two?' });
}

/** Mac: start looking. */
export function startReminder() {
  if (!isTauri || isMobile) return;
  const iv = setInterval(() => void look(), 30_000);
  void look();
  return () => clearInterval(iv);
}

/** Mac: turning the reminder on asks for the notification permission there and then, not at 9 pm. */
export async function askNotify() {
  if (!isTauri || isMobile) return;
  const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) await requestPermission();
}
