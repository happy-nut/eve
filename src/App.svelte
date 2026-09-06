<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { groups } from './lib/groups.svelte';
  import { setGlobalHotkey, win } from './lib/platform';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Settings from './Settings.svelte';
  import Confirm from './Confirm.svelte';
  import { ui } from './lib/ui.svelte';
  import { titleOf } from './lib/notes.svelte';

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let searchEl = $state<HTMLInputElement | null>(null);
  let hotkeyError = $state<string | null>(null);

  // global hotkey follows the shortcut store live
  $effect(() => {
    const keys = shortcuts.keysFor('toggleWindow');
    setGlobalHotkey(keys).then((err) => (hotkeyError = err));
  });

  onMount(() => {
    notes.load();
    return sync.start();
  });

  function step(delta: number) {
    const list = notes.visible;
    const i = list.findIndex((n) => n.id === notes.currentId);
    const next = list[(i + delta + list.length) % list.length];
    if (next) notes.currentId = next.id;
  }

  function focusSidebar() {
    sidebarOpen = true;
    queueMicrotask(() => (document.querySelector<HTMLElement>('aside [data-row].active') ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus());
  }
  async function deleteCurrent() {
    const n = notes.current;
    if (n && (await ui.ask(`Delete “${titleOf(n)}”?`))) notes.remove(n.id);
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || ui.pending) return;
    const a = shortcuts.match(e, ['app']);
    if (!a) return;
    if (a.id === 'hide' && (settingsOpen || document.activeElement === searchEl)) return; // handled locally
    e.preventDefault();
    switch (a.id) {
      case 'newNote': notes.create(); break;
      case 'newGroup': sidebarOpen = true; groups.create(); break;
      case 'search': sidebarOpen = true; queueMicrotask(() => searchEl?.focus()); break;
      case 'toggleSidebar': sidebarOpen = !sidebarOpen; break;
      case 'focusSidebar': focusSidebar(); break;
      case 'back': notes.back(); break;
      case 'forward': notes.forward(); break;
      case 'nextNote': step(1); break;
      case 'prevNote': step(-1); break;
      case 'deleteNote': deleteCurrent(); break;
      case 'settings': settingsOpen = !settingsOpen; break;
      case 'hide': win.hide(); break;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="dragbar" data-tauri-drag-region></div>
  <Sidebar bind:open={sidebarOpen} bind:searchEl onSettings={() => (settingsOpen = true)} />
  <main>
    {#if notes.loaded && notes.current}
      {#key notes.currentId}
        <div class="page" in:fade={{ duration: 160 }}>
          <Editor note={notes.current} />
        </div>
      {/key}
    {/if}
  </main>
</div>

{#if settingsOpen}
  <Settings onClose={() => (settingsOpen = false)} {hotkeyError} />
{/if}
{#if ui.pending}
  <Confirm />
{/if}
