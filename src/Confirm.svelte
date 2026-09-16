<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';

  const p = $derived(ui.pending!);
  // give focus back to where it was (sidebar row, editor) the moment the dialog closes —
  // synchronously, before any list re-render, so a later focusRow() can still override it
  const returnTo = document.activeElement as HTMLElement | null;
  function done(v: string | null) { returnTo?.isConnected && returnTo.focus(); ui.done(v); }
  let value = $state('');
  $effect(() => { value = p.input ?? ''; });

  let box: HTMLDivElement;
  // the keypress that opened the dialog (Enter on a / menu item, say) is still travelling to window:
  // it must not count as the answer to a dialog that did not exist when the key went down
  const openedAt = performance.now();
  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.timeStamp < openedAt) return;
    if (e.key === 'Escape') { e.preventDefault(); done(null); }
    if (e.key === 'Enter') { e.preventDefault(); done(p.input !== undefined ? value : 'yes'); }
    if (e.key === 'Tab') { // focus stays inside the dialog
      e.preventDefault();
      const els = [...box.querySelectorAll<HTMLElement>('input, button')];
      els[(els.indexOf(document.activeElement as HTMLElement) + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
    }
  }
  const focus = (el: HTMLElement) => { el.focus(); if (el instanceof HTMLInputElement) el.select(); };
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={() => done(null)} role="presentation"></div>
<div class="box" bind:this={box} transition:scale={{ start: 0.96, duration: 160 }} role="dialog" aria-modal="true">
  <div class="head">
    <span class="mark" class:danger={p.danger && p.input === undefined}>
      {#if p.input !== undefined}
        <svg viewBox="0 0 16 16"><path d="M11.5 2.5 13.5 4.5 6 12H4v-2z"/><path d="M2.5 14h11"/></svg>
      {:else}
        <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9M6.6 6.8v4.4M9.4 6.8v4.4"/></svg>
      {/if}
    </span>
    <p>{p.message}</p>
  </div>
  {#if p.input !== undefined}
    <input bind:value use:focus spellcheck="false" />
  {/if}
  <div class="actions">
    <button onclick={() => done(null)}>Cancel<kbd>esc</kbd></button>
    {#if p.input !== undefined}
      <button class="primary" onclick={() => done(value)}>OK<kbd>↩</kbd></button>
    {:else}
      <button class="primary" class:danger={p.danger} use:focus onclick={() => done('yes')}>Delete<kbd>↩</kbd></button>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: light-dark(rgba(20, 22, 28, 0.18), rgba(0, 0, 0, 0.38)); z-index: 30; }
  .box {
    position: fixed; z-index: 31; top: 38%; left: 50%; transform: translate(-50%, -50%);
    width: min(380px, 90vw); padding: 18px 18px 14px; border-radius: 14px;
    background: var(--bg-pop); box-shadow: 0 0 0 0.5px var(--line), 0 24px 70px rgba(0, 0, 0, 0.28);
    font-size: 13px;
  }
  .head { display: flex; gap: 11px; align-items: flex-start; }
  /* a quiet round badge: the trash for a delete, a pencil when it is asking for text */
  .mark {
    flex: none; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg-input); color: var(--fg-dim);
  }
  .mark.danger { background: light-dark(rgba(255, 69, 58, 0.12), rgba(255, 69, 58, 0.18)); color: #ff453a; }
  .mark svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  p { margin: 4px 0 0; line-height: 1.45; word-break: break-word; }
  input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 8px; margin: 12px 0 0;
    border: 0; background: var(--bg-input); color: var(--fg); outline: none;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 16px; }
  button {
    display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 500;
    padding: 6px 12px; border-radius: 8px; border: 0; background: var(--bg-input); color: var(--fg);
    transition: background 0.12s, transform 0.12s;
  }
  button:hover { background: var(--bg-hover); }
  button:active { transform: scale(0.97); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .primary { background: var(--accent); color: #fff; }
  .primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
  .primary.danger { background: #ff453a; }
  .primary.danger:hover { background: color-mix(in srgb, #ff453a 88%, #000); }
  /* the key that does the same thing, dimmed inside the button */
  kbd {
    font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    background: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.14)); color: inherit; opacity: 0.75;
  }
  .primary kbd { background: rgba(255, 255, 255, 0.22); }
</style>
