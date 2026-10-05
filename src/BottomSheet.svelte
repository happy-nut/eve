<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { pullDown } from './lib/popup';

  /**
   * A phone's sheet from the bottom (the menus, a Select's choices): it slides up, and goes away by a tap on the
   * dim page around it or by being pulled down. No Cancel row: both of those already are one.
   *
   * The transitions are |global: a sheet sits inside its owner's {#if isMobile}, created together with the {#if open}
   * around it, and a local transition only plays when its own block is made — which is why the sheets just appeared.
   */
  let { onclose, children, role = 'dialog', label }: { onclose: () => void; children: Snippet; role?: string; label?: string } = $props();

  // on <body>: a transformed ancestor (the settings panel) would otherwise become what position:fixed is measured from
  const portal = (node: HTMLElement) => { document.body.appendChild(node); return { destroy: () => node.remove() }; };

  let dy = $state(0); // how far the finger has pulled it down
  let dragging = $state(false);

  /** cubic ease-out, as the other sheets (popup.ts); going away it starts from wherever the finger let go */
  const slide = (_: Element) => ({ duration: 240, css: (t: number, u: number) => `translate: 0 calc(${(dy * t).toFixed(1)}px + ${(u * u * u * 100).toFixed(2)}%)` });

  /** pulled down from the top of its scroll, the sheet follows the finger; far or fast enough, it closes */
  const pull = (node: HTMLElement) => pullDown(node, { onpull: (d, on) => { dy = d; dragging = on; }, onclose });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" use:portal transition:fade|global={{ duration: 150 }} style:opacity={dy ? Math.max(0.2, 1 - dy / 400) : null}
  onclick={onclose} role="presentation"></div>
<div class="sheet" use:portal use:pull transition:slide|global {role} aria-label={label}
  class:dragging style:translate={dy ? `0 ${dy}px` : null}>
  {@render children()}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 44; background: rgba(0, 0, 0, 0.3); }
  .sheet {
    position: fixed; z-index: 45; left: 0; right: 0; bottom: 0; margin: 0; padding: 8px 10px calc(12px + var(--bottom, 0px));
    background: var(--bg-pop); border-radius: 20px 20px 0 0; box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
    max-height: 80vh; overflow-y: auto; overscroll-behavior: contain;
    transition: translate 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); /* let go short of closing: it settles back */
  }
  .sheet.dragging { transition: none; }
  .sheet::before { content: ''; display: block; width: 36px; height: 4px; border-radius: 2px; margin: 4px auto 8px; background: var(--bg-active); }
</style>
