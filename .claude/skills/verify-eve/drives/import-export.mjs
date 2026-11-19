const dropOn = (t, sel, files, folders) => t.page.evaluate(async ({ sel, files, folders }) => {
  const dt = new DataTransfer();
  for (const [name, text] of files) dt.items.add(new File([text], name, { type: 'text/markdown' }));
  const restore = DataTransferItem.prototype.webkitGetAsEntry;
  if (folders) {
    const fileEntry = (name, text) => ({ isFile: true, isDirectory: false, name, file: (ok) => ok(new File([text], name, { type: 'text/markdown' })) });
    const dirEntry = (name, tree) => ({ isFile: false, isDirectory: true, name, createReader: () => { let done = false; return { readEntries: (ok) => { ok(done ? [] : Object.entries(tree).map(([n, v]) => typeof v === 'string' ? fileEntry(n, v) : dirEntry(n, v))); done = true; } }; } });
    const roots = Object.entries(folders).map(([n, v]) => dirEntry(n, v));
    dt.items.add(new File([''], Object.keys(folders)[0], { type: '' }));
    let i = 0;
    DataTransferItem.prototype.webkitGetAsEntry = function () { return roots[i++] ?? null; };
  }
  const el = document.querySelector(sel), r = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 40, clientY: r.bottom - 20 };
  el.dispatchEvent(new DragEvent('dragenter', at));
  el.dispatchEvent(new DragEvent('dragover', at));
  await new Promise((r) => setTimeout(r, 50));
  const hint = document.body.innerText.match(/Import [^\n]*/)?.[0];
  el.dispatchEvent(new DragEvent('drop', at));
  await new Promise((r) => setTimeout(r, 800));
  DataTransferItem.prototype.webkitGetAsEntry = restore;
  return hint;
}, { sel, files, folders });

const rows = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => ({
  text: r.textContent.trim(), left: r.getBoundingClientRect().left,
})));
const row = async (t, name) => (await rows(t)).find((r) => r.text.endsWith(name));
const openRow = (t, name) => t.page.evaluate((name) => {
  const r = [...document.querySelectorAll('aside [data-row]')].find((el) => el.textContent.trim().endsWith(name));
  r.scrollIntoView({ block: 'center' });
}, name).then(async () => {
  const box = await t.page.locator('aside [data-row]').filter({ hasText: name }).last().boundingBox();
  await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await t.wait(400);
});

const IDEAS = '# Ideas\n\nSee [[Reading list]] and ==this==.\n\n> [!warning] Careful\n> it is a callout\n';

export default async (t) => {
  const hint = await dropOn(t, 'aside .tree', [['Ideas.md', IDEAS], ['Loose thought.md', 'no heading here\n']]);
  await t.ok('import-files', async () => {
    const all = (await rows(t)).map((r) => r.text);
    return hint === 'Import into the list' && all.at(-2)?.includes('Ideas') && all.at(-1)?.includes('Loose thought');
  }, 'two .md files dropped on the list, which says "Import into the list" while over it, become its last two rows');
  await openRow(t, 'Ideas');
  await t.ok('import-files', () => t.page.evaluate(() => {
    const ed = document.querySelector('.tiptap');
    return ed.querySelector('.wikilink')?.textContent.includes('Reading list') && ed.querySelector('mark')?.textContent === 'this'
      && [...ed.querySelectorAll('.callout')].some((c) => c.textContent.includes('Careful') && c.textContent.includes('it is a callout'));
  }).then(async (seen) => {
    const md = await t.markdown();
    return seen && md.includes('[[Reading list]]') && md.includes('==this==') && md.includes('> [!warning] Careful');
  }), 'opened, Ideas shows a [[link]], a highlight and a warning callout, saved as Obsidian wrote them');
  await t.shot('import-files');

  await dropOn(t, 'aside .tree', [], {
    Vault: {
      'Trip.md': '# Trip\n\nSee [the plan](Trip/Plan.md).\n',
      Trip: { 'Plan.md': '# Plan for the trip\n\nday one\n', 'Packing 0123456789abcdef0123456789abcdef.md': 'socks\n' },
    },
  });
  await t.ok('import-folder', async () => {
    const [vault, trip, packing, plan2] = await Promise.all(['Vault', 'Trip', 'Packing', 'Plan 2'].map((n) => row(t, n)));
    return vault && trip && packing && plan2 && trip.left > vault.left + 10 && packing.left > trip.left + 10 && plan2.left === packing.left
      && !(await rows(t)).some((r) => r.text.includes('0123456789abcdef'));
  }, 'a dropped folder is the page Vault, Trip under it, Packing (its Notion id left off) and Plan 2 under Trip');
  await openRow(t, 'Trip');
  await t.ok('import-folder', async () => (await t.markdown()).includes('See [[Plan 2|the plan]].')
    && await t.page.evaluate(() => document.querySelector('.tiptap .wikilink .wl-t')?.textContent === 'the plan'),
  'Trip\'s relative link to Trip/Plan.md became a [[link]] to Plan 2, shown as "the plan"');
  await t.shot('import-folder');
};
