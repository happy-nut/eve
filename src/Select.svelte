<script lang="ts">
  import { scale } from 'svelte/transition';
  import { popIn } from './lib/motion';
  import { isMobile } from './lib/platform';
  import BottomSheet from './BottomSheet.svelte';
  import Scrim from './Scrim.svelte';
  import { floatAt } from './lib/popup';
  import { claimKeys, PRIORITY } from './lib/keys';

  let { value, options, onchange, onclosed, label = '' }: {
    value: string;
    options: readonly (readonly [string, string])[];
    onchange: (v: string) => void;
    onclosed?: () => void;
    label?: string;
  } = $props();

  let open = $state(false);
  let wasOpen = false;
  $effect(() => { if (wasOpen && !open) onclosed?.(); wasOpen = open; });
  let highlighted = $state(0);
  $effect(() => {
    if (!open || isMobile) return;
    return claimKeys('global', { Escape: (e) => { e.stopPropagation(); close(); return true; } }, { capture: true, priority: PRIORITY.top, composing: true });
  });
  let btn = $state<HTMLButtonElement | null>(null);
  let pos = $state({ left: 0, top: 0, maxHeight: 0, width: 0, up: false });

  // the list lives on <body>: a transformed ancestor (the settings panel) would otherwise become the
  // box its position:fixed is measured from
  const portal = (node: HTMLElement) => { document.body.appendChild(node); return { destroy: () => node.remove() }; };

  const current = $derived(options.find(([id]) => id === value)?.[1] ?? value);

  function show() {
    highlighted = Math.max(0, options.findIndex(([id]) => id === value));
    if (btn && !isMobile) place(Math.max(btn.offsetWidth, 160), options.length * 34 + 8);
    open = true;
  }
  let list = $state<HTMLDivElement | null>(null);
  const option = (i: number) => list?.querySelectorAll<HTMLButtonElement>('[role="option"]')[i];
  $effect(() => { if (open && list) option(highlighted)?.focus(); });
  function moveTo(i: number) { highlighted = i; option(i)?.focus(); }
  function close() { open = false; btn?.focus(); }
  function place(w: number, h: number) {
    if (!btn) return;
    const f = floatAt(btn.getBoundingClientRect(), { w, h }, { align: 'end' });
    pos = { left: f.left, top: f.top, maxHeight: f.maxHeight, width: btn.offsetWidth, up: f.side === 'above' };
  }
  const measured = (node: HTMLElement) => { place(node.offsetWidth, node.scrollHeight); };
  function pick(i: number) {
    close();
    const id = options[i]?.[0];
    if (id !== undefined && id !== value) onchange(id);
  }
  function key(e: KeyboardEvent) {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); }
  }
  function listKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { close(); return; }
    else if (e.key === 'ArrowDown') moveTo((highlighted + 1) % options.length);
    else if (e.key === 'ArrowUp') moveTo((highlighted - 1 + options.length) % options.length);
    else if (e.key === 'Home') moveTo(0);
    else if (e.key === 'End') moveTo(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(highlighted);
    else return;
    e.preventDefault();
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
    <Scrim layer="popover" portal onclose={close} />
    <div class="pop" tabindex="-1" bind:this={list} class:up={pos.up} use:portal use:measured onkeydown={listKey} role="listbox" style="left: {pos.left}px; top: {pos.top}px; max-height: {pos.maxHeight}px; min-width: {Math.max(pos.width, 160) + 10}px"
      transition:scale|global={popIn}>
      {#each options as [id, text], i (id)}
        <button role="option" aria-selected={id === value} class:at={i === highlighted} tabindex="-1"
          onmouseenter={() => moveTo(i)} onmousedown={(e) => e.preventDefault()} onclick={() => pick(i)}>
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

  .pop {
    position: fixed; z-index: var(--z-popover); transform-origin: top right; padding: 4px; overflow-y: auto;
    box-sizing: border-box;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
  }
  .pop.up { transform-origin: bottom right; }
  .pop button {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; border: 0;
    border-radius: var(--row-radius); padding: var(--row-pad); background: none; color: var(--fg); font: inherit; font-size: 13px; text-align: left;
  }
  .pop button.at, .pop button:focus { background: var(--accent-soft); outline: none; }
  .pop svg, .opt svg { color: var(--accent-text); }

  .title { margin: 0 8px 6px; font-size: 13px; font-weight: 600; color: var(--fg-dim); }
  .opt {
    display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 52px; border: 0;
    border-radius: 12px; padding: 0 14px; background: none; color: var(--fg); font: inherit; font-size: 17px; text-align: left;
  }
  .opt:active { background: var(--bg-active); }
  .opt.on { font-weight: 600; }
  .opt svg { width: 20px; height: 20px; }
</style>
