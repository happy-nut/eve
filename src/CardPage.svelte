<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor } from './lib/editor';
  import { notes, titleOf } from './lib/notes.svelte';
  import { ui } from './lib/ui.svelte';
  import Suggest from './Suggest.svelte';

  // a kanban card as a floating page (Notion "peek"): title + a full markdown editor for the body
  const req = ui.card!;
  let title = $state(req.title);
  let body = req.body;
  let el: HTMLDivElement;
  let titleEl: HTMLInputElement;
  let suggest: ReturnType<typeof Suggest>;
  let editor: TipTap | undefined;
  const returnTo = document.activeElement as HTMLElement | null;

  function close() { returnTo?.isConnected && returnTo.focus(); ui.closeCard(); }
  const push = () => req.onChange({ title: title.replace(/\s*\n\s*/g, ' '), body });

  onMount(() => {
    editor = createEditor({
      element: el,
      content: body,
      onUpdate: (md) => { body = md; push(); },
      onOpenNote: (t) => { close(); notes.openByTitle(t); },
      titles: () => notes.visible.map(titleOf),
      suggestionUI: suggest.ui,
    });
    if (title) { editor.commands.focus('end'); editor.view.focus(); } else titleEl.focus();
    return () => editor?.destroy();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !suggest.ui.visible()) { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Tab' && !e.defaultPrevented) { // title <-> body; never out of the page (the editor eats Tab in lists)
      e.preventDefault();
      if (document.activeElement === titleEl) { editor?.commands.focus('start'); editor?.view.focus(); } else titleEl.focus();
    }
  }
  function titleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); editor?.commands.focus('start'); editor?.view.focus(); }
  }
</script>

<div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={close} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="card" transition:scale={{ start: 0.96, duration: 180 }} role="dialog" tabindex="-1" onkeydown={onKey}>
  <input class="title" bind:this={titleEl} bind:value={title} oninput={push} onkeydown={titleKey} placeholder="Untitled" spellcheck="false" />
  <div class="card-body editor" bind:this={el}></div>
</div>
<Suggest bind:this={suggest} />

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); z-index: 30; }
  .card {
    position: fixed; z-index: 31; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(760px, 92vw); height: min(80vh, 760px); display: flex; flex-direction: column;
    padding: 40px 56px 0; border-radius: 14px; overflow-y: auto; scrollbar-width: none;
    background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  }
  .card::-webkit-scrollbar { display: none; }
  .title {
    flex: none; width: 100%; border: 0; background: none; color: var(--fg); outline: none; padding: 0; margin: 0 0 10px;
    font: inherit; font-family: var(--font-editor, inherit); font-size: 28px; font-weight: 600; letter-spacing: -0.01em;
  }
  .title::placeholder { color: var(--fg-dim); opacity: 0.6; }
  .card-body { flex: 1; }
  .card .card-body :global(.tiptap) { padding: 0 0 120px; max-width: none; min-height: 100%; }
</style>
