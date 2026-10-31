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
 * last line: it goes on with the words under it. A long paragraph (`split` into its sentences) goes on from where the
 * screen ends, as a book's page does, rather than leaving the rest of the screen empty; a short one goes whole. A
 * block taller than the screen on its own is a slide of its own, scrolled through. The note's title is not shown
 * again: it is the cover, not a section's heading. A divider at a slide's edge has nothing to divide there and goes.
 */
export function paginate(deck: Element[][], fits: (blocks: Element[]) => boolean, again: (heading: Element) => Element, split: (b: Element) => Element[] = (b) => [b]): Element[][] {
  const level = (b?: Element) => Number(/^H([1-6])$/.exec(b?.tagName ?? '')?.[1] ?? 9);
  const out: Element[][] = [];
  for (const [n, s] of deck.entries()) {
    // the section's own heading; the note's title, the first section's, is not one to show again
    const top = level(s[0]) < 9 ? s[0] : null, head = n > 0 ? top : null;
    // the subheadings are the biggest headings under the section's own
    const subs = Math.min(9, ...s.slice(top ? 1 : 0).map(level).filter((l) => l > level(top ?? undefined)));
    let sub: Element | null = null;
    let now: Element[] = [];
    const queue = [...s];
    while (queue.length) {
      const b = queue.shift()!;
      if (now.length && !fits(join([...now, b]))) {
        const parts = split(b);
        // a short paragraph goes whole onto the next slide; a long one, or one no screen holds, a sentence at a time
        if (parts.length > 1 && (parts.length >= 4 || !fits([b]))) { queue.unshift(...parts); continue; }
        const carried: Element[] = [];
        while (now.length > 1 && level(now.at(-1)) < 9) carried.unshift(now.pop()!);
        out.push(now);
        const newSub = [...carried, b].some((x) => level(x) <= subs);
        now = [...(head ? [again(head)] : []), ...(sub && !newSub ? [again(sub)] : []), ...carried, b];
      } else now.push(b);
      if (b !== top && level(b) === subs) sub = b;
      if (b !== top && level(b) < subs) sub = null;
    }
    out.push(now);
  }
  const hr = (b?: Element) => b?.tagName === 'HR' || (b?.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
  return out.map((s) => { s = join(s); while (hr(s[0])) s.shift(); while (hr(s.at(-1))) s.pop(); return s; }).filter((s) => s.length);
}

let parts = 0;
/** A paragraph cut after each of its sentences, its bold, links and the like kept; `join` puts pieces side by side back together. */
export function sentences(p: Element): Element[] {
  if (p.tagName !== 'P' || p.hasAttribute('data-part')) return [p];
  const ends: [Text, number][] = [];
  const walk = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let t; (t = walk.nextNode() as Text | null); ) for (const m of t.data.matchAll(/[.!?…。]+["'”’)\]]*(?=\s|$)/g)) ends.push([t, m.index! + m[0].length]);
  const key = String(++parts), r = p.ownerDocument.createRange(), out: Element[] = [];
  const piece = () => {
    const c = p.cloneNode(false) as Element;
    c.append(r.cloneContents());
    // a cut at a bold's or a link's very end leaves an empty one behind on the other side
    for (const e of [...c.querySelectorAll('*')].reverse()) if (!e.textContent && !e.querySelector('img, br, svg') && !/^(IMG|BR|SVG)$/.test(e.tagName)) e.remove();
    c.setAttribute('data-part', key);
    if (c.textContent!.trim()) out.push(c);
  };
  r.setStart(p, 0);
  // (a sentence's stop at the very end of a bold or a link is a stop too: its space is in the next text)
  for (const [t, o] of ends) { r.setEnd(t, o); piece(); r.setStart(t, o); }
  r.setEnd(p, p.childNodes.length);
  piece();
  return out.length > 1 ? out : [p];
}

/** pieces of one paragraph that sit next to each other, one paragraph again */
export function join(blocks: Element[]): Element[] {
  const out: Element[] = [];
  for (const b of blocks) {
    const last = out.at(-1), key = b.getAttribute('data-part');
    if (key && last?.getAttribute('data-part') === key) {
      const both = last.cloneNode(true) as Element;
      both.append(...[...b.childNodes].map((x) => x.cloneNode(true)));
      out[out.length - 1] = both;
    } else out.push(b);
  }
  return out;
}
