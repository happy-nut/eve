export const notes = { a: '# Sums\n\nHalf:\n', c: '# Reading list\n\nA book.\n' };

const open = (t) => t.page.waitForSelector('.tiptap math-field');
const closed = (t) => t.page.waitForFunction(() => !document.querySelector('.tiptap math-field'));

export default async (t) => {
  await t.click('.tiptap > p:last-of-type');
  await t.key('End');
  await t.key('Enter');
  await t.type('/equation');
  await t.page.waitForSelector('.suggest li');
  await t.key('Enter');
  await open(t);
  await t.click('.tiptap .math-edit .part[aria-label="Fraction"]');
  await t.type('1');
  await t.key('Tab');
  await t.type('2');
  await t.key('Tab');
  await t.type('+');
  await t.click('.tiptap .math-edit button[role="tab"]:has-text("Greek")');
  await t.click('.tiptap .math-edit .part[aria-label="pi"]');
  await t.ok('math-block-new', () => t.page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tiptap .math-edit button[role="tab"]')].map((b) => b.textContent.trim());
    return ['Basic', 'Symbols', 'Calculus', 'Greek', 'Matrix'].every((n) => tabs.some((x) => x.includes(n)))
      && document.querySelector('.tiptap .math-edit .texb') && document.querySelector('.tiptap .math-edit .done');
  }), 'an equation block opens with its row of parts: Basic, Symbols, Calculus, Greek, Matrix, TeX, Done');
  await t.shot('block-editing');
  await t.click('.tiptap .math-edit .done');
  await closed(t);
  await t.ok('math-block-new', async () => (await t.markdown()).includes('$$\n\\dfrac{1}{2}+\\pi\n$$')
    && await t.page.locator('.tiptap .math-block .ML__latex').count() === 1,
    'Done draws the half plus pi and the note saves it as a $$ block');
  await t.shot('block-drawn');

  await t.page.locator('.tiptap > p').last().click();
  await t.key('End');
  await t.key('Enter');
  await t.type('Area is $a+b$ here');
  await t.ok('math-inline-typed', async () => await t.page.locator('.tiptap .math-inline .ML__latex').count() === 1
    && (await t.markdown()).includes('Area is $a+b$ here'), 'typing $a+b$ in a line draws a formula and saves the line as Area is $a+b$ here');
  await t.shot('inline-drawn');

  await t.click('.tiptap .math-inline');
  await open(t);
  await t.ok('math-edit', () => t.page.locator('.tiptap .math-edit .part').first().isVisible(),
    'a click on the drawn formula opens it with the row of parts beside it');
  await t.shot('inline-editing');
  await t.type('+c');
  await t.wait(250);
  await t.key('Escape');
  await closed(t);
  await t.ok('math-edit', async () => (await t.markdown()).includes('Area is $a+c+b$ here'),
    'typing +c where it was clicked and Esc save the line as Area is $a+c+b$ here');

  await t.click('.tiptap .math-block');
  await open(t);
  await t.click('.tiptap .math-edit .texb');
  await t.page.locator('.tiptap .math-edit .texin').fill('\\sqrt{x}');
  await t.ok('math-tex', () => t.page.locator('.tiptap .math-edit .texin').isVisible(),
    'the TeX button shows the formula as TeX in a text box');
  await t.shot('tex');
  await t.key('Escape');
  await closed(t);
  await t.ok('math-tex', async () => (await t.markdown()).includes('$$\n\\sqrt{x}\n$$')
    && await t.page.locator('.tiptap .math-block .ML__latex').count() === 1,
    'what was typed as TeX replaces the block, drawn as a square root and saved as \\sqrt{x}');
  await t.shot('tex-drawn');

  const before = await t.markdown();
  await t.page.reload();
  await t.page.waitForSelector('.tiptap .math-block .ML__latex');
  await t.ok('math-kept', async () => await t.markdown() === before
    && await t.page.locator('.tiptap .math-inline .ML__latex').count() === 1,
    'after a reload both formulas are drawn and the note reads the same');
  await t.shot('kept');
};
