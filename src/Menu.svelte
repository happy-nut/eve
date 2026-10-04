<script lang="ts">
  import { scale } from 'svelte/transition';
  import BottomSheet from './BottomSheet.svelte';
  import { isMobile } from './lib/platform';
  import { ui, type MenuItem } from './lib/ui.svelte';
  import { prettyKeys } from './lib/shortcuts.svelte';
  import { hints } from './lib/hints.svelte';
  import { popIn } from './lib/motion';

  // every menu in the app (a right click, the list's "+", a code block's language): App renders it, anyone opens
  // it through ui.openMenu. Keyboard-reachable — the mouse moves the highlight.
  // the last menu opened: closing, it slides away showing what it showed (ui.menu is already null by then)
  let last = ui.menu!;
  const req = $derived.by(() => (last = ui.menu ?? last));
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
  // opened from the keyboard (⌥↩), the first item is ready for ↩; from the mouse, nothing is highlighted
  const autofocus = (node: HTMLElement) => {
    // a long list (a code block's languages) opens at the current choice
    const on = node.querySelector<HTMLElement>('button.on');
    on?.scrollIntoView({ block: 'nearest' });
    const first = document.documentElement.dataset.input === 'keyboard' && (on ?? node.querySelector<HTMLElement>('button:not(:disabled)'));
    (first || node).focus();
  };
  // WebKit does not focus a clicked button, it blurs the menu — which would close it mid-click
  const hold = (e: MouseEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); };
</script>

{#snippet check()}<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>{/snippet}

{#if isMobile}
  <!-- a phone: the same items as a sheet from the bottom, rows a thumb can hit -->
  <BottomSheet onclose={() => ui.closeMenu()}>
    <ul class="items" role="menu">
      {#each req.items as it, i (i)}
        <li role="none" class:sep={it.sep}>
          <button role="menuitem" class:danger={it.danger} class:on={it.checked} disabled={it.disabled} onclick={() => pick(it)}>{it.label}{#if it.checked}{@render check()}{/if}</button>
        </li>
      {/each}
    </ul>
  </BottomSheet>
{:else}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={() => ui.closeMenu()} oncontextmenu={(e) => { e.preventDefault(); ui.closeMenu(); }}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul bind:this={el} class="menu" role="menu" tabindex="-1" use:autofocus style="left: {x}px; top: {y}px"
  transition:scale|global={popIn} onkeydown={onKey}>
  {#each req.items as it, i (i)}
    <li role="none" class:sep={it.sep}>
      <button role="menuitem" class:danger={it.danger} class:on={it.checked} disabled={it.disabled}
        onmousedown={hold} onmouseenter={(e) => e.currentTarget.focus()} onclick={() => pick(it)}>
        <span class="label">{it.label}</span>{#if it.keys}<kbd>{prettyKeys(it.keys)}</kbd>{:else if it.checked}{@render check()}{/if}
      </button>
    </li>
  {/each}
</ul>
{/if}

<style>
  .items { margin: 0; padding: 0; list-style: none; }
  .items button {
    width: 100%; min-height: 52px; border: 0; border-radius: 12px; background: none; color: var(--fg);
    font: inherit; font-size: 17px; text-align: left; padding: 0 14px;
  }
  .items button:active { background: var(--bg-active); }
  .items button:disabled { color: var(--fg-dim); }
  .items button.danger { color: #ff453a; }
  .items button { display: flex; align-items: center; justify-content: space-between; }
  .items button.on { font-weight: 600; }
  .check { width: 14px; height: 14px; flex: none; fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .items .check { width: 20px; height: 20px; }
  .items li.sep { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  .backdrop { position: fixed; inset: 0; z-index: 44; }
  .menu {
    position: fixed; z-index: 45; min-width: 184px; max-width: 280px; max-height: min(360px, 70vh); overflow-y: auto;
    list-style: none; margin: 0; padding: 4px; outline: none; transform-origin: top left;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
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
