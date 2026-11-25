// The ↶ and ↷ walks (diagramUndo.harness.ts) for a flowchart in lanes: its boxes, lines and lanes.
import { vi } from 'vitest';
import { undoWalks } from './diagramUndo.harness';

const drawn = vi.hoisted(() => ({ code: '' }));
vi.mock('./mermaid', async (orig) => {
  const real = await orig<typeof import('./mermaid')>();
  return { ...real, renderMermaid: (code: string) => { drawn.code = code; return real.renderMermaid(code); } };
});

undoWalks('flowchart', {
  'a flowchart in lanes': 'flowchart TD\n  subgraph L1["Customer"]\n    direction TD\n    n1(["Order"])\n  end\n  subgraph L2["Store"]\n    direction TD\n    n2("Pack")\n    n3{"In stock?"}\n  end\n  n1 --> n2\n  n2 --> n3',
}, drawn);
