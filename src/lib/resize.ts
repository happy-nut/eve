/**
 * The drag handle that sets how wide a picture or a video is drawn. The width lives on the node (and
 * travels in the markdown as `|540` after the name), so it is the note's, not the window's.
 */
export const MIN_WIDTH = 120;

/** Width written into a name: `caption|540` → 540. */
export function widthOf(text: string | null | undefined): number | null {
  const m = /\|(\d{2,4})$/.exec(text ?? '');
  return m ? Number(m[1]) : null;
}
/** The name without the width. */
export const nameOf = (text: string | null | undefined) => (text ?? '').replace(/\|\d{2,4}$/, '');
/** Put the width back on a name for the markdown. */
export const withWidth = (name: string, width: number | null | undefined) => (width ? `${name}|${width}` : name);

/**
 * A grip on the media's right edge. Dragging resizes it live; letting go reports the final width, and
 * a double-click hands it back to its natural size (`null`).
 */
export function sizeGrip(media: HTMLElement, commit: (width: number | null) => void): HTMLElement {
  const grip = document.createElement('span');
  grip.className = 'size-grip';
  grip.contentEditable = 'false';

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId); // the drag survives the pointer crossing the media
    const x0 = e.clientX;
    const w0 = media.getBoundingClientRect().width;
    const column = media.closest('.tiptap')?.getBoundingClientRect().width ?? Infinity;
    const move = (m: PointerEvent) => {
      media.style.width = `${Math.round(Math.min(column, Math.max(MIN_WIDTH, w0 + (m.clientX - x0))))}px`;
    };
    const up = () => {
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      commit(Math.round(media.getBoundingClientRect().width));
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
