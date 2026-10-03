import { test, expect, vi } from 'vitest';

// the Mac app, with GitHub's answer counted rather than fetched
vi.mock('./platform', async (original) => ({ ...(await original<typeof import('./platform')>()), isTauri: true, isMobile: false }));
const asked = vi.fn(async () => ({ version: '9.9.9', url: 'u', sha256: 's' }));
vi.mock('./update', () => ({ findUpdate: asked }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.7.0' }));
vi.mock('./sync.svelte', () => ({ sync: { settings: { host: '', token: '' } } }));

const { updates, FRESH } = await import('./updates.svelte');

test('not "up to date" before it has asked; asked again once the answer is ten minutes old', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  expect(updates.checked).toBe(0); // Settings says "Not checked yet", not "✓ Up to date"
  await updates.check(true);
  expect(asked).toHaveBeenCalledTimes(1);
  expect(updates.available?.version).toBe('9.9.9');
  await updates.check(false, FRESH); // summoned a minute later: the answer is fresh enough
  expect(asked).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + FRESH + 1000); // summoned after a while: asked again
  await updates.check(false, FRESH);
  expect(asked).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
