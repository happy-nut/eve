// A sequence diagram's actor (the stick figure) drawn to the size of the other participants' boxes.
import { test, expect } from 'vitest';
import { smallActors } from './mermaid';

const mermaidActor = '<g class="actor-man actor-top" name="U"><line x1="75" y1="25" x2="75" y2="45"></line><line x1="57" y1="33" x2="93" y2="33"></line><line x1="57" y1="60" x2="75" y2="45"></line><line x1="75" y1="45" x2="91" y2="60"></line><circle cx="75" cy="10" r="15"></circle><text x="75" y="67.5" class="actor actor-man"><tspan x="75" dy="0">User</tspan></text></g>';

test('the stick figure is drawn smaller, its head inside the boxes\' top edge and its name under its feet', () => {
  const out = smallActors(`<svg>${mermaidActor}<g><rect class="actor" y="0" height="65"></rect></g></svg>`);
  const t = /transform="translate\(75 ([\d.]+)\) scale\(([\d.]+)\) translate\(-75 (-?[\d.]+)\)"/.exec(out)!;
  expect(t).toBeTruthy();
  const [to, s, minusTop] = [+t[1], +t[2], +t[3]];
  const top = -minusTop;
  expect(s).toBeLessThan(1);
  expect(to).toBeGreaterThan(0); // the head no longer pokes out above the boxes (it started at y=-5)
  const feet = to + (60 - top) * s;
  const label = +/<text x="75" y="([\d.]+)"/.exec(out)![1];
  expect(label).toBeGreaterThan(feet); // the name stays under the figure
  expect(label).toBeLessThan(65); // and within the boxes' height
  expect(out).toContain('<rect class="actor" y="0" height="65">'); // the boxes untouched
  // a head in proportion: mermaid's (r 15) was near half the figure; now it sits on the neck (y 25), half the size
  const head = /<circle cx="75" cy="([\d.]+)" r="([\d.]+)"/.exec(out)!;
  expect(+head[2]).toBeLessThan(10);
  expect(+head[1] + +head[2]).toBeCloseTo(25);
});

test('a diagram with no actor is left as it was', () => {
  const svg = '<svg><g><rect class="actor"></rect></g></svg>';
  expect(smallActors(svg)).toBe(svg);
});
