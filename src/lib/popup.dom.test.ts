// Where a popup at the caret goes, over a grid of windows (a narrow Mac window, a phone upright, a phone on its side
// with the keyboard up) and carets (top, middle, bottom, left, right): it stays inside the window, it never covers the
// line being typed on, and it always shows at least three rows. Each of these once failed somewhere nobody had tried.
import { test, expect, vi, beforeEach } from 'vitest';

const phone = vi.hoisted(() => ({ on: false }));
vi.mock('./platform', async (orig) => ({ ...(await orig<typeof import('./platform')>()), get isMobile() { return phone.on; } }));
const { placeAt } = await import('./popup');

const WINDOWS: [string, number, number, boolean][] = [
  ['a narrow Mac window', 760, 520, false],
  ['a big Mac window', 1440, 900, false],
  ['a phone upright', 390, 844, true],
  ['a phone upright, keyboard up', 390, 544, true],
  ['a phone on its side, keyboard up', 844, 200, true],
];
let size = { w: 0, h: 0 };
beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => size.w }); Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => size.h }); });

/** the box a style from placeAt gives a popup of `w` wide that would like to be `want` tall */
function box(style: string, w: number, want: number) {
  const n = (k: string) => { const m = new RegExp(`(?:^|;)\\s*${k}:\\s*(-?[\\d.]+)px`).exec(style); return m ? +m[1] : undefined; };
  const left = n('left')!, maxH = n('max-height')!, h = Math.min(want, maxH);
  const top = n('top') ?? size.h - n('bottom')! - h;
  return { left, top, right: left + w, bottom: top + h, h };
}

for (const [name, w, h, mobile] of WINDOWS) {
  test(`${name}: a popup at any caret stays in the window, off the caret's line, and shows a few rows`, () => {
    size = { w, h }; phone.on = mobile;
    const problems: string[] = [];
    for (const y of [10, 40, h / 3, h / 2, h - 90, h - 40, h - 22]) {
      for (const x of [4, w / 2, w - 30]) {
        const caret = new DOMRect(x, y, 2, 18);
        for (const [pw, want] of [[220, 300], [340, 300], [260, 120]]) {
          const b = box(placeAt(caret, want, pw), pw, want);
          const at = `caret ${Math.round(x)},${Math.round(y)} popup ${pw}×${want}`;
          if (b.left < 0 || b.right > w || b.top < 0 || b.bottom > h) problems.push(`${at}: outside the window ${JSON.stringify(b)}`);
          const overLine = b.left < caret.right && b.right > caret.left && b.top < caret.bottom && b.bottom > caret.top;
          if (overLine) problems.push(`${at}: over the caret's line ${JSON.stringify(b)}`);
          if (b.h < Math.min(want, 110)) problems.push(`${at}: only ${b.h}px tall`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
}
