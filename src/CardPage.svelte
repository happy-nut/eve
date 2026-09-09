<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor } from './lib/editor';
  import { notes, titleOf } from './lib/notes.svelte';
  import { cardDoc, splitCard } from './lib/markdown';
  import { ui } from './lib/ui.svelte';
  import Suggest from './Suggest.svelte';
  import Outline from './Outline.svelte';

  // a kanban card as a floating page (Notion "peek"): one markdown editor whose first line is the title,
  // like a note. One editing host, so a drag that starts in the title runs on into the body.
  const req = ui.card!;
  let el: HTMLDivElement;
  let scrollEl = $state<HTMLDivElement | null>(null);
  let suggest: ReturnType<typeof Suggest>;
  let editor = $state<TipTap | undefined>();
  const returnTo = document.activeElement as HTMLElement | null;

  function close() { returnTo?.isConnected && returnTo.focus(); ui.closeCard(); }

  onMount(() => {
    editor = createEditor({
      element: el,
      content: cardDoc(req.title, req.body),
      onUpdate: (md) => req.onChange(splitCard(md)),
      onOpenNote: (t) => { close(); notes.openByTitle(t); },
      titles: () => notes.visible.map(titleOf),
      suggestionUI: suggest.ui,
    });
    // caret at the end of the title line, so a long card opens at its top rather than scrolled to the end
    editor.commands.focus(editor.state.doc.firstChild!.nodeSize - 1);
    editor.view.focus();
    return () => editor?.destroy();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !suggest.ui.visible()) { e.preventDefault(); e.stopPropagation(); close(); }
    // Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the page
    if (e.key === 'Tab' && !e.defaultPrevented) e.preventDefault();
  }
</script>

<div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={close} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="card" transition:scale={{ start: 0.96, duration: 180 }} role="dialog" tabindex="-1" onkeydown={onKey}>
  <div class="card-scroll" bind:this={scrollEl}>
    <div class="card-body editor" bind:this={el}></div>
  </div>
  <Outline {scrollEl} {editor} />
</div>
<Suggest bind:this={suggest} />

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); z-index: 30; }
  .card {
    position: fixed; z-index: 31; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(760px, 92vw); height: min(80vh, 760px); display: flex; flex-direction: column; overflow: hidden;
    border-radius: 14px; background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  }
  /* the scroller sits inside the card so the outline rail can stay put while the page scrolls */
  .card-scroll { flex: 1; padding: 40px 56px 0; overflow-y: auto; scrollbar-width: none; }
  .card-scroll::-webkit-scrollbar { display: none; }
  .card-body { flex: 1; }
  .card .card-body :global(.tiptap) { padding: 0 0 120px; max-width: none; min-height: 100%; }
  /* an untitled card still shows where the title goes (the editor's own placeholder is for paragraphs) */
  .card .card-body :global(.tiptap > h1:first-child:has(> br:only-child))::before {
    content: 'Untitled'; color: var(--fg-dim); float: left; height: 0; pointer-events: none;
  }
</style>
