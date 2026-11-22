<script lang="ts">
  import Keys from './Keys.svelte';
  import { claimKeys, PRIORITY } from './lib/keys';

  import { floatAt } from './lib/popup';
  import { onWindowHide } from './lib/platform';

  let tip = $state<{ text: string; keys: string; at: DOMRect; up: boolean; right: boolean; side?: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tipOwner: HTMLElement | null = null;
  let box = $state<HTMLDivElement | null>(null);
  let pos = $state<{ left: number; top: number } | null>(null);
  $effect(() => {
    if (!box || !tip) { pos = null; return; }
    const f = floatAt(tip.at, { w: box.offsetWidth, h: box.offsetHeight },
      { prefer: tip.side ? 'side' : tip.up ? 'above' : 'below', align: tip.right ? 'end' : 'center', gap: 7, avoid: { top: 8, right: 8, bottom: 8, left: 8 } });
    pos = { left: f.left, top: f.top };
  });

  function over(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el === tipOwner) return;
    clearTimeout(timer);
    tipOwner = el;
    if (!el) { tip = null; return; }
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const up = el.classList.contains('tip-up'), right = el.classList.contains('tip-right'), side = el.classList.contains('tip-side');
      tip = { text: el.dataset.tip ?? '', keys: el.dataset.keys ?? '', at: r, up, right, side };
    }, 400);
  }
  function out(e?: MouseEvent) {
    if (e && tipOwner && e.relatedTarget instanceof Node && tipOwner.contains(e.relatedTarget)) return;
    clearTimeout(timer); tip = null; tipOwner = null;
  }
  $effect(() => claimKeys('global', { '*': () => out() }, { capture: true, priority: PRIORITY.watch, composing: true }));
  $effect(() => onWindowHide(() => out()));
</script>

<!-- controls can vanish under a still pointer (e.g. the group tools folding away): re-check hover on movement -->
<svelte:document onmouseover={over} onmouseout={out} onmousedown={() => out()}
  onmousemove={() => tipOwner && !tipOwner.matches(':hover') && out()} onscrollcapture={() => out()} onvisibilitychange={() => out()} />
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
