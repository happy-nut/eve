// A Korean keyboard's / menu: every item has a Korean name, and is found by it as it is typed, jamo by jamo
import { expect, test } from 'vitest';
import { koreanOf, slashItems, type SuggestItem } from './slash';

const every = (items: SuggestItem[]): SuggestItem[] => items.flatMap((i) => (i.sections ? [i, ...every(i.sections)] : [i]));
const labels = (q: string) => slashItems(q).map((i) => i.label);

test('every / item, the kinds inside Heading, Diagram and Color too, has a Korean name', () => {
  expect(every(slashItems('')).filter((i) => !koreanOf(i)).map((i) => i.label)).toEqual([]);
});

// (a group, Heading or Diagram, is found as its kinds, each a row of its own, as "/heading" lists them)
test.each(every(slashItems('')).filter((i) => !i.folder).map((i) => [i.label, koreanOf(i).split(' ')[0]]))('%s is found by "%s" as it is typed', (label, word) => {
  const lead = String.fromCharCode('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.charCodeAt(Math.floor((word.charCodeAt(0) - 0xac00) / 588)));
  for (const q of [lead, word[0], word.replace(/\s+/g, '')]) expect(labels(q), q).toContain(label);
});

test('"/ㅌ" lists Table, "/테이" and "/ㅌㅇㅂ" put it first; "/다이어" lists the diagrams', () => {
  expect(labels('ㅌ')).toContain('Table');
  expect(labels('테이')[0]).toBe('Table');
  expect(labels('다이어')).toEqual(expect.arrayContaining(['Flowchart', 'Pie chart', 'Swimlanes']));
  expect(labels('ㅌㅇㅂ')[0]).toBe('Table');
  expect(labels('플로')[0]).toBe('Flowchart');
});
