const hour = 3600_000;
export const notes = {
  a: '# Plan\n\nFirst line.\n\nSecond line of the plan.\n\nThird line, not shown in the list.\n',
  b: `---\nid: b\nupdated: ${Date.now() - hour}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n\neggs\n`,
  c: '# Reading list\n\nA book.\n\nAnother book.\n',
};

const touchHelper = (t) => t.page.evaluate(() => {
  window.__touch = (type, target, x, y) => {
    const ev = new TouchEvent(type, { bubbles: true, cancelable: true });
    const p = [{ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y }];
    for (const k of ['touches', 'targetTouches']) Object.defineProperty(ev, k, { value: type === 'touchend' ? [] : p });
    Object.defineProperty(ev, 'changedTouches', { value: p });
    return ev;
  };
});
const swipe = (t, sel, dx) => t.page.evaluate(async ({ sel, dx }) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect();
  const y = r.top + r.height / 2, x0 = r.left + r.width * 0.7;
  const fire = (type, x) => el.dispatchEvent(window.__touch(type, el, x, y));
  fire('touchstart', x0);
  for (let i = 1; i <= 10; i++) { fire('touchmove', x0 + (dx * i) / 10); await new Promise((r) => setTimeout(r, 16)); }
  fire('touchend', x0 + dx);
}, { sel, dx });
const pullDown = (t, sel, dy) => t.page.evaluate(async ({ sel, dy }) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y0 = r.top + 20;
  const fire = (type, y) => el.dispatchEvent(window.__touch(type, el, x, y));
  fire('touchstart', y0);
  for (let i = 1; i <= 10; i++) { fire('touchmove', y0 + (dy * i) / 10); await new Promise((r) => setTimeout(r, 16)); }
  fire('touchend', y0 + dy);
}, { sel, dy });
const holdAndMove = (t, sel, toSel) => t.page.evaluate(async ({ sel, toSel }) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect(), to = document.querySelector(toSel).getBoundingClientRect();
  const x = r.left + r.width / 2, y0 = r.top + r.height / 2, y1 = to.top + 6;
  const fire = (type, y) => el.dispatchEvent(window.__touch(type, el, x, y));
  fire('touchstart', y0);
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 1; i <= 12; i++) { fire('touchmove', y0 + ((y1 - y0) * i) / 12); await new Promise((r) => setTimeout(r, 30)); }
  const seen = { lifted: !!document.querySelector('.lifted'), line: !!document.querySelector('aside .row.drop-before, aside .row.drop-after') };
  fire('touchend', y1);
  return seen;
}, { sel, toSel });

const shown = (t, sel) => t.page.locator(sel).first().isVisible().catch(() => false);
const titles = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row] .t')].map((e) => e.textContent.trim()));
const tap = (t, sel) => t.page.locator(sel).first().tap();

