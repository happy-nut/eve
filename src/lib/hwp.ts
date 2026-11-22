import { assetName, assets } from './platform';

let pending: Promise<(bytes: Uint8Array) => Pages> | null = null;

export interface Pages {
  count: number;
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
    const rhwp = import.meta.env.TAURI_ENV_PLATFORM === 'android' ? null : await import('@rhwp/core');
    if (!rhwp) throw new Error('Hangul documents open on the Mac');
    await rhwp.default();
    return (bytes: Uint8Array) => {
      const doc = new rhwp.HwpDocument(bytes);
      return { count: doc.pageCount(), page: (i: number) => doc.renderPageSvg(i) };
    };
  })().catch((e) => {
    pending = null;
    throw e;
  }));
}

export async function hwpPages(src: string): Promise<Pages> {
  const name = assetName(src);
  if (!name) throw new Error('not a stored file');
  const [open, bytes] = await Promise.all([loader(), assets.read(name)]);
  return open(bytes);
}
