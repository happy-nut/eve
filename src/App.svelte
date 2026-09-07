<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes } from './lib/notes.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { groups } from './lib/groups.svelte';
  import { appearance } from './lib/appearance.svelte';
  appearance.apply();
  import { setGlobalHotkey, win, files, autostart, isTauri } from './lib/platform';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Settings from './Settings.svelte';
  import Confirm from './Confirm.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import { ui, hooks } from './lib/ui.svelte';
  import { titleOf } from './lib/notes.svelte';

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let searchEl = $state<HTMLInputElement | null>(null);
  let hotkeyError = $state<string | null>(null);
  // hold ⌘: sidebar notes show 1…9, ⌘<digit> opens that note
  let cmdHeld = $state(false);
  let cmdTimer: ReturnType<typeof setTimeout> | undefined;
  function cmdDown() { clearTimeout(cmdTimer); cmdTimer = setTimeout(() => (cmdHeld = true), 150); }
  function cmdUp() { clearTimeout(cmdTimer); cmdHeld = false; }
  function jumpTo(n: number) {
    const note = groups.visibleOrdered()[n - 1];
    if (!note) return;
    ui.focusOwner = 'editor';
    notes.currentId = note.id;
    queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus());
  }

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
    if (e.key === 'Meta') cmdDown();
    if (ui.pending || ui.emoji) return;
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      jumpTo(Number(e.code[5]));
      return;
    }
    if (e.defaultPrevented && !(e as any).eveApp) return;
    const a = shortcuts.match(e, ['app']);
    if (!a) return;
    if (a.id === 'hide' && (settingsOpen || document.activeElement === searchEl)) return; // handled locally
    e.preventDefault();
    switch (a.id) {
      case 'newNote':
        // from the sidebar, ask what to create (note or group) via the + menu
        if (document.activeElement?.closest('aside')) hooks.openPlus?.();
        else notes.create();
        break;
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

<svelte:window onkeydown={onKeydown} onkeyup={(e) => e.key === 'Meta' && cmdUp()} onblur={cmdUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shell" onfocusin={(e) => (ui.focusOwner = (e.target as HTMLElement).closest('aside') ? 'sidebar' : 'editor')}>
  <div class="dragbar" data-tauri-drag-region></div>
  <!-- window toolbar, right of the traffic lights -->
  <div class="toolbar">
    <button class="icon" aria-label="Sidebar" data-tip="Sidebar  {prettyKeys(shortcuts.keysFor('focusSidebar'))}" onclick={() => (sidebarOpen = !sidebarOpen)}>
      <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.5 3v10"/></svg>
    </button>
    <button class="icon" aria-label="Back" data-tip="Back  {prettyKeys(shortcuts.keysFor('back'))}" disabled={!notes.canBack} onclick={() => notes.back()}>
      <svg viewBox="0 0 16 16"><path d="M13 8H3M7 4L3 8l4 4"/></svg>
    </button>
    <button class="icon" aria-label="Forward" data-tip="Forward  {prettyKeys(shortcuts.keysFor('forward'))}" disabled={!notes.canForward} onclick={() => notes.forward()}>
      <svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
    </button>
    <button class="icon" aria-label="New" data-tip="New  {prettyKeys(shortcuts.keysFor('newNote'))}" onclick={(e) => (sidebarOpen && hooks.openPlus ? hooks.openPlus(e.currentTarget) : notes.create())}>
      <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>
    </button>
  </div>
  <Sidebar bind:open={sidebarOpen} bind:searchEl {cmdHeld} onSettings={() => (settingsOpen = true)} />
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
{#if ui.emoji}
  <EmojiPicker />
{/if}
