import { test, expect, vi } from 'vitest';
import { followPointer } from './followPointer';

const fire = (type: string) => window.dispatchEvent(new PointerEvent(type));

test('the drag follows the pointer until it is let go, then nothing more reaches it', () => {
  const move = vi.fn(), up = vi.fn();
  followPointer({ move, up });
  fire('pointermove');
  fire('pointerup');
  fire('pointermove');
  fire('pointerup');
  expect(move).toHaveBeenCalledTimes(1);
  expect(up).toHaveBeenCalledTimes(1);
});

test('a gesture taken away ends the drag as letting go does, unless it says otherwise', () => {
  const up = vi.fn(), cancel = vi.fn();
  followPointer({ move: () => {}, up });
  fire('pointercancel');
  expect(up).toHaveBeenCalledTimes(1);
  followPointer({ move: () => {}, up, cancel });
  fire('pointercancel');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(up).toHaveBeenCalledTimes(1);
});

test('a finger dragging holds the page still until it is let go', () => {
  const touch = () => { const e = new Event('touchmove', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
  followPointer({ move: () => {}, up: () => {}, holdPageScroll: true });
  expect(touch()).toBe(true);
  fire('pointerup');
  expect(touch()).toBe(false);
});

test('given the press, its element keeps the pointer, and letting go ends the drag even after that element is gone', () => {
  const grip = document.createElement('span');
  document.body.append(grip);
  const kept: number[] = [];
  grip.setPointerCapture = (id) => { kept.push(id); }; // jsdom has no pointer capture
  const up = vi.fn();
  grip.addEventListener('pointerdown', (e) => { followPointer({ press: e, move: () => {}, up }); });
  grip.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
  expect(kept).toEqual([7]);
  grip.remove();
  fire('pointerup');
  expect(up).toHaveBeenCalledTimes(1);
});
