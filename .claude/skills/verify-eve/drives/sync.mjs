import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '../../../..');
const { fakeGitHub } = await import(`${REPO}/src/lib/fakeGitHub.mjs`);
const { Repo } = await import(`${REPO}/src/lib/github.ts`);

export const notes = {
  a: '# Plan\n\nstep one\n\nstep two',
  b: '# Budget\n\ntotal: 100',
};

const gh = fakeGitHub();
const other = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
const enc = new TextEncoder();
const dec = new TextDecoder();
let offline = false;

const otherWrites = async (id, body, order = 9) => {
  await other.pull();
  if (!(await other.push([{ path: `notes/${id}.md`, data: enc.encode(`---\nid: ${id}\nupdated: ${Date.now() + 5000}\ndeleted: false\norder: ${order}\n---\n${body}`) }]))) throw new Error('other device could not push');
};
const onGitHub = async (id) => {
  const files = await new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch).pull();
  const f = files.find((x) => x.path === `notes/${id}.md`);
  return f ? dec.decode(f.data) : null;
};
const openSync = async (t) => {
  await t.click('aside footer button[aria-label="Settings"]');
  await t.page.waitForSelector('[role="dialog"][aria-label="Settings"]');
  await t.click('[role="dialog"] button[role="tab"]:has-text("Sync")');
};
const syncNow = async (t) => {
  await openSync(t);
  await t.click('[role="dialog"] button:has-text("Sync now")');
  await t.page.waitForFunction(() => !document.querySelector('[role="dialog"] .status.syncing'), null, { timeout: 15000 });
};
const closeSettings = async (t) => {
  await t.key('Escape');
  await t.page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
};
const foot = (t) => t.page.evaluate(() => {
  const el = document.querySelector('aside footer .sync');
  return { text: el?.textContent.trim(), dot: el && getComputedStyle(el, '::before').backgroundColor };
});
const rows = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => r.textContent.trim()));
const openRow = async (t, name) => {
  const box = await t.page.locator('aside [data-row]').filter({ hasText: name }).first().boundingBox();
  await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await t.page.waitForFunction((name) => document.querySelector('.tiptap h1')?.textContent.trim() === name, name);
};
const lines = (t) => t.page.evaluate(() => [...document.querySelectorAll('.tiptap > p')].map((p) => p.textContent));
const RED = 'rgb(255, 69, 58)';

export default async (t) => {
  await t.page.route('https://api.github.com/repos/o/r/**', async (route) => {
    const q = route.request();
    if (offline) return route.abort('internetdisconnected');
    const res = await gh.fetch(q.url(), { method: q.method(), headers: { authorization: q.headers().authorization }, body: q.postData() ?? undefined });
    await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });

  await openSync(t);
  await t.ok('sync-status', async () => {
    const b = t.page.locator('[role="dialog"] button:has-text("Sign in with GitHub")');
    return await b.isDisabled() && await t.page.locator('[role="dialog"] :text("Sign-in needs the desktop app")').isVisible()
      && (await foot(t)).text === 'local only';
  }, 'signed out in the web build: Sign in with GitHub is disabled, "Sign-in needs the desktop app", the sidebar says local only');
  await t.shot('signed-out');
  await closeSettings(t);

  await t.page.evaluate(() => localStorage.setItem('eve.sync', JSON.stringify({ user: 'o', repo: 'o/r', token: 'tok' })));
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await syncNow(t);
  await t.ok('sync-status', () => t.page.evaluate(() => {
    const card = document.querySelector('[role="dialog"] .card')?.textContent ?? '';
    return card.includes('@o') && card.includes('private repository o/r') && /Synced at .*\d{1,2}:\d{2}/.test(card) && card.includes('Sync now');
  }).then(async (seen) => {
    const f = await foot(t);
    return seen && f.text === 'synced' && f.dot !== RED && f.dot !== 'rgba(0, 0, 0, 0)';
  }), 'signed in, Settings → Sync shows @o, private repository o/r, Synced at HH:MM and Sync now; the sidebar says synced with a blue dot');
  await t.shot('sync-status');
  await closeSettings(t);

  await otherWrites('phone1', '# From the phone\n\nwritten on the other device');
  await syncNow(t);
  await closeSettings(t);
  await t.ok('sync-pull', async () => (await rows(t)).at(-1)?.endsWith('From the phone'), 'the note written on the other device is the list\'s last row after Sync now');
  await openRow(t, 'From the phone');
  await t.ok('sync-pull', async () => (await lines(t)).includes('written on the other device'), 'opened, it holds the other device\'s line');
  await t.shot('sync-pull');

  await otherWrites('a', '# Plan\n\nstep one\n\nstep two, done on the phone', 0);
  await openRow(t, 'Plan');
  await t.click('.tiptap p:has-text("step one")');
  await t.key('End');
  await t.type(', done here');
  await syncNow(t);
  await closeSettings(t);
  await t.ok('sync-merge', async () => {
    const here = await lines(t), there = await onGitHub('a');
    return here.includes('step one, done here') && here.includes('step two, done on the phone')
      && there?.includes('step one, done here') && there?.includes('step two, done on the phone');
  }, 'a line changed here and another on the other device: the note and the repository\'s notes/a.md both have both');
  await t.shot('sync-merge');

  await otherWrites('b', '# Budget\n\ntotal: 250', 1);
  await openRow(t, 'Budget');
  await t.click('.tiptap p:has-text("total: 100")');
  await t.key('End');
  await t.key('Backspace');
  await t.key('Backspace');
  await t.type('20');
  await syncNow(t);
  await closeSettings(t);
  await t.ok('sync-conflict', async () => {
    const toast = await t.page.locator('.toast .msg').textContent().catch(() => '');
    return (await lines(t)).includes('total: 250') && (await rows(t)).some((r) => r.endsWith('Budget (conflict copy)'))
      && toast.startsWith('“Budget” was changed on two devices at once');
  }, 'the same line changed on both: Budget reads total: 250, a row Budget (conflict copy) is listed, and a toast says so');
  await t.shot('sync-conflict');
  await openRow(t, 'Budget (conflict copy)');
  await t.ok('sync-conflict', async () => (await lines(t)).includes('total: 120'), 'the conflict copy holds this device\'s total: 120');

  offline = true;
  await syncNow(t);
  await t.ok('sync-error', () => t.page.evaluate(() => {
    const card = document.querySelector('[role="dialog"] .card')?.textContent ?? '';
    return card.includes('Sync failed') && card.includes('Could not reach GitHub. Eve tries again every minute; your notes are kept here meanwhile.');
  }).then(async (seen) => seen && (await foot(t)).text === 'sync error' && (await foot(t)).dot === RED),
  'GitHub unreachable: the card says Sync failed and why, the sidebar sync error with a red dot');
  await t.shot('sync-error');
  await closeSettings(t);
  offline = false;
  await syncNow(t);
  await t.ok('sync-error', async () => (await foot(t)).text === 'synced', 'once GitHub answers again the sidebar says synced');
};
