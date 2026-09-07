<script lang="ts">
  /**
   * One tooltip for the whole app. Any element with data-tip="text" (and optionally data-keys="Mod-k")
   * gets it on hover, rendered at body level so panes can't clip it. Classes on the element:
   * tip-up (above), tip-right (right-aligned).
   */
  import { fly } from 'svelte/transition';
  import Keys from './Keys.svelte';

  let tip = $state<{ text: string; keys: string; x: number; y: number; up: boolean; right: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function over(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    clearTimeout(timer);
    if (!el) { tip = null; return; }
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const up = el.classList.contains('tip-up'), right = el.classList.contains('tip-right');
      tip = { text: el.dataset.tip ?? '', keys: el.dataset.keys ?? '', x: right ? r.right : r.left + r.width / 2, y: up ? r.top - 7 : r.bottom + 7, up, right };
    }, 400);
  }
  function out() { clearTimeout(timer); tip = null; }
</script>

<svelte:document onmouseover={over} onmouseout={out} onmousedown={out} onkeydown={out} />

{#if tip}
  <div class="tip" class:up={tip.up} class:right={tip.right} style="left: {tip.x}px; top: {tip.y}px"
    transition:fly={{ y: tip.up ? 3 : -3, duration: 120 }}>
    {tip.text}{#if tip.keys}<Keys keys={tip.keys} dark />{/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed; z-index: 100; pointer-events: none; display: inline-flex; align-items: center; gap: 7px;
    transform: translateX(-50%); background: var(--tip-bg); color: var(--tip-fg);
    font-size: 11.5px; font-weight: 500; line-height: 1; padding: 5px 8px; border-radius: 6px; white-space: nowrap;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .tip.up { transform: translate(-50%, -100%); }
  .tip.right { transform: translateX(-100%); }
  .tip.right.up { transform: translate(-100%, -100%); }
</style>
