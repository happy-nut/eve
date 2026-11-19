export const notes = {
  a: '# Plan\n\nFirst line.\n',
  b: `---\nid: b\nupdated: ${Date.now() - 3_600_000}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n`,
  c: '# Reading list\n\nA book.\n',
  e: '# Old idea\n\nGone soon.\n',
};

const file = (t, id) => t.page.evaluate((k) => localStorage.getItem(`eve.notes.${k}`) ?? '', id);
const deleted = async (t, id) => (await file(t, id)).includes('\ndeleted: true\n');
const listed = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row][data-note]')].map((r) => r.textContent.trim()));
const isListed = async (t, name) => (await listed(t)).some((r) => r.endsWith(name));
const front = (t) => t.page.evaluate(() => document.querySelector('.tiptap')?.textContent ?? '');
const question = (t) => t.page.evaluate(() => document.querySelector('.box[role="dialog"]')?.innerText ?? '');
const toast = (t) => t.page.evaluate(() => document.querySelector('.toast')?.innerText ?? '');
const trash = '[aria-label="Trash"][role="dialog"]';
const trashRows = (t) => t.page.evaluate((s) => [...document.querySelectorAll(`${s} li`)].map((li) => ({
  name: li.querySelector('.name')?.textContent.trim(),
  restore: !!li.querySelector('button[aria-label="Restore"]'),
  erase: !!li.querySelector('button[aria-label="Delete for good"]'),
})), trash);
const inTrashSearch = (t) => t.page.evaluate((s) => document.activeElement === document.querySelector(`${s} input[placeholder="Search the trash"]`), trash);

const hoverX = async (t, id) => {
  await t.page.hover(`aside [data-note="${id}"]`, { position: { x: 20, y: 10 } });
  await t.page.hover(`aside [data-note="${id}"]`, { position: { x: 60, y: 14 } });
  await t.wait(400);
  await t.click(`aside [data-note="${id}"] ~ .tools button[aria-label="Delete note"]`);
};

const b64 = (s) => Buffer.from(s).toString('base64');
const DAY = 86_400_000;
const LATEST = '---\nid: a\nupdated: 1763337600000\ndeleted: false\norder: 0\n---\n# Plan\n\nFirst line.\n';
const OLDER = '---\nid: a\nupdated: 1763251200000\ndeleted: false\norder: 0\n---\n# Plan\n\nAn older line.\n';
const fakeGitHub = (t) => t.page.route('https://api.github.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('/commits?sha=main&path=notes%2Fa.md')) return route.fulfill({ json: [
    { sha: 'c2', commit: { committer: { date: new Date(Date.now() - 60_000).toISOString() } } },
    { sha: 'c1', commit: { committer: { date: new Date(new Date().setHours(0, 0, 0, 0) - DAY / 2).toISOString() } } },
  ] });
  if (url.includes('/contents/notes/a.md?ref=c2')) return route.fulfill({ json: { content: b64(LATEST) } });
  if (url.includes('/contents/notes/a.md?ref=c1')) return route.fulfill({ json: { content: b64(OLDER) } });
  return route.fulfill({ status: 503, body: 'stand-in' });
});
const openHistory = async (t) => {
  await t.click('button[aria-label="More"]');
  await t.click('.menu button[role="menuitem"]:has-text("Version history")');
};

