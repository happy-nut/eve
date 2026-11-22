<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { sheet, lastShown } from './lib/popup';
  import { claimKeys } from './lib/keys';
  import { copyText } from './lib/platform';

  const p = $derived.by(lastShown(() => ui.pending));
  const done = (v: string | null) => ui.done(v);
  let value = $state('');
  $effect(() => { value = p.input ?? ''; });
  const found = $derived(p.choices ? p.choices(value) : []);
  const address = (v: string) => /[./:#]/.test(v.trim());
  let picked = $state(0);
  $effect(() => { picked = found.length && !address(value) ? 0 : -1; });

  let copied = $state(false);
  const copy = async () => { await copyText(p.command ?? ''); copied = true; setTimeout(() => (copied = false), 1500); };

  let box: HTMLDivElement;
  const appear = (node: Element) => sheet(node, (n) => scale(n, panelIn));
  let input = $state<HTMLInputElement>();
  let yes = $state<HTMLButtonElement>();
  $effect(() => {
    if (!ui.pending) return;
    const el = input ?? yes;
    el?.focus();
    if (el instanceof HTMLInputElement) tick().then(() => el.select());
  });
  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); done(null); }
    if (found.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      picked = Math.max(-1, Math.min(found.length - 1, picked + (e.key === 'ArrowDown' ? 1 : -1)));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (picked >= 0 && found[picked] && document.activeElement?.tagName === 'INPUT') { done(found[picked].value); return; }
      const on = document.activeElement;
      if (on instanceof HTMLButtonElement && box.contains(on)) on.click();
      else done(p.input !== undefined ? value : 'yes');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const els = [...box.querySelectorAll<HTMLElement>('input, button')];
      els[(els.indexOf(document.activeElement as HTMLElement) + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
    }
  }
  $effect(() => {
    if (!ui.pending) return;
    return claimKeys('global', { '*': onKey }, { whileTop: 'confirm', onlyKeysAfterClaim: true });
  });
</script>


<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => done(null)} role="presentation"></div>
<div class="box" bind:this={box} transition:appear|global role="dialog" aria-modal="true">
  <div class="head">
    <span class="mark" class:danger={p.danger && p.input === undefined}>
      {#if p.input !== undefined}
        <svg viewBox="0 0 16 16"><path d="M11.5 2.5 13.5 4.5 6 12H4v-2z"/><path d="M2.5 14h11"/></svg>
      {:else if !p.danger}
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.6M8 5.2h.01"/></svg>
      {:else}
        <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9M6.6 6.8v4.4M9.4 6.8v4.4"/></svg>
      {/if}
    </span>
    <p>{p.message}</p>
  </div>
  {#if p.command}
    <div class="cmd"><code>{p.command}</code><button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
  {/if}
  {#if p.input !== undefined}
    <input bind:this={input} bind:value spellcheck="false" placeholder={p.placeholder ?? ''} />
    {#if found.length}
      <div class="found" role="listbox" aria-label="Found">
        {#each found as f, i (f.value)}
          <button class="choice" class:on={i === picked} role="option" aria-selected={i === picked} tabindex="-1"
            onmousedown={(e) => e.preventDefault()} onmouseenter={() => (picked = i)} onclick={() => done(f.value)}>
            <span class="ico">{f.icon || '📄'}</span><span class="label">{f.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
  <div class="actions">
    {#if !p.alert}<button onclick={() => done(null)}>Cancel<kbd>Esc</kbd></button>{/if}
    {#if p.input !== undefined}
      <button class="primary" onclick={() => done(value)}>OK<kbd>↩</kbd></button>
    {:else}
      <button class="primary" class:danger={p.danger} bind:this={yes} onclick={() => done('yes')}>{p.yes ?? (p.danger ? 'Delete' : 'OK')}<kbd>↩</kbd></button>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: var(--z-sheet-scrim); }
  .box {
    position: fixed; z-index: var(--z-sheet); top: 38%; left: 50%; transform: translate(-50%, -50%);
    width: min(380px, 90vw); padding: 18px 18px 14px; border-radius: var(--panel-radius);
    background: var(--bg-pop); box-shadow: var(--panel-shadow);
    font-size: 13px;
  }
  .head { display: flex; gap: 11px; align-items: flex-start; }
  .mark {
    flex: none; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg-input); color: var(--fg-dim);
  }
  .mark.danger { background: light-dark(rgba(255, 69, 58, 0.12), rgba(255, 69, 58, 0.18)); color: #ff453a; }
  .mark svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  p { margin: 4px 0 0; line-height: 1.45; word-break: break-word; white-space: pre-line; }
  .cmd { display: flex; align-items: center; gap: 6px; margin: 12px 0 0 39px; padding: 4px 4px 4px 9px; border-radius: 8px; background: var(--bg-input); }
  .cmd code { flex: 1; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; user-select: text; -webkit-user-select: text; overflow-wrap: anywhere; }
  .cmd button { padding: 4px 10px; background: var(--bg-pop); }
  input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 8px; margin: 12px 0 0;
    border: 0; background: var(--bg-input); color: var(--fg); outline: none;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .found { display: flex; flex-direction: column; gap: 1px; margin-top: 6px; }
  .choice { justify-content: flex-start; gap: 8px; padding: 5px 8px; background: none; font-weight: 400; text-align: left; }
  .choice.on { background: var(--bg-hover); }
  .choice:active { transform: none; }
  .choice .ico { flex: none; width: 18px; text-align: center; }
  .choice .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 16px; }
  button {
    display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 500;
    padding: 6px 12px; border-radius: 8px; border: 0; background: var(--bg-input); color: var(--fg);
    transition: background 0.12s, transform 0.12s;
  }
  button:hover { background: var(--bg-hover); }
  button:active { transform: scale(0.97); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .primary { background: var(--accent); color: var(--on-accent); }
  .primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
  .primary.danger { background: #ff453a; }
  .primary.danger:hover { background: color-mix(in srgb, #ff453a 88%, #000); }
  kbd {
    font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    background: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.14)); color: inherit; opacity: 0.75;
  }
  .primary kbd { background: rgba(255, 255, 255, 0.22); }
</style>
