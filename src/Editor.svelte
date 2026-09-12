<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown } from './lib/editor';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui } from './lib/ui.svelte';
  import Icon from './Icon.svelte';
  import Suggest from './Suggest.svelte';
  import Outline from './Outline.svelte';
  import { RANDOM_ICONS } from './lib/icons';

  let { note }: { note: Note } = $props();

  let el: HTMLDivElement;
  let editor = $state<TipTap | undefined>();

  let scrollEl = $state<HTMLDivElement | null>(null);

  let suggest: ReturnType<typeof Suggest>; // [[ and / popup

  onMount(() => {
    const id = note.id;
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => notes.update(note.id, md),
      onOpenNote: (title) => { notes.flush(note.id); notes.openByTitle(title); },
      titles: () => notes.visible.filter((n) => n.id !== note.id).map(titleOf),
      suggestionUI: suggest.ui,
      cursor: notes.cursor.get(note.id),
    });
    if (notes.selectTitle) {
      // a brand-new page: its placeholder title is selected, so typing renames it right away
      notes.selectTitle = false;
      editor.commands.setTextSelection({ from: 1, to: 1 + (editor.state.doc.firstChild?.content.size ?? 0) });
      editor.commands.focus();
    } else if (ui.focusOwner !== 'sidebar') editor?.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    return () => {
      if (editor) notes.cursor.set(id, editor.state.selection.from);
      editor?.destroy();
      // Svelte runs teardown with pre-update state visible, so a flush here would persist stale data
      // (it resurrected deleted notes). Flush right after the batch instead.
      setTimeout(() => notes.flush(id), 0);
    };
  });

  async function changeIcon(anchor: HTMLElement) {
    const v = await ui.pickEmoji(anchor, note.icon ?? '');
    if (v !== null) notes.setIcon(note.id, v);
  }

  // rebind editor shortcuts live when the user changes them
  $effect(() => { shortcuts.actions; if (editor) applyKeymap(editor); });

  // remote sync may replace the body under us
  $effect(() => {
    const body = note.body;
    if (editor && !editor.isFocused && getMarkdown(editor) !== body) {
      editor.commands.setContent(body);
    }
  });
</script>

<div class="scroll" bind:this={scrollEl}>
  {#if !note.path}
    <div class="page-head" class:with-icon={!!note.icon}>
      {#if note.icon}
        <button class="big-icon" title="아이콘 변경" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={56} /></button>
      {:else}
        <button class="add-icon" onclick={() => notes.setIcon(note.id, RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)])}>
          <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
          아이콘 추가
        </button>
      {/if}
    </div>
  {/if}
  <!-- Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the editor -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor" class:has-head={!note.path} bind:this={el}
    onkeydown={(e) => { if (e.key === 'Tab' && !e.defaultPrevented) e.preventDefault(); }}></div>
</div>
<Outline {scrollEl} {editor} />

<Suggest bind:this={suggest} />

<style>
  .scroll { height: 100%; overflow-y: auto; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .editor { min-height: 100%; }
  .page-head {
    max-width: var(--editor-width, 820px); margin: 0 auto; padding: 44px clamp(24px, 8vw, 96px) 0; box-sizing: border-box;
    height: 72px; /* reserves the "add icon" row so the title doesn't jump */
  }
  .page-head.with-icon { height: 118px; }
  .add-icon {
    display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: var(--fg-dim);
    font: inherit; font-size: 12.5px; padding: 3px 6px; margin-left: -6px; border-radius: 6px; opacity: 0;
    transition: opacity 0.15s, background 0.12s;
  }
  .add-icon svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  :global(main:hover) .add-icon, .add-icon:focus-visible { opacity: 1; }
  .add-icon:hover { background: var(--bg-hover); color: var(--fg); }
  .big-icon {
    border: 0; background: none; font-size: 56px; line-height: 1; padding: 4px; margin-left: -4px; border-radius: 10px;
    transition: background 0.12s, transform 0.12s;
  }
  .big-icon:hover { background: var(--bg-hover); }
  .big-icon:active { transform: scale(0.95); }
  .editor.has-head :global(.tiptap) { padding-top: 0; min-height: calc(100% - 72px); }
</style>
