<script lang="ts">
  /**
   * One tooltip for the whole app. Any element with data-tip="text" (and optionally data-keys="Mod-k")
   * gets it on hover, rendered at body level so panes can't clip it. Classes on the element:
   * tip-up (above), tip-right (right-aligned).
   */
  import Keys from './Keys.svelte';
  import { claimKeys, PRIORITY } from './lib/keys';

  import { floatAt } from './lib/popup';

  let tip = $state<{ text: string; keys: string; at: DOMRect; up: boolean; right: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: HTMLElement | null = null; // element the tooltip belongs to
  let box = $state<HTMLDivElement | null>(null);
  let pos = $state<{ left: number; top: number } | null>(null);
  // placed once its size is known, kept inside the window: a tip centred under a control at its right edge (the
  // calendar's ›) ran off it, and one under a control at the window's foot went under it — it goes over it then.
  // Only the window's edge is kept clear: a tip in the title strip is the toolbar's own.
  $effect(() => {
    if (!box || !tip) { pos = null; return; }
    const f = floatAt(tip.at, { w: box.offsetWidth, h: box.offsetHeight },
      { prefer: tip.up ? 'above' : 'below', align: tip.right ? 'end' : 'center', gap: 7, avoid: { top: 8, right: 8, bottom: 8, left: 8 } });
    pos = { left: f.left, top: f.top };
  });

  function over(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el === current) return; // moving between children of the same control: keep it still
    clearTimeout(timer);
    current = el;
    if (!el) { tip = null; return; }
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const up = el.classList.contains('tip-up'), right = el.classList.contains('tip-right');
      tip = { text: el.dataset.tip ?? '', keys: el.dataset.keys ?? '', at: r, up, right };
    }, 400);
  }
  function out(e?: MouseEvent) {
    // only when the pointer really leaves the control (not when it crosses into a child)
    if (e && current && e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) return;
    clearTimeout(timer); tip = null; current = null;
  }
  // any key puts it away, whoever takes the key
  $effect(() => claimKeys('global', { '*': () => out() }, { capture: true, priority: PRIORITY.watch, composing: true }));
</script>

<!-- controls can vanish under a still pointer (e.g. the group tools folding away): re-check hover on movement -->
<svelte:document onmouseover={over} onmouseout={out} onmousedown={() => out()}
  onmousemove={() => current && !current.matches(':hover') && out()} onscrollcapture={() => out()} onvisibilitychange={() => out()} />
<svelte:window onblur={() => out()} onmouseout={(e) => !e.relatedTarget && out()} />

{#if tip}
  <!-- CSS intro only: a Svelte outro can stall when the window is hidden mid-animation and leave a ghost tip -->
  <div class="tip" bind:this={box} style="left: {pos?.left ?? 0}px; top: {pos?.top ?? 0}px" style:visibility={pos ? null : 'hidden'}>
    {tip.text}{#if tip.keys}<Keys keys={tip.keys} />{/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed; z-index: var(--z-tooltip); pointer-events: none; display: inline-flex; align-items: center; gap: 7px;
    background: var(--tip-bg); color: var(--tip-fg);
    font-size: 11.5px; font-weight: 500; line-height: 1; padding: 5px 8px; border-radius: 6px; white-space: nowrap;
    box-shadow: 0 0 0 0.5px var(--line), 0 6px 18px rgba(0, 0, 0, 0.14);
    animation: tip-in 0.12s ease-out;
  }
  @keyframes tip-in { from { opacity: 0; } }
</style>
