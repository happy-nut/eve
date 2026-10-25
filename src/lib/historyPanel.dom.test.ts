// The version history panel against an in-memory GitHub: the versions sync saved, each shown, one put back
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import './testEditor';
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })) as any; // jsdom has no Web Animations
import HistoryPanel from '../HistoryPanel.svelte';
import { notes, serialize } from './notes.svelte';
import { ui } from './ui.svelte';
import { sync } from './sync.svelte';
import { Repo, syncRound } from './github';
import { fakeGitHub } from './fakeGitHub.mjs';

const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); await tick(); } };
let app: ReturnType<typeof mount> | null = null;
afterEach(() => { ui.closeHistory(); if (app) unmount(app); app = null; document.body.innerHTML = ''; });

test('the versions sync saved are listed newest first, each shown as the note was; one restored is the note again', async () => {
  const fake = fakeGitHub();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch as typeof fetch;
  try {
    const n = notes.create('# Diary\n\nthird\n');
    notes.touched(n.id);
    // three saves of the note, as three syncs would have made them
    const repo = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} });
    for (const words of ['first', 'second', 'third']) {
      const data = new TextEncoder().encode(serialize({ ...n, body: `# Diary\n\n${words}\n` }));
      await syncRound(repo, () => [{ path: `notes/${n.id}.md`, data }], () => {});
    }
    Object.assign(sync.settings, { repo: 'o/r', token: 'tok' });
    ui.openHistory(n.id);
    const target = document.createElement('div');
    document.body.append(target);
    app = mount(HistoryPanel, { target });
    await settle();

    const rows = [...target.querySelectorAll('ul[aria-label="Versions"] button')] as HTMLButtonElement[];
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('latest');
    expect(target.querySelector('.view')!.textContent).toContain('third');
    const restore = () => [...target.querySelectorAll('footer button')].find((b) => b.textContent === 'Restore this version') as HTMLButtonElement;
    expect(restore().disabled).toBe(true); // the latest is the note as it is

    rows[2].click();
    await settle();
    expect(target.querySelector('.view')!.textContent).toContain('first');
    restore().click();
    await settle();
    expect(notes.all.find((x) => x.id === n.id)!.body).toBe('# Diary\n\nfirst\n');
    expect(ui.historyOf).toBe(null);
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(sync.settings, { repo: '', token: '' });
  }
});

test('with sync off it says where versions come from, instead of an empty list', async () => {
  const n = notes.create('# Loose\n');
  ui.openHistory(n.id);
  const target = document.createElement('div');
  document.body.append(target);
  app = mount(HistoryPanel, { target });
  await settle();
  expect(target.textContent).toContain('Turn sync on in Settings → Sync');
});
