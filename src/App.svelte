<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { groups } from './lib/groups.svelte';
  import { setGlobalHotkey, win, files, autostart, isTauri } from './lib/platform';
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

  if (import.meta.env.DEV) (window as any).__notes = notes;
  onMount(() => {
    // first run: launch at login so the summon hotkey is always available (toggle in Settings)
    if (isTauri && !localStorage.getItem('eve.autostart.init')) {
      autostart.set(true).finally(() => localStorage.setItem('eve.autostart.init', '1'));
    }
    notes.load().then(() => files.onOpen((paths) => paths.forEach((p) => notes.openFile(p))));
    return sync.start();
  });

  function step(delta: number) {
    const list = groups.ordered();
    const i = list.findIndex((n) => n.id === notes.currentId);
    const next = list[(i + delta + list.length) % list.length];
    if (next) notes.currentId = next.id;
  }

  /** ⌘\\: closed -> open + focus list; focus already in list -> close + back to editor; else focus list. */
  function focusSidebar() {
    if (sidebarOpen && document.activeElement?.closest('aside')) {
      sidebarOpen = false;
      queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus());
      return;
    }
    sidebarOpen = true;
    queueMicrotask(() => (document.querySelector<HTMLElement>('aside [data-row].active') ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus());
  }
  async function deleteCurrent() {
    const n = notes.current;
    if (!n) return;
    if (n.path || (await ui.ask(`Delete “${titleOf(n)}”?`))) notes.remove(n.id);
  }
  function onKeydown(e: KeyboardEvent) {
    if ((e.defaultPrevented && !(e as any).eveApp) || ui.pending) return;
    const a = shortcuts.match(e, ['app']);
    if (!a) return;
    if (a.id === 'hide' && (settingsOpen || document.activeElement === searchEl)) return; // handled locally
    e.preventDefault();
    switch (a.id) {
      case 'newNote':
        // from the sidebar, ask what to create (note or group) via the + menu
        if (document.activeElement?.closest('aside')) document.querySelector<HTMLElement>('aside .plus')?.click();
        else notes.create();
        break;
      case 'newGroup': sidebarOpen = true; groups.create(); break;
      case 'search': sidebarOpen = true; queueMicrotask(() => searchEl?.focus()); break;
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shell" onfocusin={(e) => (ui.focusOwner = (e.target as HTMLElement).closest('aside') ? 'sidebar' : 'editor')}>
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
