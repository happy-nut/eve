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

// floatAt, which every menu, list, bar and tip is placed by, over the same windows: from anchors all over the room
// (a word, a button, the point a click was at), each way it can prefer, free or kept within a container (a diagram's
// canvas, the band between the lines around a table). It stays inside the window less its bars, inside the container,
// and off what it is for — but for its one way out, small in that thing's own corner.
const { floatAt, screenInsets } = await import('./popup');
for (const [name, w, h, mobile] of WINDOWS) {
  test(`${name}: floatAt keeps inside the room and off its anchor`, () => {
    size = { w, h }; phone.on = mobile;
    const ins = screenInsets();
    const room = { left: ins.left, top: ins.top, right: w - ins.right, bottom: h - ins.bottom };
    const containers = [
      undefined,
      { left: room.left + 20, top: room.top + 10, right: Math.min(room.right, room.left + 520), bottom: Math.min(room.bottom, room.top + 260) },
      { left: -Infinity, top: room.top + (room.bottom - room.top) / 3, right: Infinity, bottom: room.bottom - 6 },
    ];
    const problems: string[] = [];
    for (const within of containers) {
      const r = within ? { left: Math.max(room.left, within.left), top: Math.max(room.top, within.top), right: Math.min(room.right, within.right), bottom: Math.min(room.bottom, within.bottom) } : room;
      if (r.bottom - r.top < 24 || r.right - r.left < 60) continue;
      for (const fy of [0, 0.1, 0.5, 0.9, 1]) {
        for (const fx of [0, 0.5, 1]) {
          const x = r.left + (r.right - r.left - 40) * fx, y = r.top + (r.bottom - r.top - 20) * fy;
          for (const anchor of [new DOMRect(x, y, 40, 20), { x: x + 20, y: y + 10 }]) {
            for (const [bw, bh] of [[180, 34], [240, 300], [Math.min(480, r.right - r.left), 40]]) {
              for (const prefer of ['below', 'above', 'side'] as const) {
                for (const align of ['start', 'center', 'end'] as const) {
                  const f = floatAt(anchor, { w: bw, h: bh }, { prefer, within, align, gap: 8 });
                  const b = { left: f.left, top: f.top, right: f.left + bw, bottom: f.top + Math.min(bh, f.maxHeight) };
                  const at = `${within ? 'within ' + JSON.stringify(within) : 'free'} anchor ${JSON.stringify(anchor)} ${bw}×${bh} ${prefer} ${align} → ${f.side} ${JSON.stringify(b)}`;
                  const e = 0.01;
                  if (b.left < r.left - e || b.right > r.right + e || b.top < r.top - e || b.bottom > r.bottom + e) problems.push(`${at}: outside the room ${JSON.stringify(r)}`);
                  const a = 'left' in anchor ? anchor : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
                  const over = b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top;
                  if (over && f.side !== 'inside') problems.push(`${at}: over its anchor`);
                  if (f.side === 'inside' && !within) problems.push(`${at}: inside with nothing to keep within`);
                }
              }
            }
          }
        }
      }
    }
    expect(problems.slice(0, 8)).toEqual([]);
  });
}

test('floatAt takes the side it prefers when that fits, else the other, and within a container its corner last', () => {
  size = { w: 1000, h: 800 }; phone.on = false;
  const a = new DOMRect(100, 400, 80, 30);
  expect(floatAt(a, { w: 200, h: 100 }).side).toBe('below');
  expect(floatAt(a, { w: 200, h: 100 }, { prefer: 'above' }).side).toBe('above');
  expect(floatAt(a, { w: 200, h: 100 }, { prefer: 'side' }).side).toBe('right');
  // the table's rule: over it if that is free, under it if that is, else small in its corner
  const band = (top: number, bottom: number) => ({ left: -Infinity, right: Infinity, top, bottom });
  expect(floatAt(a, { w: 200, h: 30 }, { prefer: 'above', within: band(300, 500) }).side).toBe('above');
  expect(floatAt(a, { w: 200, h: 30 }, { prefer: 'above', within: band(390, 500) }).side).toBe('below');
  expect(floatAt(a, { w: 200, h: 30 }, { prefer: 'above', within: band(390, 440) }).side).toBe('inside');
  // as far off as the room lets it be, up to the gap
  expect(floatAt(a, { w: 200, h: 30 }, { prefer: 'above', within: band(365, 500), gap: 8 }).top).toBe(400 - 4 - 30);
});
