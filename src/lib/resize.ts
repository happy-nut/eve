/**
 * The drag handle that sets how wide a picture or a video is drawn. The width lives on the node (and
 * travels in the markdown as `|540` after the name), so it is the note's, not the window's.
 */
export const MIN_WIDTH = 120;

/**
 * Width written into a name: `caption|540` → 540. A caption that itself ends in `|2024` is written `\|2024`
 * (see escapeWidth), which is not a width. Never narrower than a drag can make it: a `|50` once read
 * as a width drew the picture 50px wide.
 */
export function widthOf(text: string | null | undefined): number | null {
  const m = /(?<!\\)\|(\d{2,4})$/.exec(text ?? '');
  return m ? Math.max(MIN_WIDTH, Number(m[1])) : null;
}
/** The name without the width (and a `\|2024` that is part of it back to `|2024`). */
export const nameOf = (text: string | null | undefined) => (text ?? '').replace(/(?<!\\)\|\d{2,4}$/, '').replace(/\\(\|\d{2,4})$/, '$1');
/** A name ending in `|2024` of its own, kept from being read back as a width. */
export const escapeWidth = (name: string) => name.replace(/\|(\d{2,4})$/, '\\|$1');
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
