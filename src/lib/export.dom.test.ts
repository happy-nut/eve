import { test, expect, vi, beforeEach } from 'vitest';
import type { Note } from './notes.svelte';

const host = vi.hoisted(() => ({ mobile: false, savePath: '/out/Plan.md' as string | null, done: [] as string[] }));
vi.mock('./platform', async (original) => ({
  ...(await original<typeof import('./platform')>()),
  get isMobile() { return host.mobile; },
  pickSavePath: async (name: string, ext: string) => { host.done.push(`ask ${name}.${ext}`); return host.savePath; },
  files: { read: async () => '', write: async (path: string, text: string) => void host.done.push(`write ${path} ${JSON.stringify(text)}`) },
  savePdf: async (path: string) => void host.done.push(`pdf ${path}`),
  savePng: async (path: string) => void host.done.push(`png ${path}`),
  widget: { export: async (as: string, title: string, body: string) => (host.done.push(`share ${as} ${title} ${JSON.stringify(body)}`), true) },
}));
const { exportNote } = await import('./transfer');

const plan = { id: 'a', body: 'Plan\n\nFirst line.' } as Note;
beforeEach(() => { host.mobile = false; host.savePath = '/out/Plan.md'; host.done = []; });

test('export-note: Markdown is the note itself, written where the save panel said, named after its title', async () => {
  expect(await exportNote(plan, 'md')).toBe('/out/Plan.md');
  expect(host.done).toEqual(['ask Plan.md', 'write /out/Plan.md "Plan\\n\\nFirst line."']);
});

test('export-note: PDF and image print the window to the path picked', async () => {
  host.savePath = '/out/Plan.pdf';
  await exportNote(plan, 'pdf');
  host.savePath = '/out/Plan.png';
  await exportNote(plan, 'png');
  expect(host.done).toEqual(['ask Plan.pdf', 'pdf /out/Plan.pdf', 'ask Plan.png', 'png /out/Plan.png']);
});

test('export-note: a save panel cancelled writes nothing and is no failure', async () => {
  host.savePath = null;
  expect(await exportNote(plan, 'md')).toBeNull();
  expect(host.done).toEqual(['ask Plan.md']);
});

test('export-note: a phone has no save panel; the note goes to the share sheet', async () => {
  host.mobile = true;
  expect(await exportNote(plan, 'md')).toBe('Plan');
  expect(host.done).toEqual(['share md Plan "Plan\\n\\nFirst line."']);
});
