import { afterEach, describe, expect, it } from 'vitest';
import { chartHtml } from './charts';
import { held, huesOf } from './chartHues';

const F = (code: string) => document.createRange().createContextualFragment(chartHtml(code)!);
const tones = (frag: DocumentFragment, sel: string) => [...frag.querySelectorAll(sel)].map((e) => /\bc(\d+)\b/.exec(e.getAttribute('class')!)![1]);

afterEach(() => { held.hues.clear(); held.sides.clear(); });

describe('chart colours by name', () => {
  it("a slice keeps its colour when one before it is deleted or added", () => {
    const before = tones(F('pie\n  "Dogs" : 4\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    const gone = tones(F('pie\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    const added = tones(F('pie\n  "Fish" : 2\n  "Dogs" : 4\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    expect(gone).toEqual(before.slice(1));
    expect(added.slice(1)).toEqual(before);
  });

  it('names that come out the same take the next free colour, so no two alike', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Part ${i}`);
    expect(new Set(huesOf(many, many)).size).toBe(12);
  });

  it('a part being typed in keeps the colour it had', () => {
    held.hues.set('slice:0', 7);
    expect(tones(F('pie\n  "D" : 4\n  "Cats" : 3'), '.pie-legend .dot')[0]).toBe('7');
  });

  // (five pastels for its first ideas, told apart before kept: one taken out from before the others may move one of
  // them to the pastel it freed; one added after them leaves theirs, and one being typed in keeps its own, held)
  it("a mind map's first-step ideas keep their colour as one is added after them, and those under them take it", () => {
    const one = F('mindmap\n  root((Plan))\n    Home\n      Projects\n    Travel\n    Work');
    const two = F('mindmap\n  root((Plan))\n    Home\n    Travel');
    const hue = (f: DocumentFragment, t: string) => [...f.querySelectorAll('g.mm-node')].find((g) => g.textContent!.trim() === t)!.getAttribute('class')!.match(/\bc(\d+)\b/)![1];
    expect(hue(two, 'Home')).toBe(hue(one, 'Home'));
    expect(hue(two, 'Travel')).toBe(hue(one, 'Travel'));
    expect(hue(one, 'Projects')).toBe(hue(one, 'Home'));
  });

  it("a mind map's first five ideas are five different pastels, none the centre's blue", () => {
    // (twelve colours on six pastels: two branches of five came out the same peach)
    const f = F('mindmap\n  root((서비스 출시))\n    마케팅\n    개발\n    운영\n    재무\n    사람');
    const t = tones(f, 'g.mm-l1');
    expect(new Set(t).size).toBe(5);
    expect(t.every((h) => +h >= 1 && +h <= 5)).toBe(true);
  });

  it('while a mind map is edited, its ideas stay on their sides and a new one goes to the lighter side', () => {
    held.sides.set('A', true); held.sides.set('B', true); held.sides.set('C', false);
    const f = F('mindmap\n  root((Plan))\n    A\n    B\n    C\n    D');
    const x = (t: string) => +[...f.querySelectorAll('g.mm-node')].find((g) => g.textContent!.trim() === t)!.querySelector('text')!.getAttribute('x')!;
    const root = +f.querySelector('[data-spot="root"] text')!.getAttribute('x')!;
    expect([x('A') > root, x('B') > root, x('C') > root, x('D') > root]).toEqual([true, true, false, false]);
  });
});
