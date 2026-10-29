/**
 * A note's blocks as slides, cut by itself: a new one at each heading of the biggest size the note uses under its title
 * (the title, and whatever comes before the first of those, is the first slide), and then each of those cut again
 * where the screen ends (`paginate`).
 */
export function slides(blocks: Element[]): Element[][] {
  const level = (b: Element) => Number(/^H([1-6])$/.exec(b.tagName)?.[1] ?? 9);
  const top = Math.min(9, ...blocks.slice(1).map(level));
  const out: Element[][] = [[]];
  blocks.forEach((b, i) => {
    if (i > 0 && top < 9 && level(b) === top) out.push([]);
    out.at(-1)!.push(b);
  });
  return out;
}

/**
 * Each slide as many slides as it takes to show without scrolling: as many blocks as `fits` says the screen holds, the
 * rest on the next one under the slide's heading again (`again` copies it). A block taller than the screen on its own
 * is a slide of its own, scrolled through. A divider at a slide's edge has nothing to divide there and goes.
 */
export function paginate(deck: Element[][], fits: (blocks: Element[]) => boolean, again: (heading: Element) => Element): Element[][] {
  const out: Element[][] = [];
  for (const s of deck) {
    const head = /^H[1-6]$/.test(s[0]?.tagName ?? '') ? s[0] : null;
    let now: Element[] = [];
    for (const b of s) {
      if (now.length && !fits([...now, b])) { out.push(now); now = head ? [again(head), b] : [b]; }
      else now.push(b);
    }
    out.push(now);
  }
  const hr = (b?: Element) => b?.tagName === 'HR' || (b?.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
  return out.map((s) => { while (hr(s[0])) s.shift(); while (hr(s.at(-1))) s.pop(); return s; }).filter((s) => s.length);
}
