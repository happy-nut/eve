// The ↶ and ↷ walks (diagramUndo.harness.ts) for a flowchart: its boxes and lines, and lanes made from the dock.
import { vi } from 'vitest';
import { undoWalks } from './diagramUndo.harness';

const drawn = vi.hoisted(() => ({ code: '' }));
vi.mock('./mermaid', async (orig) => {
  const real = await orig<typeof import('./mermaid')>();
  return { ...real, renderMermaid: (code: string) => { drawn.code = code; return real.renderMermaid(code); } };
});

undoWalks('flowchart', {
  'a flowchart': 'flowchart LR\n  n1("Start") --> n2("Ready?")\n  n2 --> n3("Done")',
}, drawn);
