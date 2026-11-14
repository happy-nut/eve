// A PDF card's first-page picture is a blob URL held in memory until it is let go. A card gone before its picture
// came (the note switched while Quick Look was still drawing it) kept the picture for good.
import { test, expect, vi } from 'vitest';

let resolveThumb: (u: string) => void = () => {};
vi.mock('./platform', async (orig) => ({
  ...(await orig<typeof import('./platform')>()),
  pdfThumb: () => new Promise<string>((r) => { resolveThumb = r; }),
}));

test("a card put away before its picture came lets the picture go when it comes", async () => {
  // on screen at once, as a card at the top of a note
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
    observe() { this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const { Pdf } = await import('./pdf');
  const make = (Pdf.config.addNodeView as () => (p: unknown) => { destroy(): void }).call({});
  const view = make({ node: { attrs: { src: 'assets/a.pdf', name: 'a.pdf' } } });
  view.destroy(); // the note switched while the picture was being drawn
  resolveThumb('blob:late');
  await new Promise((r) => setTimeout(r, 0));
  expect(revoke).toHaveBeenCalledWith('blob:late');
  vi.unstubAllGlobals();
});
