<script lang="ts">
  import { scale } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';

  /** The three ways a pasted link can land, asked right where it was dropped. 1 / 2 / 3, ←→, ↩, Esc. */
  const req = ui.link!;
  const returnTo = document.activeElement as HTMLElement | null;
  let at = $state(0);

  const CHOICES = [
    { id: 'card', label: 'Card', hint: 'preview', icon: '<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M9.5 6h3M9.5 8.4h3M9.5 10.8h2"/><rect x="3.5" y="6" width="4" height="4.8" rx="0.8"/>' },
    { id: 'link', label: 'Link', hint: 'the address', icon: '<path d="M6.4 9.6 9.6 6.4"/><path d="M7.6 4.6 9 3.2a2.5 2.5 0 0 1 3.5 3.5l-1.4 1.4M8.4 11.4 7 12.8a2.5 2.5 0 0 1-3.5-3.5l1.4-1.4"/>' },
    { id: 'both', label: 'Both', hint: 'link + card', icon: '<path d="M2 3.5h12"/><rect x="1.5" y="6" width="13" height="7" rx="1.5"/>' },
  ] as const;

  const pick = (v: (typeof CHOICES)[number]['id'] | null) => {
    ui.linkDone(v);
    if (returnTo?.isConnected) returnTo.focus();
  };

  function onKey(e: KeyboardEvent) {
    const i = ['1', '2', '3'].indexOf(e.key);
    if (i >= 0) { e.preventDefault(); pick(CHOICES[i].id); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); at = (at + 1) % CHOICES.length; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + CHOICES.length - 1) % CHOICES.length; }
    else if (e.key === 'Enter') { e.preventDefault(); pick(CHOICES[at].id); }
    else if (e.key === 'Escape') { e.preventDefault(); pick(null); }
    else return;
    e.stopPropagation();
  }

  const grab = (el: HTMLElement) => el.focus();
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop" onmousedown={() => pick(null)} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="choice" style:left="{req.x}px" style:top="{req.y}px" transition:scale={{ start: 0.94, duration: 130 }}
  role="menu" tabindex="-1" use:grab>
  {#each CHOICES as c, i}
    <button role="menuitem" class:on={at === i} onmouseenter={() => (at = i)} onclick={() => pick(c.id)}>
      <svg viewBox="0 0 16 16">{@html c.icon}</svg>
      <span class="t">{c.label}<small>{c.hint}</small></span>
      <kbd>{i + 1}</kbd>
    </button>
  {/each}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 40; }
  .choice {
    position: fixed; z-index: 41; display: flex; flex-direction: column; gap: 1px; padding: 4px; outline: none;
    background: var(--bg-pop); border-radius: 10px; box-shadow: 0 0 0 0.5px var(--line), 0 12px 32px rgba(0, 0, 0, 0.2);
    transform-origin: top left; min-width: 184px;
  }
  button {
    display: flex; align-items: center; gap: 9px; width: 100%; border: 0; background: none; color: inherit;
    font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; text-align: left;
  }
  button.on { background: var(--accent-soft); }
  svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .t { flex: 1; display: flex; align-items: baseline; gap: 6px; }
  small { color: var(--fg-dim); font-size: 11.5px; }
  kbd {
    font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    background: var(--bg-input); color: var(--fg-dim);
  }
</style>
