<script lang="ts">
  import { scale, fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { isMobile } from './lib/platform';
  import { ui, type MenuItem } from './lib/ui.svelte';
  import { prettyKeys } from './lib/shortcuts.svelte';
  import { hints } from './lib/hints.svelte';

  // the app's own right-click menu (the webview's is suppressed): App renders it, anyone opens it
  // through ui.openMenu. Keyboard-reachable like the "+" dropdown — the mouse moves the highlight.
  const req = $derived(ui.menu!);
  let el = $state<HTMLUListElement | null>(null);
  let x = $state(0), y = $state(0);

  // placed at the pointer, then pulled back inside the window once its size is known
  $effect(() => {
    const m = ui.menu;
    if (!m) return;
    x = m.x; y = m.y;
    const r = el?.getBoundingClientRect();
    if (!r) return;
    if (m.x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (m.y + r.height > window.innerHeight - 8) y = Math.max(8, m.y - r.height);
  });

  function pick(it: MenuItem) {
    ui.closeMenu();
    it.run?.();
    if (it.keys) hints.show('menu:' + it.label, `${it.label.replace(/…$/, '')} has a shortcut`, it.keys);
  }
  function onKey(e: KeyboardEvent) {
    const items = [...(el?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Escape') ui.closeMenu();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  const autofocus = (node: HTMLElement) => node.focus();
  // WebKit does not focus a clicked button, it blurs the menu — which would close it mid-click
  const hold = (e: MouseEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); };
</script>

{#if isMobile}
  <!-- a phone: the same items as a sheet from the bottom, rows a thumb can hit -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 150 }} onclick={() => ui.closeMenu()} role="presentation"></div>
  <ul class="sheet" role="menu" transition:fly={{ y: 320, duration: 240, easing: cubicOut }}>
    {#each req.items as it, i (i)}
      <li role="none" class:sep={it.sep}>
        <button role="menuitem" class:danger={it.danger} disabled={it.disabled} onclick={() => pick(it)}>{it.label}</button>
      </li>
    {/each}
    <li role="none" class="sep"><button role="menuitem" class="cancel" onclick={() => ui.closeMenu()}>Cancel</button></li>
  </ul>
{:else}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={() => ui.closeMenu()} oncontextmenu={(e) => { e.preventDefault(); ui.closeMenu(); }}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul bind:this={el} class="menu" role="menu" tabindex="-1" use:autofocus style="left: {x}px; top: {y}px"
  transition:scale={{ start: 0.94, duration: 110 }} onkeydown={onKey}>
  {#each req.items as it, i (i)}
    <li role="none" class:sep={it.sep}>
      <button role="menuitem" class:danger={it.danger} disabled={it.disabled}
        onmousedown={hold} onmouseenter={(e) => e.currentTarget.focus()} onclick={() => pick(it)}>
        <span class="label">{it.label}</span>{#if it.keys}<kbd>{prettyKeys(it.keys)}</kbd>{/if}
      </button>
    </li>
  {/each}
</ul>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 44; background: rgba(0, 0, 0, 0.3); }
  .sheet {
    position: fixed; z-index: 45; left: 0; right: 0; bottom: 0; margin: 0; list-style: none;
    padding: 8px 10px calc(12px + var(--bottom, 0px)); background: var(--bg-pop); border-radius: 20px 20px 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18); max-height: 80vh; overflow-y: auto;
  }
  .sheet::before { content: ''; display: block; width: 36px; height: 4px; border-radius: 2px; margin: 4px auto 8px; background: var(--bg-active); }
  .sheet button {
    width: 100%; min-height: 52px; border: 0; border-radius: 12px; background: none; color: var(--fg);
    font: inherit; font-size: 17px; text-align: left; padding: 0 14px;
  }
  .sheet button:active { background: var(--bg-active); }
  .sheet button:disabled { color: var(--fg-dim); }
  .sheet button.danger { color: #ff453a; }
  .sheet button.cancel { text-align: center; font-weight: 600; color: var(--fg-dim); }
  .sheet li.sep { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  .backdrop { position: fixed; inset: 0; z-index: 44; }
  .menu {
    position: fixed; z-index: 45; min-width: 184px; max-width: 280px; list-style: none; margin: 0; padding: 4px;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    transform-origin: top left; outline: none;
  }
  .menu button {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px;
    border: 0; background: none; color: inherit; font: inherit; font-size: 13px;
    padding: 6px 8px; border-radius: 5px; text-align: left; white-space: nowrap;
  }
  .menu .label { overflow: hidden; text-overflow: ellipsis; }
  .menu kbd { flex: none; color: var(--fg-dim); font: inherit; font-size: 11.5px; }
  .menu button:focus { background: var(--accent-soft); outline: none; }
  .menu button:disabled { color: var(--fg-dim); }
  .menu button.danger { color: #ff453a; }
  .menu button.danger:focus { background: light-dark(rgba(255, 69, 58, 0.12), rgba(255, 69, 58, 0.18)); }
  .menu li.sep { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--line); }
</style>
