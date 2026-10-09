import { mount, unmount } from 'svelte';
import MathEdit from '../MathEdit.svelte';

export type MathDone = 'after' | 'before' | 'remove' | 'away';
type Props = {
  latex: string;
  display: boolean;
  onInput: (latex: string) => void;
  /** finished: the caret after or before the formula, the formula removed (emptied and ⌫), or a click elsewhere */
  onDone: (how: MathDone) => void;
  onHistory: (redo: boolean) => void;
};
export type MathEditing = { set(latex: string): void; destroy(): void };

/** A formula's box and its row of parts (MathEdit.svelte), mounted in the formula's node view while it is edited;
 *  `set` passes it what the note changed (an undo, a sync). */
export function mountMath(target: HTMLElement, init: Props): MathEditing {
  const props = $state(init);
  const app = mount(MathEdit, { target, props });
  return {
    set(latex: string) { props.latex = latex; },
    destroy() { void unmount(app); },
  };
}
