import { mount, unmount } from 'svelte';
import DiagramBlock from '../DiagramBlock.svelte';

type Props = {
  code: string; start: boolean; codeShown: boolean;
  onCode: (code: string, startsChange: boolean) => void; onCodeEdit: () => void; onCodeLeave: () => void; onError: (failed: boolean) => void; onHistory: (redo: boolean) => void;
  onLeave: () => void; onDelete: (focus: boolean) => void;
};

export function mountDiagram(target: HTMLElement, init: Props) {
  const props = $state(init);
  const app = mount(DiagramBlock, { target, props });
  return {
    set(p: Partial<Props>) { Object.assign(props, p); },
    edit: () => app.edit(),
    destroy() { void unmount(app); },
  };
}
