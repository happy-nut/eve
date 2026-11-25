<script lang="ts">
  import { fade } from 'svelte/transition';
  import { scrimFade } from './lib/motion';

  /**
   * The page under what is open, there to be pressed: a press anywhere on it closes that. The only one of its kind
   * (src/lib/scrimOnly.test.mjs), and it lets go of the pointer the moment it starts to go.
   *
   * `pulled`: how far a sheet over it has been pulled down; it clears as the sheet goes. `portal`: drawn on <body>,
   * beside a popup that is too, out of a transformed panel that position:fixed would otherwise be measured from.
   */
  let { onclose, layer, tint, pulled = 0, portal = false }: {
    onclose: () => void;
    layer: 'panel' | 'sheet' | 'popover' | 'menu';
    tint?: string;
    pulled?: number;
    portal?: boolean;
  } = $props();

  const toBody = (node: HTMLElement, on: boolean) => {
    if (on) document.body.appendChild(node);
    return { destroy: () => { if (on) node.remove(); } };
  };
</script>

<!-- its own outro, |global: Svelte makes an element inert as its own outro starts, and only then, so the next press
     goes to what is under it while it fades; kept only for a neighbour's outro, it would take that press -->
<div class="scrim {layer}-scrim" use:toBody={portal} role="presentation" style:background={tint}
  style:opacity={pulled ? Math.max(0.2, 1 - pulled / 400) : null} transition:fade|global={scrimFade}
  onmousedown={(e) => { e.preventDefault(); onclose(); }}></div>

<style>
  .scrim { position: fixed; inset: 0; }
  .panel-scrim { z-index: var(--z-panel-scrim); }
  .sheet-scrim { z-index: var(--z-sheet-scrim); }
  .popover-scrim { z-index: var(--z-popover-scrim); }
  .menu-scrim { z-index: var(--z-menu-scrim); }
</style>
