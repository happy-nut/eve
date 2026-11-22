import { mount, unmount } from 'svelte';
import MathEdit from '../MathEdit.svelte';

export type MathDone = 'after' | 'before' | 'remove' | 'away';
type Props = {
  latex: string;
  display: boolean;
  at?: { x: number; y: number } | null;
  onInput: (latex: string) => void;
  onDone: (how: MathDone) => void;
  onHistory: (redo: boolean) => void;
};
export type MathEditing = { set(latex: string): void; destroy(): void };

export function mountMath(target: HTMLElement, init: Props): MathEditing {
  const props = $state(init);
  const app = mount(MathEdit, { target, props });
  return {
    set(latex: string) { props.latex = latex; },
    destroy() { void unmount(app); },
  };
}
