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
<div class="box" bind:this={box} transition:scale={{ start: 0.94, duration: 160 }} role="dialog">
  <p>{p.message}</p>
  {#if p.input !== undefined}
    <input bind:value use:focus spellcheck="false" />
  {/if}
  <div class="actions">
    <button onclick={() => done(null)}>Cancel</button>
    {#if p.input !== undefined}
      <button class="primary" onclick={() => done(value)}>OK</button>
    {:else}
      <button class="primary" class:danger={p.danger} use:focus onclick={() => done('yes')}>Delete</button>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); z-index: 30; }
  .box {
    position: fixed; z-index: 31; top: 40%; left: 50%; transform: translate(-50%, -50%);
    width: min(360px, 90vw); padding: 16px; border-radius: 12px;
    background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    font-size: 13px;
  }
  p { margin: 0 0 12px; word-break: break-word; }
  input {
    width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; margin-bottom: 12px;
    border: 1px solid var(--line); background: var(--bg-input); color: var(--fg); outline: none;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button {
    font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--bg-input); color: var(--fg);
  }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .primary { border: 0; background: var(--accent); color: #0b0c10; font-weight: 600; }
  .primary.danger { background: #ff453a; color: white; }
</style>
