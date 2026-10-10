// The Mac's daily reminder: it looks at today's note, so it must not look before the notes are there.
import { test, expect, vi } from 'vitest';

vi.mock('./platform', async (orig) => ({ ...(await orig<typeof import('./platform')>()), isTauri: true, isMobile: false }));
const sent: { title: string; body: string }[] = [];
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => true,
  requestPermission: async () => 'granted',
  sendNotification: (n: { title: string; body: string }) => sent.push(n),
}));

import { notes, serialize } from './notes.svelte';
import { appearance } from './appearance.svelte';
import { dailyBody, dailyId, dayKey, DEFAULT_TEMPLATE } from './daily';
import { startReminder } from './reminder';

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('a written daily note is not reported unwritten when the app starts after the reminder time', async () => {
  vi.useFakeTimers({ now: new Date(2026, 9, 10, 22, 0), toFake: ['Date', 'setInterval', 'clearInterval'] });
  appearance.set({ dailyNotes: true, dailyReminder: true, reminderAt: '21:00' });
  const key = dayKey(new Date()), id = dailyId(key);
  const body = dailyBody(DEFAULT_TEMPLATE, key).trimEnd() + '\n\nWent for a run.\n';
  localStorage.setItem(`eve.notes.${id}`, serialize({ id, body, updatedAt: Date.now(), deleted: false, group: '', order: 0 }));

  // as App starts them: the notes still loading while the reminder takes its first look
  const stop = startReminder()!;
  await notes.load();
  await settle();
  vi.advanceTimersByTime(30_000);
  await settle();
  expect(sent).toEqual([]);

  // and an unwritten day still gets its nudge
  localStorage.removeItem('eve.reminder.last');
  notes.all.find((n) => n.id === id)!.body = dailyBody(DEFAULT_TEMPLATE, key);
  vi.advanceTimersByTime(30_000);
  await settle();
  expect(sent.length).toBe(1);
  stop();
  vi.useRealTimers();
});
