const pad = (n) => String(n).padStart(2, '0');
const tomorrow = () => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const links = (t) => t.page.evaluate(() => [...document.querySelectorAll('.tiptap .wikilink')].map((l) => l.textContent));
const heading = (t) => t.page.evaluate(() => document.querySelector('.tiptap h1')?.textContent);
const paste = (t, text) => t.page.evaluate((s) => {
  const dt = new DataTransfer();
  dt.setData('text/plain', s);
  document.querySelector('.tiptap').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, text);

const YOUTUBE = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const SHORT = 'https://youtu.be/aqz-KE-bpKQ';
const VIMEO = 'https://vimeo.com/76979871';
const FILE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export default async (t) => {
  await t.click('.tiptap p');
  await t.key('End');
  await t.key('Enter');
  await t.type('see [[Gro');
  await t.page.waitForSelector('.suggest li');
  await t.ok('link-picker', () => t.page.evaluate(() => {
    const rows = [...document.querySelectorAll('.suggest li')].map((r) => r.textContent.trim().replace(/\s+/g, ' '));
    return rows.length === 2 && rows[0].includes('Groceries') && rows[1].includes('Gro') && rows[1].includes('new note');
  }), '[[Gro lists Groceries, then "Gro new note" last');
  await t.shot('picker');
  await t.key('Enter');
  await t.ok('link-picker', async () => (await links(t))[0] === 'Groceries' && (await t.markdown()).includes('see [[Groceries]] '),
    'Enter puts in a link reading Groceries, saved as [[Groceries]] with a space after it');

  await t.type(' and [[Reading list|books]] ');
  await t.ok('link-alias', async () => (await links(t))[1] === 'books' && (await t.markdown()).includes('[[Reading list|books]]'),
    '[[Reading list|books]] typed out becomes a link reading books, kept as [[Reading list|books]]');
  await t.shot('alias');

  await t.type('due @tomorrow');
  await t.page.waitForSelector('.cal');
  await t.ok('link-date', () => t.page.evaluate((d) => document.querySelector('.cal .cal-day.on')?.textContent.trim() === d, String(Number(tomorrow().slice(8)))),
    '@tomorrow opens a calendar with tomorrow chosen');
  await t.shot('calendar');
  await t.key('Enter');
  await t.ok('link-date', async () => (await t.page.$('.tiptap .datechip')) && (await t.markdown()).trimEnd().endsWith(`due @${tomorrow()}`),
    `Enter leaves a date chip, saved as @${tomorrow()}`);
  await t.shot('datechip');

  await t.click('.tiptap .wikilink >> nth=1');
  await t.ok('link-open', async () => (await heading(t)) === 'Reading list'
    && t.page.evaluate(() => document.querySelector('.page-controls .backlinks')?.textContent.trim() === '1 link here'),
  'the books link opens Reading list, which says 1 link here at its head');
  await t.shot('alias-opened');

  await t.click('aside [data-row]:has-text("Plan")');
  await t.click('.tiptap .wikilink >> nth=0');
  await t.ok('link-open', async () => (await heading(t)) === 'Groceries', 'the Groceries link opens Groceries');
  await t.click('.tiptap h1');
  await t.key('End');
  await t.type(' 2');
  await t.wait(1500);
  await t.click('aside [data-row]:has-text("Plan")');
  await t.ok('link-rename', async () => (await heading(t)) === 'Plan' && (await links(t))[0] === 'Groceries 2' && (await t.markdown()).includes('[[Groceries 2]]'),
    "Groceries renamed Groceries 2: Plan's link reads Groceries 2 and its markdown has [[Groceries 2]]");
  await t.shot('renamed');

  await t.page.locator('.tiptap p').last().click();
  await t.key('End');
  await t.key('Enter');
  await paste(t, YOUTUBE);
  await t.ok('link-video', () => t.page.evaluate(() => {
    const v = document.querySelector('.tiptap .bookmark.video');
    return v?.querySelector('iframe.video-frame')?.src.includes('/embed/aqz-KE-bpKQ') && v.querySelector('.bm-url')?.textContent.includes('youtube.com/watch');
  }), "a YouTube address pasted on an empty line becomes YouTube's player with the address under it");
  await t.ok('link-video', async () => (await t.markdown()).split('\n').includes(YOUTUBE), 'the player is saved as the bare YouTube address on its own line');
  await t.wait(3000);
  await t.shot('youtube', '.tiptap .bookmark.video');
  await paste(t, SHORT);
  await paste(t, VIMEO);
  await t.ok('link-video', () => t.page.evaluate(() => {
    const src = [...document.querySelectorAll('.tiptap .bookmark.video iframe.video-frame')].map((f) => f.src);
    return src.length === 3 && src[1].includes('/embed/aqz-KE-bpKQ') && src[2].startsWith('https://player.vimeo.com/video/76979871');
  }), "a youtu.be address is YouTube's player too, and a Vimeo address is Vimeo's");
  await t.ok('link-video', async () => { const md = (await t.markdown()).split('\n'); return md.includes(SHORT) && md.includes(VIMEO); },
    'the youtu.be and Vimeo players are saved as their bare addresses');
  await paste(t, FILE);
  await t.ok('link-video', async () => (await t.page.evaluate((u) => document.querySelector('.tiptap figure.vid-fig video')?.src === u, FILE))
    && (await t.markdown()).includes(`[flower.mp4](${FILE})`), 'a .mp4 address becomes a video block, saved as [flower.mp4](address)');
  await t.shot('video-file', '.tiptap figure.vid-fig');
  await t.type('watch this ');
  await paste(t, YOUTUBE);
  await t.ok('link-video', async () => (await t.page.evaluate((u) => document.querySelectorAll('.tiptap .bookmark.video').length === 3
    && [...document.querySelectorAll('.tiptap p a')].some((a) => a.getAttribute('href') === u && a.closest('p').textContent.startsWith('watch this')), YOUTUBE)),
  'the same address pasted in a sentence stays a link in that line');
  await t.shot('in-sentence');
};
