import { describe, expect, it } from 'vitest';
import { chartHtml } from './charts';

// "Skip weekends" switched the whole chart to mermaid's own drawing: small bars, their names on them, another look
// from the one it was made in. Eve draws it, a task's days counted on weekdays.
describe('a gantt chart that skips weekends', () => {
  const code = 'gantt\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  section A\n  One : a, 2026-01-09, 3d\n  Two : after a, 2d\n';
  it('is drawn by Eve, as it is without', () => {
    expect(chartHtml(code)).toContain('chart-gantt');
  });
  it('counts a task’s days on weekdays: Friday and three days ends on Tuesday, the next starts Wednesday', () => {
    const f = document.createRange().createContextualFragment(chartHtml(code)!);
    const when = [...f.querySelectorAll('.g-name small')].map((s) => s.textContent);
    expect(when).toEqual(['1/9 – 1/13 · 3d', '1/14 – 1/15 · 2d']);
  });
  it('a task set to start on a weekend starts the Monday after', () => {
    const f = document.createRange().createContextualFragment(chartHtml(code.replace('2026-01-09', '2026-01-10'))!);
    expect(f.querySelector('.g-name small')!.textContent).toBe('1/12 – 1/14 · 3d');
  });
});
