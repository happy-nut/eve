<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { lastShown } from './lib/popup';

  const req = $derived.by(lastShown(() => ui.photo));
  let box: HTMLDivElement;
  let picture: HTMLImageElement;

  onMount(() => box.focus());

  function openMenu(e: MouseEvent) {
    if (e.target !== picture || !req.menu) return false;
    e.preventDefault();
    e.stopPropagation();
    req.menu(e);
    return true;
  }

  const isMenuKey = (e: KeyboardEvent) => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');

  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (req.menu && isMenuKey(e)) {
      e.preventDefault();
      const r = picture.getBoundingClientRect();
      req.menu({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    } else if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); ui.closeImage(); }
    else if (e.key === 'Tab') e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="viewer" bind:this={box} role="dialog" aria-label={req.alt || 'Picture'} tabindex="-1"
  transition:fade|global={scrimFade} onkeydown={onKey} onclick={(e) => { if (!openMenu(e)) ui.closeImage(); }} oncontextmenu={openMenu}>
  <img bind:this={picture} src={req.src} alt={req.alt} class:menu={!!req.menu} transition:scale|global={panelIn} />
  {#if req.alt}<p class="cap">{req.alt}</p>{/if}
</div>

<style>
  .viewer {
    position: fixed; inset: 0; z-index: var(--z-photo); display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: calc(24px + var(--top, 0px)) 24px calc(24px + var(--bottom, 0px)); box-sizing: border-box;
    background: rgba(0, 0, 0, 0.86); outline: none; cursor: zoom-out;
  }
  img { flex: 1; min-height: 0; width: 100%; object-fit: contain; }
  img.menu { cursor: pointer; }
  .cap { margin: 0; max-width: 680px; color: rgba(255, 255, 255, 0.82); font-size: 13.5px; line-height: 1.4; text-align: center; }
</style>
