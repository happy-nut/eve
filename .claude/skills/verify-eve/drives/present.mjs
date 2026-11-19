export const notes = {
  a: '# Talk\n\nWhat this is about.\n\n## The flow\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Middle]\n  B --> C[Finish]\n```\n\n## Last part\n\nThe last words.\n',
};

const count = (t) => t.page.evaluate(() => document.querySelector('.present .count')?.textContent.trim() ?? null);
const heading = (t) => t.page.evaluate(() => document.querySelector('.present .slide h1, .present .slide h2')?.textContent.trim() ?? null);
const at = (t, c, h) => async () => (await count(t)) === c && (h === undefined || (await heading(t)) === h);
const boxesShown = (t) => t.page.evaluate(() => [...document.querySelectorAll('.present .slide g.node')].filter((g) => getComputedStyle(g).opacity !== '0').length);
const inNote = (t) => t.page.evaluate(() => !!document.activeElement?.closest('.tiptap'));

export default async (t) => {
  await t.page.waitForSelector('.tiptap .mermaid-view svg g.node');
  await t.wait(2500);
  const before = await t.markdown();

  await t.click('.note-more');
  await t.click('[role="menuitem"]:has-text("Present")');
  await t.ok('present-open', at(t, '1 / 3', 'Talk'), 'More, Present starts on the first of 3 slides with the title Talk as a cover');
  await t.shot('first-slide');

  await t.key('ArrowRight');
  await t.ok('present-walk', async () => (await at(t, '2 / 3', 'The flow')()) && (await boxesShown(t)) === 1, 'right arrow goes on to slide 2, The flow, its chart showing its first box only');
  await t.key('ArrowRight');
  await t.ok('present-walk', async () => (await count(t)) === '2 / 3' && (await boxesShown(t)) === 2, 'right arrow on the chart brings in the second box, still on 2 / 3');
  await t.key(' ');
  await t.ok('present-walk', async () => (await count(t)) === '2 / 3' && (await boxesShown(t)) === 3, 'space brings in the last box: all three shown, still 2 / 3');
  await t.shot('chart-drawn');
  await t.key('ArrowRight');
  await t.ok('present-walk', at(t, '3 / 3', 'Last part'), 'right arrow then turns to slide 3, Last part');
  await t.page.mouse.click(1100, 750);
  await t.ok('present-walk', async () => (await t.page.locator('.present .end').isVisible()) && (await count(t)) === 'End', 'a click on the right past the last slide shows End of presentation');
  await t.shot('end');
  await t.key('ArrowLeft');
  await t.ok('present-walk', at(t, '3 / 3', 'Last part'), 'left arrow goes back to 3 / 3');
  await t.page.mouse.click(100, 450);
  await t.ok('present-walk', at(t, '2 / 3', 'The flow'), 'a click on the left third goes back to 2 / 3');
  await t.key('Home');
  await t.ok('present-walk', at(t, '1 / 3', 'Talk'), 'Home goes to the first slide');

  await t.key('Escape');
  await t.ok('present-leave', async () => (await t.page.locator('.present').count()) === 0 && await inNote(t), 'escape ends it and the keyboard is back in the note');
  await t.ok('present-leave', async () => (await t.markdown()) === before, 'the note is unchanged');
  await t.shot('left');

  await t.key(`${t.mod}+Shift+Enter`);
  await t.ok('present-open', at(t, '1 / 3', 'Talk'), 'shift command return starts on 1 / 3 too');
  await t.click('button[aria-label="End the presentation"]');
  await t.ok('present-leave', async () => (await t.page.locator('.present').count()) === 0 && await inNote(t), 'the ✕ End the presentation button ends it, the keyboard back in the note');

  await t.click('.tiptap p:has-text("The last words.")');
  await t.key(`${t.mod}+Alt+Enter`);
  await t.ok('present-here', at(t, '3 / 3', 'Last part'), 'option command return from the last paragraph starts on its slide, 3 / 3 Last part');
  await t.shot('from-caret');
  await t.key('Escape');
  await t.click('.tiptap p:has-text("What this is about.")');
  await t.key(`${t.mod}+Alt+Enter`);
  await t.ok('present-here', at(t, '1 / 3', 'Talk'), 'from the first paragraph it starts on 1 / 3');
  await t.key('Escape');
  await t.ok('present-leave', async () => (await t.markdown()) === before, 'after three showings the note is still unchanged');
};
