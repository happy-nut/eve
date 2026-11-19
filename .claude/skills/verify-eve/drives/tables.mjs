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
};
