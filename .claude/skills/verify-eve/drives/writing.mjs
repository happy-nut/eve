const rows = (t) => t.page.evaluate(() => [...document.querySelectorAll('.suggest li:not(.group)')].map((li) => li.textContent.trim()));
const groups = (t) => t.page.evaluate(() => [...document.querySelectorAll('.suggest li.group')].map((li) => li.textContent.trim()));
const menuGone = (t) => t.page.evaluate(() => !document.querySelector('.suggest li'));
const lastLine = (t) => t.page.evaluate(() => {
  const n = getSelection().anchorNode;
  return (n?.nodeType === 1 ? n : n?.parentElement)?.closest('p')?.textContent;
});

export default async (t) => {
  await t.key(`${t.mod}+n`);
  await t.type('Writing');
  await t.key('Enter');

  await t.type('[] pack bags');
  await t.key('Enter');
  await t.key('Enter');
  await t.type('- a point');
  await t.key('Enter');
  await t.key('Enter');
  await t.type('# Big words');
  await t.key('Enter');
  await t.type('| said once');
  await t.key('Enter');
  await t.key('Enter');
  await t.ok('write-md', () => t.page.evaluate(() => {
    const ed = document.querySelector('.tiptap');
    const todo = [...ed.querySelectorAll('ul[data-type="taskList"] > li')].find((li) => li.textContent.includes('pack bags'));
    return todo?.querySelector('input[type="checkbox"]')
      && [...ed.querySelectorAll('ul:not([data-type]) > li')].some((li) => li.textContent.trim() === 'a point')
      && [...ed.querySelectorAll('h1')].some((h) => h.textContent.trim() === 'Big words')
      && [...ed.querySelectorAll('blockquote')].some((q) => q.textContent.trim() === 'said once');
  }).then(async (seen) => {
    const md = await t.markdown();
    return seen && md.includes('- [ ] pack bags') && md.includes('- a point') && md.includes('# Big words') && md.includes('> said once');
  }), '"[] ", "- ", "# " and "| " typed at a line\'s start became a to-do, a bullet, a heading and a quote, saved as such');
  await t.shot('markdown-typed', '.tiptap');

  await t.type('/');
  await t.page.waitForSelector('.suggest li');
  await t.ok('write-slash', async () => {
    const g = await groups(t), r = await rows(t);
    return g.join('|') === 'Basic blocks|Media|Notes and boards|Advanced' && r[0].startsWith('Text')
      && !r.some((x) => /^(Duplicate|Move to|Delete)/.test(x));
  }, 'a bare / shows Basic blocks, Media, Notes and boards, Advanced, Text first, no Duplicate/Move to/Delete');
  await t.shot('slash-bare');
  await t.type('table');
  await t.ok('write-slash', async () => (await rows(t))[0]?.startsWith('Table') && (await groups(t)).length === 0,
    'typing "table" narrows the menu to Table first');
  await t.shot('slash-table');
  await t.key('Escape');
  await t.ok('write-slash', async () => (await menuGone(t)) && (await lastLine(t)) === '/table', 'Esc closes the menu and leaves "/table" as typed');
  for (let i = 0; i < 6; i++) await t.key('Backspace');
  await t.ok('write-slash', async () => (await lastLine(t)) === '', 'the typed "/table" is gone');

  await t.type('/표');
  await t.page.waitForSelector('.suggest li');
  await t.ok('write-korean', async () => (await rows(t))[0]?.startsWith('Table'), '/표 lists Table first');
  await t.shot('slash-korean');
  await t.key('Escape');
  for (let i = 0; i < 2; i++) await t.key('Backspace');
  await t.type('/ㅌ');
  await t.page.waitForSelector('.suggest li');
  await t.ok('write-korean', async () => (await rows(t)).some((r) => r.startsWith('Table')), '/ㅌ lists Table');
  await t.key('Escape');
  for (let i = 0; i < 2; i++) await t.key('Backspace');

  await t.type('/table');
  await t.page.waitForSelector('.suggest li');
  await t.wait(700);
  await t.key('Enter');
  await t.ok('write-slash', async () => (await t.page.evaluate(() => !!document.querySelector('.tiptap table') && !document.querySelector('.suggest li')))
    && !/\/table|able/.test(await t.markdown()), 'Enter on Table puts a table in place of "/table" and closes the menu');
  await t.shot('slash-enter');

  await t.key(`${t.mod}+z`);
  await t.ok('write-undo', async () => {
    const md = await t.markdown();
    return !(await t.page.evaluate(() => !!document.querySelector('.tiptap table'))) && md.trimEnd().endsWith('> said once\n\n/table');
  }, 'one ⌘Z takes the table back out, leaving "/table" as it was typed and the rest of the note');
  await t.shot('undone', '.tiptap');
};
