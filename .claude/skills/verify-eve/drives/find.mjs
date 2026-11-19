const section = (name) => `## ${name}\n\n${Array.from({ length: 15 }, (_, i) => `${name} line ${i + 1}, written out long enough to take its own row.`).join('\n\n')}\n`;

export const notes = {
  a: `# Plan\n\nThe cat sat. A cat ran.\n\n${['Morning', 'Lunch', 'Evening'].map(section).join('\n')}`,
  c: '# Reading list\n\nA book.\n',
};

const ev = (t, fn, arg) => t.page.evaluate(fn, arg);
const size = (t) => ev(t, () => getComputedStyle(document.querySelector('.tiptap p')).fontSize);
const pill = (t) => ev(t, () => document.querySelector('.size-pill')?.textContent.trim());

export default async (t) => {
  await t.click('.tiptap p');
  await t.key(`${t.mod}+f`);
  await t.page.waitForSelector('.find');
  await t.type('cat');
  await t.ok('find-bar', () => ev(t, () => {
    const hits = [...document.querySelectorAll('.tiptap .find-hit')];
    const bg = (e) => getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number);
    return document.querySelector('.find .count')?.textContent.trim() === '1/2' && hits.length === 2
      && hits.every((h) => h.textContent === 'cat') && hits[0].classList.contains('current') && !hits[1].classList.contains('current')
      && bg(hits[0])[3] > bg(hits[1])[3];
  }), '⌘F opens the bar; "cat" marks both cats, the first darker, and the bar reads 1/2');
  await t.shot('find');

  await t.click('.find button[aria-label="Replace"]');
  await t.ok('find-replace', () => ev(t, () => !!document.querySelector('.find input.rep')), 'the Replace button opens a second line');
  await t.type('dog');
  await t.click('.find button[aria-label="Replace all"]');
  await t.ok('find-replace', async () => (await ev(t, () => document.querySelector('.tiptap p').textContent === 'The dog sat. A dog ran.'
    && document.querySelector('.find .count')?.textContent.trim() === '0/0'))
    && (await t.markdown()).includes('The dog sat. A dog ran.'), 'Replace all puts "dog" in for both, on screen and in the saved note; the count is 0/0');
  await t.shot('replaced');
  await t.key('Escape');
  await t.ok('find-replace', () => ev(t, () => !document.querySelector('.find') && !!document.activeElement?.closest('.tiptap')),
    'Esc closes the bar and the caret is back in the note');

  await t.ok('find-outline', () => ev(t, () => document.querySelectorAll('nav.outline .tick').length === 4), 'a tall note has a rail of 4 ticks, one per heading');
  await t.page.hover('nav.outline .tick >> nth=1');
  await t.ok('find-outline', () => ev(t, () => {
    const p = document.querySelector('nav.outline .peek');
    return p && p.querySelector('b')?.textContent.trim() === 'Morning' && p.textContent.includes('Morning line 1') && p.getBoundingClientRect().width > 0;
  }), 'the second tick hovered shows Morning and its first lines');
  await t.shot('outline-peek');
  await t.click('nav.outline .tick >> nth=2');
  await t.page.mouse.move(900, 600);
  await t.ok('find-outline', () => ev(t, () => {
    const h = [...document.querySelectorAll('.tiptap h2')].find((e) => e.textContent.trim() === 'Lunch');
    const top = h.getBoundingClientRect().top;
    return top >= 0 && top < 200;
  }), 'the third tick clicked scrolls Lunch to the top of the window');
  await t.shot('outline-jumped');

  await t.ok('find-size', async () => (await size(t)) === '15px', "the text starts at Settings' 15px");
  await t.key(`${t.mod}+Equal`);
  await t.ok('find-size', async () => (await size(t)) === '19px' && (await pill(t)) === 'Text 19px', '⌘= makes the text 19px and a "Text 19px" pill says so');
  await t.shot('bigger');
  await t.key(`${t.mod}+Minus`);
  await t.key(`${t.mod}+Minus`);
  await t.ok('find-size', async () => (await size(t)) === '12px' && (await pill(t)) === 'Text 12px', '⌘- twice makes it 12px');
  await t.shot('smaller');
  await t.key(`${t.mod}+0`);
  await t.ok('find-size', async () => (await size(t)) === '15px', "⌘0 puts it back to Settings' 15px");
};
