import { assets } from './platform';

/**
 * A .hwp / .hwpx read straight in the app, by rhwp — a Rust parser compiled to WebAssembly that lays
 * the document out and hands back one SVG per page. Quick Look cannot help here: macOS ships no
 * generator for the format, so without this a .hwp card would only ever offer "open outside", and on
 * a Mac without Hancom Office there is nothing outside to open it with either.
 *
 * The 10 MB of WebAssembly is imported only when a .hwp is actually opened, so the app still starts
 * without paying for a format most notes never contain.
 */
let pending: Promise<(bytes: Uint8Array) => Pages> | null = null;

export interface Pages {
  count: number;
  /** One page as an SVG document, laid out at its real paper size. */
  page(i: number): string;
}

/** rhwp measures every run of text through the host, which in a webview means a canvas. */
function measurer() {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (font: string, text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

function loader(): Promise<(bytes: Uint8Array) => Pages> {
  return (pending ??= (async () => {
    (globalThis as any).measureTextWidth = measurer();
    const rhwp = await import('@rhwp/core');
    await rhwp.default();
    return (bytes: Uint8Array) => {
      const doc = new rhwp.HwpDocument(bytes);
      return { count: doc.pageCount(), page: (i: number) => doc.renderPageSvg(i) };
    };
  })().catch((e) => {
    pending = null; // a failed load must not poison the next attempt
    throw e;
  }));
}

/** Every page of a stored .hwp as SVG. Throws when the file is not one rhwp can read. */
export async function hwpPages(src: string): Promise<Pages> {
  const name = /^assets\//.test(src) ? src.slice('assets/'.length) : null;
  if (!name) throw new Error('not a stored file');
  const [open, bytes] = await Promise.all([loader(), assets.read(name)]);
  return open(bytes);
}
