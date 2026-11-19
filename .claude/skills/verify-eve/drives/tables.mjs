const widths = (t) => t.page.evaluate(() => [...document.querySelector('.tiptap table tr').children].map((c) => Math.round(c.getBoundingClientRect().width)));
const box = (t, sel) => t.page.locator(sel).first().boundingBox();
const near = (a, b, d = 1) => a.length === b.length && a.every((w, i) => Math.abs(w - b[i]) <= d);

export default async (t) => {
  await t.key(`${t.mod}+n`);
  await t.type('Sized');
  await t.key('Enter');
  await t.type('/table');
  await t.page.waitForSelector('.suggest li');
  await t.key('Enter');
  await t.type('x');
  await t.ok('table-new', async () => (await t.page.evaluate(() => {
    const rows = [...document.querySelector('.tiptap table').rows];
    return rows.length === 3 && rows.every((r) => r.cells.length === 3) && [...rows[0].cells].every((c) => c.tagName === 'TH')
      && rows[0].cells[0].textContent === 'x';
  })) && /\| x \| +\| +\|/.test(await t.markdown()), '/table put a 3×3 table with a header row, "x" typed into its first cell, saved as "| x |  |  |"');
  await t.shot('table-new', '.tiptap');

  const was = await widths(t);
  const cell = await box(t, '.tiptap table tr:nth-child(2) td');
  await t.page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
  const tall = cell.height;
  await t.type('and a good many more words typed into this one cell, on and on');
  await t.ok('table-write', async () => near(await widths(t), was)
    && (await box(t, '.tiptap table tr:nth-child(2) td')).height > tall * 2,
  "the long words wrap inside their cell and no column's width moved while typing");
  await t.shot('table-write', '.tiptap table');

  const before = await widths(t);
  const r = await t.page.evaluate(() => { const c = document.querySelector('.tiptap table tr').children[0].getBoundingClientRect(); return { x: c.right - 1, y: c.top + c.height / 2 }; });
  await t.page.mouse.move(r.x - 3, r.y);
  await t.page.mouse.move(r.x, r.y);
  await t.wait(100);
  await t.page.mouse.down();
  for (let i = 1; i <= 5; i++) { await t.page.mouse.move(r.x + (60 * i) / 5, r.y); await t.wait(30); }
  await t.page.mouse.up();
  await t.ok('table-resize', async () => {
    const after = await widths(t);
    return Math.abs(after[0] - before[0] - 60) <= 2 && near(after.slice(1), before.slice(1));
  }, "column 1's edge dragged 60 px right makes it 60 px wider and leaves the other columns as they were");
  await t.ok('table-resize', async () => /<!-- eve:widths/.test(await t.markdown()), 'the new width is written into the note');
  await t.shot('table-resize', '.tiptap table');

  const c = await box(t, '.tiptap table tr:nth-child(2) td:nth-child(2)');
  await t.page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await t.ok('table-handles', async () => {
    const tb = await box(t, '.tiptap table'), row = await box(t, '.tbl-grip.row.on'), col = await box(t, '.tbl-grip.col.on');
    const addRow = await box(t, '.tbl-add.row.on'), addCol = await box(t, '.tbl-add.col.on');
    return row && col && addRow && addCol
      && Math.abs(row.x + row.width / 2 - tb.x) <= 2 && row.y < c.y + c.height && row.y + row.height > c.y
      && Math.abs(col.y + col.height / 2 - tb.y) <= 2 && col.x > c.x - 1 && col.x + col.width < c.x + c.width + 1
      && addRow.y >= tb.y + tb.height - 2 && addCol.x >= tb.x + tb.width - 2;
  }, "hovering a cell shows its row's ⋮⋮ on the table's left edge, its column's ⋯ on the top edge, + below and + on the right");
  await t.shot('table-handles');

  await t.page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  await t.type('- milk');
  await t.key('Enter');
  await t.type('eggs');
  await t.key('Enter');
  await t.key('Enter');
  await t.type('done');
  const third = () => t.page.evaluate(() => document.querySelector('.tiptap table tr:nth-child(2) td:nth-child(2)').innerText);
  await t.ok('table-bullets', async () => (await third()) === '• milk\n• eggs\ndone' && /\| • milk<br>• eggs<br>done \|/.test(await t.markdown()),
    '"- " in a cell makes a bullet, Enter the next, Enter on an empty one ends the list; saved as "• milk<br>• eggs<br>done"');
  await t.shot('table-bullets', '.tiptap table');

  const tb = await box(t, '.tiptap table');
  await t.page.mouse.move(tb.x + 30, tb.y + 4);
  await t.page.mouse.move(tb.x + 3, tb.y + 1, { steps: 3 });
  await t.ok('table-add-here', async () => { const p = await box(t, '.tbl-add.here.on'); return !!p && Math.abs(p.x + p.width / 2 - tb.x) <= 2 && Math.abs(p.y + p.height / 2 - tb.y) <= 2; },
    "the pointer at the table's top-left corner shows a + on its left edge, across the top border");
  await t.ok('table-add-here', async () => (await t.page.locator('.tbl-grip.on').count()) === 0, 'and no ⋮⋮ or ⋯ under it');
  const plus = await box(t, '.tbl-add.here.on');
  await t.page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2, { steps: 2 });
  await t.ok('table-add-here', async () => { const l = await box(t, '.tbl-drop.on'); return !!l && Math.abs(l.x + l.width / 2 - tb.x) <= 2 && l.height >= tb.height - 2; },
    'on the +, a line down the left edge shows where the column goes');
  await t.shot('table-add-here-hover');
  const at = await box(t, '.tbl-add.here.on');
  await t.page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await t.type('new');
  await t.ok('table-add-here', async () => (await t.page.evaluate(() => [...document.querySelector('.tiptap table').rows[0].cells].map((c) => c.textContent).join('|'))) === 'new|x||'
    && /\| new \| x \|/.test(await t.markdown()), 'a click puts an empty column in at the far left, the caret in its first cell: typed "new" heads it, before "x"');
  await t.shot('table-add-here', '.tiptap table');
  const second = await t.page.evaluate(() => { const r = document.querySelector('.tiptap table').rows[0].cells[1].getBoundingClientRect(); return { x: r.right, y: r.top }; });
  await t.page.mouse.move(second.x - 4, second.y + 2, { steps: 3 });
  await t.page.mouse.click(second.x, second.y);
  await t.type('mid');
  await t.ok('table-add-here', async () => (await t.page.evaluate(() => [...document.querySelector('.tiptap table').rows[0].cells].map((c) => c.textContent).join('|'))) === 'new|x|mid||',
    "the + on the edge between two columns puts one in between them");

  const under = await t.page.evaluate(() => { const tb = document.querySelector('.tiptap table'); return { x: tb.getBoundingClientRect().left, y: tb.rows[1].getBoundingClientRect().top }; });
  await t.page.mouse.move(under.x + 30, under.y + 10);
  await t.page.mouse.move(under.x + 3, under.y + 1, { steps: 3 });
  await t.ok('table-add-here', async () => { const p = await box(t, '.tbl-add.here.on'); return !!p && Math.abs(p.x + p.width / 2 - under.x) <= 2 && Math.abs(p.y + p.height / 2 - under.y) <= 2 && (await t.page.locator('.tbl-grip.row.on').count()) === 0; },
    "by the left border under the header row, a + on that edge (and no ⋮⋮ under it)");
  const rp = await box(t, '.tbl-add.here.on');
  await t.page.mouse.move(rp.x + rp.width / 2, rp.y + rp.height / 2, { steps: 2 });
  await t.ok('table-add-here', async () => { const l = await box(t, '.tbl-drop.on'); const w = await box(t, '.tiptap .tableWrapper'); return !!l && Math.abs(l.y + l.height / 2 - under.y) <= 2 && l.height <= 4 && l.x + l.width <= w.x + w.width + 1; }, 'on it, a line across that edge, no further than the table is shown');
  await t.shot('table-add-row-hover');
  const rat = await box(t, '.tbl-add.here.on');
  await t.page.mouse.click(rat.x + rat.width / 2, rat.y + rat.height / 2);
  await t.type('row');
  await t.ok('table-add-here', async () => (await t.page.evaluate(() => [...document.querySelector('.tiptap table').rows].map((r) => r.cells[0].textContent))).join('|') === 'new|row||',
    'a click puts an empty row in under the header row, the caret in its first cell');
  await t.shot('table-add-row', '.tiptap table');
};
