// A drawing's motions (drawn in, lines flowing, a part lit under the pointer) are started a moment after it is put on
// the page. A block taken off the page in that moment (the note switched as it drew) started them anyway, on a
// drawing no one would see again, and they were never stopped. (It is held: taken off, the block has no canvas to look in.)
import { test, expect, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import './testEditor';

const started: number[] = [], stopped: number[] = [];
vi.mock('./diagramMotion', async (orig) => {
  const real = await orig<typeof import('./diagramMotion')>();
  const watched = <A extends unknown[]>(f: (...a: A) => () => void) => (...a: A) => {
    const n = started.push(started.length);
    const end = f(...a);
    return () => { stopped.push(n); end(); };
  };
  return { ...real, focus: watched(real.focus), drawIn: watched(real.drawIn), flow: watched(real.flow) };
});

test('a drawing taken off the page as it is put on starts nothing it does not stop', async () => {
  const { default: DiagramBlock } = await import('../DiagramBlock.svelte');
  const target = document.createElement('div');
  document.body.append(target);
  const none = () => {};
  const app = mount(DiagramBlock, { target, props: { code: 'flowchart LR\n  A --> B', start: false, codeShown: false, onCode: none, onCodeEdit: none, onCodeLeave: none, onError: none, onHistory: none, onLeave: none, onDelete: none } });
  // taken off the moment its drawing lands on the page
  await new Promise<void>((done) => {
    new MutationObserver((_, mo) => { if (target.querySelector('svg')) { mo.disconnect(); unmount(app); done(); } }).observe(target, { childList: true, subtree: true });
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(stopped.length).toBe(started.length);
});
