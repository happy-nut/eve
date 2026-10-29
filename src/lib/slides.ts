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
 * rest on the next one under the slide's heading and the subheading it has reached again (`again` copies them), so a
 * screen always says where in the talk it is; a new subheading takes the old one's place. A heading is never a slide's
 * last line: it goes on with the words under it. A block taller than the screen on its own
 * is a slide of its own, scrolled through. A divider at a slide's edge has nothing to divide there and goes.
 */
export function paginate(deck: Element[][], fits: (blocks: Element[]) => boolean, again: (heading: Element) => Element): Element[][] {
  const level = (b?: Element) => Number(/^H([1-6])$/.exec(b?.tagName ?? '')?.[1] ?? 9);
  const out: Element[][] = [];
  for (const s of deck) {
    const head = level(s[0]) < 9 ? s[0] : null;
    // the subheadings are the biggest headings under the slide's own
    const subs = Math.min(9, ...s.slice(head ? 1 : 0).map(level).filter((l) => l > level(head ?? undefined) || !head));
    let sub: Element | null = null;
    let now: Element[] = [];
    for (const b of s) {
      if (now.length && !fits([...now, b])) {
        const carried: Element[] = [];
        while (now.length > 1 && level(now.at(-1)) < 9) carried.unshift(now.pop()!);
        out.push(now);
        const newSub = [...carried, b].some((x) => level(x) <= subs);
        now = [...(head ? [again(head)] : []), ...(sub && !newSub ? [again(sub)] : []), ...carried, b];
      } else now.push(b);
      if (b !== head && level(b) === subs) sub = b;
      if (b !== head && level(b) < subs) sub = null;
    }
    out.push(now);
  }
  const hr = (b?: Element) => b?.tagName === 'HR' || (b?.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
  return out.map((s) => { while (hr(s[0])) s.shift(); while (hr(s.at(-1))) s.pop(); return s; }).filter((s) => s.length);
}