export default async (t) => {
  await hoverX(t, 'c');
  await t.ok('trash-delete', async () => (await question(t)).includes('Delete “Reading list”?'), 'the row’s × asks Delete “Reading list”?');
  await t.shot('delete-question');
  await t.key('Enter');
  await t.ok('trash-delete', async () => !(await isListed(t, 'Reading list')) && await deleted(t, 'c')
    && (await toast(t)).includes('Deleted “Reading list”') && (await toast(t)).includes('Undo'),
  'Enter takes Reading list off the list, its file says deleted: true, and a toast offers Undo');
  await t.shot('deleted-toast');

  await t.click('aside [data-note="e"]');
  await t.ok('trash-delete', async () => (await front(t)).startsWith('Old idea'), 'Old idea is open');
  await t.key(`${t.mod}+Shift+Backspace`);
  await t.ok('trash-delete', async () => (await question(t)).includes('Delete “Old idea”?'), '⌘⇧⌫ asks Delete “Old idea”?');
  await t.click('button.primary:has-text("Delete")');
  await t.ok('trash-delete', async () => !(await isListed(t, 'Old idea')) && await deleted(t, 'e') && (await front(t)).startsWith('Groceries'),
    'Delete moves Old idea to the Trash and Groceries opens');

  await t.click('.toast button:has-text("Undo")');
  await t.ok('trash-undo', async () => await isListed(t, 'Old idea') && !(await deleted(t, 'e')) && (await front(t)).startsWith('Old idea'),
    'Undo puts Old idea back in the list, open, its file deleted: false');
  await t.shot('undone');

  await t.page.click('aside [data-note="e"]', { button: 'right' });
  await t.click('.menu button[role="menuitem"]:has-text("Delete note")');
  await t.ok('trash-delete', async () => (await question(t)).includes('Delete “Old idea”?'), 'the row menu’s Delete note asks too');
  await t.key('Enter');
  await t.ok('trash-delete', async () => !(await isListed(t, 'Old idea')) && await deleted(t, 'e'), 'Old idea goes to the Trash');

  await t.click('aside button[aria-label="Trash"]');
  await t.ok('trash-open', async () => {
    const r = await trashRows(t);
    return r.map((x) => x.name).join(',') === 'Old idea,Reading list' && r.every((x) => x.restore && x.erase) && await inTrashSearch(t);
  }, 'the Trash lists Old idea then Reading list, newest first, each with Restore and Delete for good, the keyboard in its search box');
  await t.shot('trash');

  await t.type('read');
  await t.ok('trash-search', async () => (await trashRows(t)).map((x) => x.name).join(',') === 'Reading list', 'typing read leaves Reading list alone');
  await t.shot('trash-search');
  await t.key(`${t.mod}+a`);
  await t.key('Backspace');
  await t.ok('trash-search', async () => (await trashRows(t)).length === 2, 'an empty box lists both again');

  await t.click(`${trash} li:has-text("Reading list") button[aria-label="Restore"]`);
  await t.ok('trash-restore', async () => await t.page.evaluate((s) => !document.querySelector(s), trash)
    && await isListed(t, 'Reading list') && (await front(t)).startsWith('Reading list') && !(await deleted(t, 'c')),
  '↶ Restore closes the Trash, Reading list is back in the list and open, its file deleted: false');
  await t.shot('restored');

  await t.click('aside button[aria-label="Trash"]');
  await t.click(`${trash} li:has-text("Old idea") button[aria-label="Delete for good"]`);
  await t.ok('trash-erase', async () => (await question(t)).includes('Delete “Old idea” for good? It can\'t be brought back.'),
    'Delete for good asks whether to delete Old idea for good');
  await t.shot('erase-question');
  await t.key('Enter');
  await t.ok('trash-erase', async () => (await t.page.evaluate((s) => document.querySelector(s)?.innerText ?? '', trash)).includes('Nothing in the trash.')
    && await inTrashSearch(t), 'the Trash is empty of Old idea and the keyboard is back in its search box');
  await t.shot('erased');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('trash-erase', async () => {
    const f = await file(t, 'e');
    return /^---\nid: e\n[\s\S]*deleted: true\n[\s\S]*---\n$/.test(f) && !f.includes('Old idea') && !(await isListed(t, 'Old idea'));
  }, 'after a reload Old idea is still gone and its file is front matter alone, deleted: true');

  await t.click('aside [data-note="c"]');
  await t.key(`${t.mod}+Shift+Backspace`);
  await t.key('Enter');
  await t.click('aside [data-note="b"]');
  await t.key(`${t.mod}+Shift+Backspace`);
  await t.key('Enter');
  await t.ok('trash-empty', async () => await deleted(t, 'b') && await deleted(t, 'c'), 'Groceries and Reading list are in the Trash');
  await t.click('aside button[aria-label="Trash"]');
  await t.click('button:has-text("Empty trash")');
  await t.ok('trash-empty', async () => (await question(t)).includes('Delete all 2 notes in the trash for good?'), 'Empty trash asks to delete all 2 notes for good');
  await t.shot('empty-question');
  await t.click('button.primary:has-text("Delete")');
  await t.ok('trash-empty', async () => {
    const [b, c] = [await file(t, 'b'), await file(t, 'c')];
    return b.endsWith('---\n') && !b.includes('milk') && c.endsWith('---\n') && !c.includes('A book')
      && (await t.page.evaluate((s) => document.querySelector(s)?.innerText ?? '', trash)).includes('Nothing in the trash.')
      && (await listed(t)).join(',').endsWith('Plan');
  }, 'both files are tombstones, the Trash is empty and Plan is left in the list');
  await t.shot('emptied');
  await t.key('Escape');

  await t.click('aside [data-note="a"]');
  await openHistory(t);
  await t.ok('history-off', () => t.page.evaluate(() => {
    const p = document.querySelector('[aria-label="Version history"][role="dialog"]')?.innerText ?? '';
    return p.includes('Version history · Plan') && p.includes('Versions come from sync') && p.includes('Settings → Sync');
  }), 'with sync off, Version history · Plan says versions come from sync and to turn it on in Settings → Sync');
  await t.shot('history-off');
  await t.key('Escape');

  await fakeGitHub(t);
  await t.page.evaluate(() => localStorage.setItem('eve.sync', JSON.stringify({ user: 'tester', repo: 'tester/eve-notes', token: 'test-token-not-real', host: '' })));
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await openHistory(t);
  const panel = '[aria-label="Version history"][role="dialog"]';
  const drawn = () => t.page.evaluate((s) => document.querySelector(`${s} .show .view:not(.hidden)`)?.textContent ?? '', panel);
  const restoreOff = () => t.page.evaluate((s) => [...document.querySelectorAll(`${s} button.primary`)].find((b) => b.textContent.includes('Restore this version'))?.disabled, panel);
  await t.ok('history-list', async () => {
    const rows = await t.page.evaluate((s) => [...document.querySelectorAll(`${s} ul[aria-label="Versions"] li`)].map((li) => li.innerText), panel);
    return rows.length === 2 && rows[0].includes('latest') && rows[1].includes('어제') && (await drawn()).includes('First line.') && await restoreOff();
  }, 'with sync on the panel lists two versions, the first marked latest and drawn, Restore off for it');
  await t.shot('history-latest');
  await t.click(`${panel} ul[aria-label="Versions"] li:nth-child(2) button`);
  await t.ok('history-list', async () => (await drawn()).includes('An older line.') && !(await restoreOff()), 'choosing the older version draws its text');
  await t.shot('history-older');

  await t.click(`${panel} button.primary:has-text("Restore this version")`);
  await t.ok('history-restore', async () => await t.page.evaluate((s) => !document.querySelector(s), panel)
    && (await front(t)).includes('An older line.') && (await toast(t)).includes('Restored the version from') && (await toast(t)).includes('Undo')
    && (await file(t, 'a')).includes('An older line.'),
  'Restore this version closes the panel, the note reads the older text, a toast offers Undo, and the saved note holds it');
  await t.shot('history-restored');
};
