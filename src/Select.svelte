<script lang="ts">
  import { scale } from 'svelte/transition';
  import { popIn } from './lib/motion';
  import { isMobile } from './lib/platform';
  import BottomSheet from './BottomSheet.svelte';

  /**
   * A choice among a few, drawn by the app instead of the platform: a popover under the button on the
   * desktop, a sheet from the bottom on a phone. Enter / Space opens it, ↑↓ move, Enter picks, Esc closes.
   */
  let { value, options, onchange, label = '' }: {
    value: string;
    options: readonly (readonly [string, string])[];
    onchange: (v: string) => void;
    label?: string;
  } = $props();

  let open = $state(false);
  let at = $state(0); // the highlighted row while open
  let btn = $state<HTMLButtonElement | null>(null);
  let pos = $state({ left: 0, top: 0, width: 0 });

  // the list lives on <body>: a transformed ancestor (the settings panel) would otherwise become the
  // box its position:fixed is measured from
  const portal = (node: HTMLElement) => { document.body.appendChild(node); return { destroy: () => node.remove() }; };

  const current = $derived(options.find(([id]) => id === value)?.[1] ?? value);

  function show() {
    at = Math.max(0, options.findIndex(([id]) => id === value));
    if (btn && !isMobile) {
      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom > options.length * 34 + 16;
      pos = { left: r.right, top: below ? r.bottom + 4 : r.top - 4, width: r.width };
    }
    open = true;
  }
  function pick(i: number) {
    open = false;
    const id = options[i]?.[0];
    if (id !== undefined && id !== value) onchange(id);
    btn?.focus();
  }
  function key(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); }
      return;
    }
    e.stopPropagation(); // Esc closes this, not the settings around it
    if (e.key === 'Escape') { e.preventDefault(); open = false; btn?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = (at + 1) % options.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = (at - 1 + options.length) % options.length; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(at); }
  }
</script>

<button bind:this={btn} class="select" class:open aria-haspopup="listbox" aria-expanded={open} aria-label={label || undefined}
  onclick={(e) => { e.preventDefault(); if (open) open = false; else show(); }} onkeydown={key}>
  <span class="value">{current}</span>
  <svg viewBox="0 0 16 16"><path d="M4.5 6.5L8 10l3.5-3.5"/></svg>
</button>

{#if open}
  {#if isMobile}
    <BottomSheet onclose={() => (open = false)} role="listbox" label={label || undefined}>
      {#if label}<p class="title">{label}</p>{/if}
      {#each options as [id, text], i (id)}
        <button class="opt" role="option" aria-selected={id === value} class:on={id === value} onclick={() => pick(i)}>
          <span>{text}</span>
          {#if id === value}<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>{/if}
        </button>
      {/each}
    </BottomSheet>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="scrim" use:portal role="presentation" onmousedown={(e) => { e.preventDefault(); open = false; }}></div>
    <div class="pop" use:portal role="listbox" style="left: {pos.left}px; top: {pos.top}px; min-width: {Math.max(pos.width, 160)}px"
      transition:scale|global={popIn}>
      {#each options as [id, text], i (id)}
        <button role="option" aria-selected={id === value} class:at={i === at} tabindex="-1"
          onmouseenter={() => (at = i)} onmousedown={(e) => e.preventDefault()} onclick={() => pick(i)}>
          <span>{text}</span>
          {#if id === value}<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>{/if}
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .select {
    display: inline-flex; align-items: center; gap: 6px; max-width: 220px; border: 0; border-radius: 8px;
    padding: 5px 8px 5px 11px; background: var(--bg-input); color: var(--fg); font: inherit; font-size: 13px;
    cursor: pointer; transition: box-shadow 0.15s, background 0.15s;
  }
  .select:hover { background: var(--bg-active); }
  .select:focus-visible, .select.open { outline: none; box-shadow: 0 0 0 2px var(--accent-soft); }
  .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .select svg { color: var(--fg-dim); transition: transform 0.18s; }
  .select.open svg { transform: rotate(180deg); }

  .scrim { position: fixed; inset: 0; z-index: 40; }

  .pop {
    position: fixed; z-index: 41; transform: translateX(-100%); transform-origin: top right; padding: 4px;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
  }
  .pop button {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; border: 0;
    border-radius: 6px; padding: 7px 10px; background: none; color: var(--fg); font: inherit; font-size: 13px; text-align: left;
  }
  .pop button.at { background: var(--accent-soft); }
  .pop svg, .opt svg { color: var(--accent); }

  .title { margin: 0 8px 6px; font-size: 13px; font-weight: 600; color: var(--fg-dim); }
  .opt {
    display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 52px; border: 0;
    border-radius: 12px; padding: 0 14px; background: none; color: var(--fg); font: inherit; font-size: 17px; text-align: left;
  }
  .opt:active { background: var(--bg-active); }
  .opt.on { font-weight: 600; }
  .opt svg { width: 20px; height: 20px; }
</style>