export default async (t) => {
  await t.ok('phone-open', async () => {
    const title = await t.page.evaluate(() => document.querySelector('.tiptap h1')?.textContent.trim());
    const asideShown = await t.page.evaluate(() => [...document.querySelectorAll('aside')].some((a) => a.checkVisibility()));
    const ed = await t.page.locator('.tiptap').boundingBox();
    return title === 'Plan' && !asideShown && ed.width > 300
      && await shown(t, 'button[aria-label="Back"]:visible') && await shown(t, 'button[aria-label="More"]:visible')
      && await shown(t, 'button[aria-label="Pin to the top of the widget"]:visible') && await shown(t, 'button[aria-label="Delete note"]:visible');
  }, 'the app opens on Plan, the note left open, full width with no list, and ‹, ⋯, the pin and the bin above it');
  await t.shot('phone-open');

  await t.page.locator('.tiptap p:has-text("Second line")').tap();
  await t.page.setViewportSize({ width: 390, height: 470 });
  await t.ok('phone-bar', async () => {
    const labels = await t.page.evaluate(() => [...document.querySelectorAll('.mbar button')].filter((b) => b.checkVisibility()).map((b) => b.getAttribute('aria-label')));
    return ['Undo', 'Redo', 'To-do', 'Bold', 'Highlight', 'Outdent', 'Indent', 'Done'].every((l) => labels.includes(l));
  }, 'with the keyboard up, the bar over it has undo, redo, to-do, bold, highlight, outdent, indent and Done');
  await tap(t, '.mbar button[aria-label="To-do"]');
  await t.ok('phone-bar', async () => (await t.markdown()).includes('- [ ] Second line of the plan.')
    && await t.page.evaluate(() => [...document.querySelectorAll('.tiptap ul[data-type="taskList"] > li')].some((li) => li.textContent.includes('Second line') && li.querySelector('input[type="checkbox"]'))),
  'To-do on the bar made the tapped line a to-do with a box, saved as - [ ]');
  await t.shot('phone-bar');
  await tap(t, '.mbar button[aria-label="Done"]');
  await t.page.setViewportSize({ width: 390, height: 844 });
  await t.ok('phone-bar', () => t.page.evaluate(() => !document.querySelector('.mbar')?.checkVisibility() && !document.activeElement?.closest('.tiptap')),
    'Done put the keyboard and the bar away');

  await tap(t, 'button[aria-label="More"]:visible');
  await t.ok('phone-sheet', () => t.page.evaluate(() => {
    const s = document.querySelector('.sheet');
    const text = s?.textContent ?? '';
    const r = s?.getBoundingClientRect();
    return r && r.bottom >= innerHeight - 2 && ['Small text', 'Present', 'Find & replace…', 'Select all', 'Export…', 'Version history…', 'Trash…'].every((w) => text.includes(w));
  }), '⋯ brings a sheet up from the bottom with Small text, Present, Find & replace…, Select all, Export…, Version history…, Trash…');
  await t.shot('phone-sheet');
  await t.page.touchscreen.tap(195, 80);
  await t.ok('phone-sheet', () => t.page.evaluate(() => !document.querySelector('.sheet')), 'a tap on the dim page above puts the sheet away');

  await tap(t, 'button[aria-label="Back"]:visible');
  await t.ok('phone-list', () => t.page.evaluate(() => {
    const head = document.querySelector('aside .mtop');
    const row = (id) => document.querySelector(`aside [data-row][data-note="${id}"]`);
    const rows = ['a', 'b', 'c'].map(row);
    const plan = rows[0], prev = plan?.querySelector('.preview');
    const lh = prev && parseFloat(getComputedStyle(prev).lineHeight);
    const fab = document.querySelector('button.fab[aria-label="New note"]');
    const round = fab?.checkVisibility() && Math.abs(fab.getBoundingClientRect().width - fab.getBoundingClientRect().height) < 1
      && parseFloat(getComputedStyle(fab).borderTopLeftRadius) >= fab.getBoundingClientRect().width / 2 - 1;
    return head?.querySelector('.mtitle')?.textContent === 'Eve' && head.querySelector('.sync')?.textContent.trim() === 'local only'
      && head.querySelector('button[aria-label="Settings"]')?.checkVisibility()
      && document.querySelector('aside .search input')?.checkVisibility()
      && rows.every((r) => r?.querySelector('.t')?.textContent.trim() && r.querySelector('.when')?.textContent.trim() && r.querySelector('.preview'))
      && plan.querySelector('.when').textContent.trim() === '지금'
      && prev.textContent.includes('First line.') && prev.textContent.includes('Third line') && prev.getBoundingClientRect().height <= lh * 2 + 1
      && rows[1].getBoundingClientRect().left > plan.getBoundingClientRect().left + 10
      && round;
  }), '‹ shows the list: Eve, local only and the gear, a Search box, each row a title, when (지금 for Plan) and two lines at most of its note, Groceries indented, the round +');
  await t.shot('phone-list');

  await touchHelper(t);
  const seen = await holdAndMove(t, 'aside [data-row][data-note="c"]', 'aside [data-row][data-note="a"]');
  await t.ok('phone-reorder', async () => seen.lifted && seen.line && (await titles(t)).join('|') === 'Reading list|Plan|Groceries',
    'a long press lifts Reading list with a copy and a drop line under the finger; let go over Plan, it lands above it');
  await t.shot('phone-reorder');

  await swipe(t, 'aside [data-row][data-note="c"]', -220);
  await t.ok('phone-swipe', () => t.page.evaluate(() => document.querySelector('[role="dialog"].box')?.textContent.includes('Delete “Reading list”?')),
    'Reading list pulled left past a third of its width asks Delete “Reading list”?');
  await t.shot('phone-swipe-ask');
  await tap(t, '[role="dialog"].box button:text-is("Delete")');
  await t.ok('phone-swipe', async () => !(await titles(t)).includes('Reading list')
    && await t.page.evaluate(() => {
      const toast = document.querySelector('.toast');
      return toast?.textContent.includes('Deleted “Reading list”') && [...toast.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo')
        && /deleted: true/.test(localStorage.getItem('eve.notes.c') ?? '');
    }), 'Delete takes the row away, saved as deleted, and a toast says Deleted “Reading list” with Undo');
  await t.shot('phone-swipe');

  await tap(t, 'button[aria-label="New note"]:visible');
  await t.ok('phone-sheet', () => t.page.evaluate(() => [...document.querySelectorAll('.sheet button')].some((b) => b.textContent.includes('New note'))),
    '+ brings a sheet with New note');
  await pullDown(t, '.sheet', 250);
  await t.ok('phone-sheet', () => t.page.evaluate(() => !document.querySelector('.sheet')), 'pulled down, the sheet goes away');

  await tap(t, 'button[aria-label="New note"]:visible');
  await tap(t, '.sheet button:has-text("New note")');
  await tap(t, '.tiptap');
  await t.type('From the phone');
  await tap(t, 'button[aria-label="Back"]:visible');
  await t.ok('phone-back', () => t.page.evaluate(() => {
    const first = document.querySelector('aside [data-row]');
    return document.querySelector('aside')?.checkVisibility() && first?.querySelector('.t')?.textContent.trim() === 'From the phone'
      && first.querySelector('.when')?.textContent.trim() === '지금';
  }), '‹ from a new note with words goes to the list, where it stays, on top, edited 지금');
  await t.shot('phone-back');
};
