import { mount, unmount } from 'svelte';
import DiagramBlock from '../DiagramBlock.svelte';

type Props = {
  code: string; start: boolean; codeShown: boolean;
  onCode: (code: string) => void; onCodeEdit: () => void; onError: (failed: boolean) => void; onHistory: (redo: boolean) => void;
};

/** A mermaid block's drawing and its editing (DiagramBlock.svelte), mounted in its node view; `set` passes it what
 *  the note changed (its code, the caret going into the code). */
export function mountDiagram(target: HTMLElement, init: Props) {
  const props = $state(init);
  const app = mount(DiagramBlock, { target, props });
  return {
    set(p: Partial<Props>) { Object.assign(props, p); },
    destroy() { void unmount(app); },
  };
}
