<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { held } from './lib/popup';

  /**
   * A picture from a note, full size over everything: a double-click on it, or ↩ with it selected.
   * It goes away by a click or tap beside it, Esc, ↩ or Space again, or a phone's back; a click (or a right-click)
   * on the picture itself opens its menu, as it does in the note.
   */
  const req = $derived.by(held(() => ui.photo));
  let box: HTMLDivElement;

  // the keyboard comes here, so Esc closes this and not the card the picture sits in
  onMount(() => box.focus());

  function onPicture(e: MouseEvent) {
    if (!req.menu) return; // nothing to offer: a click anywhere closes it, as before
    e.preventDefault();
    e.stopPropagation();
    req.menu(e);
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation(); // nothing behind it acts on a key while it is up
    if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); ui.closeImage(); }
    else if (e.key === 'Tab') e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="viewer" bind:this={box} role="dialog" aria-label={req.alt || 'Picture'} tabindex="-1"
  transition:fade|global={scrimFade} onkeydown={onKey} onclick={() => ui.closeImage()}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <img src={req.src} alt={req.alt} class:menu={!!req.menu} transition:scale|global={panelIn} onclick={onPicture} oncontextmenu={onPicture} />
  {#if req.alt}<p class="cap">{req.alt}</p>{/if}
</div>

<style>
  .viewer {
    position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: calc(24px + var(--top, 0px)) 24px calc(24px + var(--bottom, 0px)); box-sizing: border-box;
    background: rgba(0, 0, 0, 0.86); outline: none; cursor: zoom-out;
  }
  /* as large as the screen holds, a small picture grown to it too: the box fills, the picture keeps its shape inside */
  img { flex: 1; min-height: 0; width: 100%; object-fit: contain; }
  img.menu { cursor: pointer; }
  .cap { margin: 0; max-width: 680px; color: rgba(255, 255, 255, 0.82); font-size: 13.5px; line-height: 1.4; text-align: center; }
</style>
