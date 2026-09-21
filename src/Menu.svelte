<script lang="ts">
  import { scale } from 'svelte/transition';
  import { ui, type MenuItem } from './lib/ui.svelte';
  import { prettyKeys } from './lib/shortcuts.svelte';

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

  function pick(it: MenuItem) { ui.closeMenu(); it.run?.(); }
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

<style>
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
