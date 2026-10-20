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

  const copy = el.cloneNode(true) as Element;
  styled(el, copy);
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
