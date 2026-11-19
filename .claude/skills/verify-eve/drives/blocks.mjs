export const notes = {
  a: '# Plan\n\nFirst line.\n\n> [!warning] Careful\n> mind the step\n',
  c: '# Reading list\n\nA book.\n',
};

const ev = (t, fn) => t.page.evaluate(fn);

export default async (t) => {
  await t.ok('block-callout-read', async () => (await ev(t, () => {
    const c = document.querySelector('.tiptap .callout');
    const ps = c ? [...c.querySelectorAll('p')] : [];
    return c?.dataset.color === 'orange' && c.querySelector('.callout-emoji')?.textContent.trim() === '⚠️'
      && ps[0]?.textContent.trim() === 'Careful' && Number(getComputedStyle(ps[0]).fontWeight) >= 600
      && ps.at(-1).textContent.trim() === 'mind the step'
      && ps.at(-1).getBoundingClientRect().top > ps[0].getBoundingClientRect().top;
  })) && (await t.markdown()).includes('> [!warning] Careful'), 'an orange box with ⚠️, Careful in bold over "mind the step"; the file keeps "warning"');
  await t.shot('callout-read', '.tiptap');

  await t.key(`${t.mod}+n`);
  await t.type('Blocks');
  await t.key('Enter');

  await t.type('/callout');
  await t.page.waitForSelector('.suggest li');
  await t.key('Enter');
  await t.ok('block-callout-new', () => ev(t, () => {
    const c = document.querySelector('.tiptap .callout');
    return c?.querySelector('.callout-emoji')?.textContent.trim() === '💡' && getSelection().anchorNode && c.contains(getSelection().anchorNode);
  }), '/callout Enter puts a 💡 box with the caret in it');
  await t.type('boxed words');
  await t.ok('block-callout-new', async () => /> \[!💡\]\n> boxed words/.test(await t.markdown()), 'saved as "> [!💡]" over "> boxed words"');
  await t.shot('callout-new', '.tiptap');
  await t.key('Enter');
  await t.key('Enter');

  await t.type('> ');
  await t.type('Fold me');
  await t.key('Enter');
  await t.type('hidden body');
  await t.ok('block-toggle', () => ev(t, () => {
    const d = document.querySelector('.tiptap [data-type="details"]');
    const sel = getSelection().anchorNode;
    return d && !document.querySelector('.tiptap blockquote') && d.querySelector('summary, [data-type="detailsSummary"]')?.textContent.trim() === 'Fold me'
      && d.textContent.includes('hidden body') && d.contains(sel) && !(sel.parentElement.closest('summary, [data-type="detailsSummary"]'));
  }), '"> " made a toggle (not a quote) titled Fold me, and Enter went into its body');
  await t.shot('toggle-open', '.tiptap');
  await t.key('Enter');
  await t.key('Enter');

  await t.type('1. one');
  await t.key('Enter');
  await t.key('Tab');
  await t.type('two');
  await t.key('Enter');
  await t.key('Tab');
  await t.type('three');
  await t.ok('block-list-nest', async () => /1\. one\n {3}1\. two\n {6}1\. three/.test(await t.markdown())
    && (await ev(t, () => {
      const li = [...document.querySelectorAll('.tiptap ol li')].find((l) => l.firstElementChild?.textContent === 'three');
      let depth = 0;
      for (let e = li; e; e = e.parentElement?.closest('ol')) if (e.tagName === 'OL') depth++;
      return depth === 3;
    })), 'Tab twice nests one / two / three three levels deep, saved as nested "1." lists');
  await t.shot('list-nest', '.tiptap');
  for (let i = 0; i < 4; i++) await t.key('Enter');

  await t.type('```');
  await t.key('Enter');
  await t.type('const x = 1;');
  await t.ok('block-code', () => ev(t, () => document.querySelector('.tiptap pre')?.textContent.includes('const x = 1;')),
    '``` Enter opened a code block holding what was typed');
  await t.key('ArrowDown');
  await t.key('ArrowDown');
  await t.type('a ==bright== word and red');
  await t.ok('block-code', async () => /```\w*\nconst x = 1;\n```/.test(await t.markdown())
    && (await ev(t, () => !getSelection().anchorNode.parentElement.closest('pre'))), '↓ twice left the code block; saved as a fenced block');
  await t.shot('code', '.tiptap');
  await t.ok('block-highlight', async () => (await t.markdown()).includes('a ==bright== word and red') && (await ev(t, () => {
    const m = document.querySelector('.tiptap mark');
    if (m?.textContent !== 'bright') return false;
    const [r, g, b] = getComputedStyle(m).backgroundColor.match(/\d+/g).map(Number);
    return r > 220 && g > 200 && b < g - 40;
  })), '==bright== became yellow-highlighted "bright", saved as ==bright==');
  await t.shot('highlight', '.tiptap');

  await t.key('Enter');
  await t.type('now in red /red');
  await t.page.waitForSelector('.suggest li');
  await t.ok('block-color', () => ev(t, () => {
    const li = document.querySelector('.suggest li:not(.group)');
    return li?.textContent.includes('Red') && li.textContent.includes('text color');
  }), '/red lists Red (text color) first');
  await t.shot('red-menu');
  await t.key('Enter');
  await t.ok('block-color', async () => /<span style="color: #c4302b">now in red ?<\/span>/.test(await t.markdown()) && (await ev(t, () => {
    const s = [...document.querySelectorAll('.tiptap span[style]')].find((e) => e.textContent.trim() === 'now in red');
    return s && getComputedStyle(s).color === 'rgb(196, 48, 43)';
  })), 'Enter on Red turns "now in red" red on screen and saves it in a #c4302b span');
  await t.shot('red', '.tiptap');

  await t.click('.tiptap [data-type="details"] > button');
  await t.ok('block-toggle', async () => (await ev(t, () => {
    const d = document.querySelector('.tiptap [data-type="details"]');
    const body = [...d.querySelectorAll('p')].find((p) => p.textContent === 'hidden body');
    return !d.classList.contains('is-open') && (!body || !body.offsetParent || body.getBoundingClientRect().height === 0);
  })) && /<details>\n?<summary>Fold me<\/summary>/.test(await t.markdown()), 'the ▸ button folds the toggle: its body hides and the note saves <details> without open');
  await t.shot('folded', '.tiptap');
};
