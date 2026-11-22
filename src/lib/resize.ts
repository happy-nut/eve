export const MIN_WIDTH = 120;

export function widthOf(text: string | null | undefined): number | null {
  const m = /(?<!\\)\|(\d{2,4})$/.exec(unAligned(text));
  return m ? Math.max(MIN_WIDTH, Number(m[1])) : null;
}

export type Align = 'center' | 'right';
const ALIGN = /(?<!\\)\|(center|right)$/;
export const alignOf = (text: string | null | undefined): Align | null => (ALIGN.exec(text ?? '')?.[1] as Align | undefined) ?? null;
const unAligned = (text: string | null | undefined) => (text ?? '').replace(ALIGN, '');
export const withAlign = (name: string, align: string | null | undefined) => (align === 'center' || align === 'right' ? `${name}|${align}` : name);

export const nameOf = (text: string | null | undefined) =>
  unAligned(text).replace(/(?<!\\)\|\d{2,4}$/, '').replace(/\\(\|\d{2,4})$/, '$1').replace(/\\(\|(?:center|right))$/, '$1');
export const escapeWidth = (name: string) => name.replace(/\|(\d{2,4})$/, '\\|$1').replace(/\|(center|right)$/, '\\|$1');
export const withWidth = (name: string, width: number | null | undefined) => (width ? `${name}|${width}` : name);

function roomFor(media: HTMLElement): number {
  const tip = media.closest<HTMLElement>('.tiptap'), frame = media.closest<HTMLElement>('.img-fig');
  if (!tip) return Infinity;
  const pad = getComputedStyle(tip);
  const column = tip.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const pane = tip.closest<HTMLElement>('.editor')?.clientWidth;
  if (!frame || frame.parentElement !== tip || !pane) return column;
  const side = (pane - column) / 2 - 24;
  return Math.max(column, frame.dataset.align === 'center' ? column + 2 * side : column + side);
}

export function sizeGrip(media: HTMLElement, commit: (width: number | null) => void): HTMLElement {
  const grip = document.createElement('span');
  grip.className = 'size-grip';
  grip.contentEditable = 'false';

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = media.getBoundingClientRect().width;
    const column = roomFor(media);
    let moved = false;
    const move = (m: PointerEvent) => {
      if (m.clientX === x0) return;
      moved = true;
      media.style.width = `${Math.round(Math.min(column, Math.max(MIN_WIDTH, w0 + (m.clientX - x0))))}px`;
    };
    const up = () => {
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      if (moved) commit(Math.round(media.getBoundingClientRect().width));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  grip.addEventListener('dblclick', (e) => {
    e.preventDefault();
    media.style.width = '';
    commit(null);
  });

  return grip;
}
