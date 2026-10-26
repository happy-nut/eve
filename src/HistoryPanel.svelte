<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { panelIn, scrimFade } from './lib/motion';
  import { sheet } from './lib/popup';
  import { ui } from './lib/ui.svelte';
  import { notes, titleOf } from './lib/notes.svelte';
  import { sync } from './lib/sync.svelte';
  import { editedLabel } from './lib/date';
  import { createEditor } from './lib/editor';

  // a note's versions (Notion's page history): the saves sync made, newest first, each shown as the note was then.
  // They come from the repo's commits, so they are there only with sync on.
  const id = ui.historyOf!;
  const note = $derived(notes.all.find((n) => n.id === id));
  let versions = $state<{ sha: string; at: number }[] | null>(null);
  let failed = $state('');
  let chosen = $state(0);
  let body = $state<string | null>(null);

  $effect(() => {
    if (!sync.enabled) { versions = []; return; }
    sync.versions(id).then((v) => (versions = v), (e: Error) => (failed = e.message));
  });
  // the one chosen, read when it is chosen (a note saved a hundred times is not read a hundred times)
  $effect(() => {
    const v = versions?.[chosen];
    body = null;
    if (!v) return;
    let gone = false;
    sync.versionAt(id, v.sha).then((b) => { if (!gone) body = b; }, (e: Error) => { if (!gone) failed = e.message; });
    return () => { gone = true; };
  });

  const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // shown as the note is drawn, by the note's own editor, which only shows: nothing typed or picked there
  let view = $state<HTMLDivElement>();
  let shown: TipTap | undefined;
  const off = { show() {}, move() {}, month() {}, select: () => false, hide() {}, visible: () => false, place() {}, expand: () => false, collapse: () => false, chosen: () => false };
  $effect(() => {
    if (body === null || !view) return;
    shown?.destroy();
    shown = createEditor({ element: view, content: body, onUpdate: () => {}, onOpenNote: () => {}, targets: () => notes.pages, suggestionUI: off, calendarUI: off, emojiUI: off });
    shown.setEditable(false);
  });
  $effect(() => () => shown?.destroy());

  function restore() {
    const v = versions?.[chosen];
    if (!v || body === null) return;
    ui.closeHistory();
    notes.restoreVersion(id, body, when(v.at));
  }
  const appear = (node: Element) => sheet(node, (n) => scale(n, panelIn));
  const focus = (el: HTMLElement) => el.focus();
</script>

<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => ui.closeHistory()} role="presentation"></div>
<div class="rpanel" data-panel="history" transition:appear|global role="dialog" aria-modal="true" aria-label="Version history">
  <header>
    <span class="title">Version history{note ? ` · ${titleOf(note)}` : ''}</span>
    <button class="close" aria-label="Close" use:focus onclick={() => ui.closeHistory()}><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
  </header>
  {#if failed}
    <p class="note">Versions could not be read: {failed}</p>
  {:else if !sync.enabled}
    <p class="note">Versions come from sync: every minute something is written, it is saved to your GitHub repository. Turn sync on in Settings → Sync to keep them.</p>
  {:else if versions === null}
    <p class="note">Reading versions…</p>
  {:else if !versions.length}
    <p class="note">No saved versions yet: the first comes with the next sync.</p>
  {:else}
    <div class="body">
      <ul aria-label="Versions">
        {#each versions as v, i (v.sha)}
          <li><button class:on={i === chosen} onclick={() => (chosen = i)}>
            <span>{when(v.at)}</span><span class="ago">{i === 0 ? 'latest' : editedLabel(v.at)}</span>
          </button></li>
        {/each}
      </ul>
      <div class="show">
        {#if body === null}<p class="note">Reading…</p>{/if}
        <div class="view" bind:this={view} class:hidden={body === null}></div>
      </div>
    </div>
    <footer>
      <button class="primary" disabled={body === null || chosen === 0} onclick={restore}>Restore this version</button>
    </footer>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: var(--z-sheet-scrim); }
  .rpanel {
    position: fixed; z-index: var(--z-sheet); top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(900px, 94vw); height: min(640px, 86vh); display: flex; flex-direction: column;
    border-radius: var(--panel-radius); background: var(--bg-pop); box-shadow: var(--panel-shadow); font-size: 13px; overflow: hidden;
  }
  :global(html.mobile) .rpanel { top: auto; bottom: 0; left: 0; right: 0; width: auto; height: 88vh; transform: none; border-radius: var(--panel-radius) var(--panel-radius) 0 0; padding-bottom: env(safe-area-inset-bottom); }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--line); }
  .title { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { border: 0; background: none; color: var(--fg); font: inherit; border-radius: 6px; }
  .close { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-dim); }
  :global(html.mobile) .close { width: 44px; height: 44px; } /* a finger's size */
  .close:hover { background: var(--bg-input); color: var(--fg); }
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  .note { margin: 0; padding: 18px 16px; color: var(--fg-dim); line-height: 1.45; }
  .body { flex: 1; min-height: 0; display: flex; }
  /* a phone: the versions in a row over the note */
  :global(html.mobile) .body { flex-direction: column; }
  ul { list-style: none; margin: 0; padding: 6px; width: 210px; flex: none; overflow-y: auto; border-right: 1px solid var(--line); }
  :global(html.mobile) ul { width: auto; display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  li button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 10px; text-align: left; white-space: nowrap; }
  li button:hover { background: var(--bg-hover); }
  li button.on { background: var(--accent-soft); }
  .ago { color: var(--fg-dim); font-size: 12px; }
  .show { flex: 1; min-width: 0; overflow-y: auto; padding: 8px 8px 24px; }
  .hidden { display: none; }
  footer { display: flex; justify-content: flex-end; padding: 10px; border-top: 1px solid var(--line); }
  .primary { padding: 6px 12px; font-weight: 500; background: var(--accent); color: var(--on-accent); }
  .primary:disabled { opacity: 0.45; }
</style>
