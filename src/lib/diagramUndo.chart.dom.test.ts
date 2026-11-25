// The ↶ and ↷ walks (diagramUndo.harness.ts) for a chart edited by its parts: a pie.
import { vi } from 'vitest';
import { undoWalks } from './diagramUndo.harness';

const drawn = vi.hoisted(() => ({ code: '' }));
vi.mock('./mermaid', async (orig) => {
  const real = await orig<typeof import('./mermaid')>();
  return { ...real, renderMermaid: (code: string) => { drawn.code = code; return real.renderMermaid(code); } };
});

undoWalks('pie', {
  'a pie': 'pie\n  "Rent" : 50\n  "Food" : 30\n  "Fun" : 20',
}, drawn);
