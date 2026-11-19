const pad = (n) => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export default async (t) => {
  await t.page.tap('button[aria-label="Back"]:visible');
  await t.page.tap('aside button[aria-label="Settings"]');
  await t.page.locator(':has(> .label:has-text("Daily notes")) input.switch').first().tap();
  await t.page.tap('button[aria-label="Close"]:visible');
  await t.page.tap('aside [data-row]:has-text("Daily")');
  await t.ok('calendar-phone', () => t.page.evaluate(() => {
    const cal = document.querySelector('.calendar')?.getBoundingClientRect();
    const list = [...document.querySelectorAll('aside')].some((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth && getComputedStyle(a).visibility !== 'hidden'; });
    return cal && cal.width > innerWidth - 2 && !list && document.querySelector('.calendar .day.today');
  }), 'the Daily notes row opens the calendar across the whole phone screen, the list gone');
  await t.shot('calendar');

  await t.page.tap('.calendar .day.today');
  await t.ok('calendar-phone', () => t.page.evaluate((k) => {
    const card = document.querySelector('.card-page');
    if (!card) return false;
    const r = card.getBoundingClientRect();
    return Math.abs(r.bottom - innerHeight) < 2 && r.top > 0 && card.querySelector('.tiptap')?.textContent.startsWith(k)
      && card.innerHTML.includes('Start writing');
  }, todayKey()), "today tapped opens its note as a sheet from the bottom, titled with today's date, Start writing… in it");
  await t.shot('day-sheet');
};
