import { test, expect, vi } from 'vitest';

// a Takeout folder on "disk": Keep's .json, the .html beside each, a picture saved as .jpg that the JSON calls .jpeg
const disk: Record<string, string> = {
  '/t/Keep/Groceries.json': JSON.stringify({ title: 'Groceries', textContent: 'milk', isPinned: false, isTrashed: false, isArchived: false, userEditedTimestampUsec: 3e15, labels: [{ name: 'Home' }] }),
  '/t/Keep/Groceries.html': '<html></html>',
  '/t/Keep/Pinned.json': JSON.stringify({ title: 'Pinned', textContent: 'top', isPinned: true, isTrashed: false, isArchived: false, userEditedTimestampUsec: 1e15, attachments: [{ filePath: 'pic.jpeg', mimetype: 'image/jpeg' }] }),
  '/t/Keep/pic.jpg': '',
  '/t/Keep/Old.json': JSON.stringify({ title: 'Old', textContent: 'x', isPinned: false, isTrashed: false, isArchived: true, userEditedTimestampUsec: 2e15 }),
  '/t/Keep/Gone.json': JSON.stringify({ title: 'Gone', textContent: 'x', isTrashed: true }),
  '/t/Keep/Labels.txt': 'Home\n',
  '/t/Keep/readme.md': '# Mine\n\nnot from Keep',
};
vi.mock('./platform', async (original) => ({
  ...(await original<typeof import('./platform')>()),
  files: { read: async (p: string) => { if (!(p in disk)) throw new Error('no such file'); return disk[p]; }, write: async () => {} },
  importAsset: async (p: string) => { if (!(p in disk)) throw new Error('no such file'); return `assets/${p.split('/').pop()}`; },
}));
const { importPaths } = await import('./transfer');
const { notes, titleOf } = await import('./notes.svelte');

test('a Takeout Keep folder: its notes in Keep order and labels, the rest of the folder as before', async () => {
  const first = await importPaths(Object.keys(disk), '/t');
  const made = notes.all.filter((n) => !n.deleted).map((n) => `${n.group}|${titleOf(n)}`);
  // pinned first, then newest; the trashed one and Keep's own .html / Labels.txt / picture are no notes of their own
  expect(made).toEqual(['Keep|Pinned', 'Keep/Home|Groceries', 'Keep/Archive|Old', 'Keep|Mine']);
  expect(titleOf(first!)).toBe('Pinned');
  expect(notes.all.find((n) => titleOf(n) === 'Pinned')!.body).toContain('![](assets/pic.jpg)');
  expect(notes.all.find((n) => titleOf(n) === 'Groceries')!.updatedAt).toBe(3e12);
});
