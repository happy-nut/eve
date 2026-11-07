const SCALE = 2;
/** the card's margin around it, as in the note (a chart's title was at the picture's very edge) */
const PAD = 16;

/**
 * A drawing on screen as a picture: a diagram's SVG (mermaid's, or the lanes Eve draws) or a chart Eve draws as HTML
 * (a pie, a timeline, a Gantt chart). A picture made of it is drawn on its own, without the app's stylesheet, so a
 * copy of it is given each part's styles as they are on screen: it comes out in the note's colours, light or dark.
 * At twice its size, to stay sharp where it is pasted.
 */
export async function pictureOf(el: Element, background: string): Promise<Blob> {
  // drawn at its own size, not the note's: a wide diagram is shrunk to the note, or cut off and scrolled in it
  let width = 0, height = 0;
  const box = el instanceof SVGSVGElement ? el.viewBox.baseVal : null;
  if (box && box.width && box.height) ({ width, height } = box);
  else ({ scrollWidth: width, scrollHeight: height } = el as HTMLElement);
  width = Math.ceil(width);
  height = Math.ceil(height);

  const copy = drawnCopy(el);
  const top = (copy as HTMLElement | SVGElement).style;
  top.margin = '0';
  top.width = `${width}px`;
  top.height = `${height}px`;
  top.maxWidth = 'none';
  top.minWidth = '0';
  const body = new XMLSerializer().serializeToString(copy);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${body}</div></foreignObject></svg>`;

  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = (width + 2 * PAD) * SCALE;
  canvas.height = (height + 2 * PAD) * SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, PAD * SCALE, PAD * SCALE, width * SCALE, height * SCALE);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no picture'))), 'image/png'));
}

/** `el` copied with each part's style as it is on screen once it has drawn itself in: an animation still running is
 *  ended first (copied part way, the picture was a chart half drawn, its boxes faint and its lines short), and the dot
 *  that runs along the lines under the pointer is left out */
export function drawnCopy(el: Element): Element {
  for (const a of el.getAnimations?.({ subtree: true }) ?? []) if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  // copied as it is at rest: not with one box pointed at and the rest stepped back, nor part way back from that
  const focused = el.classList.contains('eve-focus');
  el.classList.remove('eve-focus');
  el.classList.add('eve-still');
  const copy = el.cloneNode(true) as Element;
  styled(el, copy);
  el.classList.remove('eve-still');
  if (focused) el.classList.add('eve-focus');
  copy.classList.remove('eve-still');
  for (const dot of copy.querySelectorAll('.eve-token, .eve-flow')) dot.remove(); // the dot, and the lines' flow (diagramMotion.ts)
  // a line's label is HTML in a foreignObject, its chip a background and shadows round its words: in a picture
  // (the drawing inside the picture's own foreignObject) WebKit drew half of the chip. The chip drawn instead as the
  // drawing's own rectangles behind the words, the words left as they are
  for (const fo of copy.querySelectorAll('.edgeLabel foreignObject')) {
    const chip = fo.querySelector<HTMLElement>('.labelBkg');
    const w = +(fo.getAttribute('width') ?? 0), h = +(fo.getAttribute('height') ?? 0);
    if (!chip || !w || !h) continue;
    const x = +(fo.getAttribute('x') ?? 0), y = +(fo.getAttribute('y') ?? 0), r = parseFloat(chip.style.borderRadius) || 0;
    // `color 0px 0px 0px 4px, …`: each a ring of its colour, the widest under the others
    const rings = [...chip.style.boxShadow.matchAll(/(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+([\d.]+)px/g)].map((m) => ({ color: m[1], out: +m[2] }));
    const layers = [...rings.sort((a, b) => b.out - a.out), { color: chip.style.backgroundColor, out: 0 }].filter((l) => l.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(l.color));
    for (const l of layers) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [k, v] of Object.entries({ x: x - l.out, y: y - l.out, width: w + 2 * l.out, height: h + 2 * l.out, rx: r + l.out })) rect.setAttribute(k, String(v));
      rect.style.fill = l.color;
      rect.style.opacity = '1'; // (mermaid's own .edgeLabel rect is half seen)
      fo.before(rect);
    }
    chip.style.boxShadow = 'none';
    chip.style.background = 'none';
  }
  return copy;
}

// what an SVG part is painted with; the rest of its computed style is its geometry, which its attributes already say
const PAINT = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'opacity', 'color', 'visibility', 'display', 'filter', 'clip-path', 'paint-order',
  'transform', 'transform-origin', 'transform-box', 'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline',
];

/** each part of `copy` given the style its original has on screen (the two walked side by side) */
function styled(from: Element, copy: Element) {
  const cs = getComputedStyle(from);
  const to = (copy as HTMLElement | SVGElement).style;
  if (to) {
    if (from instanceof SVGElement && !(from instanceof SVGSVGElement)) for (const p of PAINT) to.setProperty(p, cs.getPropertyValue(p));
    else for (let i = 0; i < cs.length; i++) to.setProperty(cs[i], cs.getPropertyValue(cs[i]));
  }
  for (let i = 0; i < from.children.length; i++) styled(from.children[i], copy.children[i]);
}
