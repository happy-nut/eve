import { mount, unmount } from 'svelte';
import DiagramBlock from '../DiagramBlock.svelte';

type Props = {
  code: string; start: boolean; codeShown: boolean;
  onCode: (code: string) => void; onCodeEdit: () => void; onCodeLeave: () => void; onError: (failed: boolean) => void; onHistory: (redo: boolean) => void;
  onLeave: () => void; onDelete: (focus: boolean) => void;
};

/** A mermaid block's drawing and its editing (DiagramBlock.svelte), mounted in its node view; `set` passes it what
 *  the note changed (its code, the caret going into the code). */
export function mountDiagram(target: HTMLElement, init: Props) {
  const props = $state(init);
  const app = mount(DiagramBlock, { target, props });
  return {
    set(p: Partial<Props>) { Object.assign(props, p); },
    /** opened for editing from the keyboard (↵ on the block selected), as a click opens it */
    edit: () => app.edit(),
    destroy() { void unmount(app); },
  };
}
