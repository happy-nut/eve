export interface Follow {
  move: (e: PointerEvent) => void;
  up: (e: PointerEvent) => void;
  cancel?: (e: PointerEvent) => void;
  holdPageScroll?: boolean;
}

export function followPointer({ move, up, cancel = up, holdPageScroll = false }: Follow): () => void {
  const hold = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
  const off = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', hold);
  };
  const onUp = (e: PointerEvent) => { off(); up(e); };
  const onCancel = (e: PointerEvent) => { off(); cancel(e); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  if (holdPageScroll) window.addEventListener('touchmove', hold, { passive: false });
  return off;
}
