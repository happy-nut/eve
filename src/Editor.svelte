<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown, type SuggestItem } from './lib/editor';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui } from './lib/ui.svelte';

  let { note }: { note: Note } = $props();

  let el: HTMLDivElement;
  let editor: TipTap | undefined;

  // [[ suggestion popup state
  let items = $state<SuggestItem[]>([]);
  let sel = $state(0);
  let pos = $state({ x: 0, y: 0 });
  let pick: (t: SuggestItem) => void = () => {};

  const suggestionUI = {
    show(list: SuggestItem[], rect: DOMRect | null, cb: (t: SuggestItem) => void) {
      items = list; sel = 0; pick = cb;
      if (rect) pos = { x: rect.left, y: rect.bottom + 4 };
    },
    move: (d: number) => { sel = (sel + d + items.length) % items.length; },
    select: () => { if (!items.length) return false; pick(items[sel]); return true; },
    hide: () => { items = []; },
    visible: () => items.length > 0,
  };

  onMount(() => {
    const id = note.id;
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => notes.update(note.id, md),
      onOpenNote: (title) => { notes.flush(note.id); notes.openByTitle(title); },
      titles: () => notes.visible.filter((n) => n.id !== note.id).map(titleOf),
      suggestionUI,
      cursor: notes.cursor.get(note.id),
    });
    if (ui.focusOwner !== 'sidebar') editor.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    return () => {
      if (editor) notes.cursor.set(id, editor.state.selection.from);
      editor?.destroy();
      // Svelte runs teardown with pre-update state visible, so a flush here would persist stale data
      // (it resurrected deleted notes). Flush right after the batch instead.
      setTimeout(() => notes.flush(id), 0);
    };
  });

  // keep the highlighted suggestion visible while arrowing through a long list
  $effect(() => {
    sel;
    document.querySelector('.suggest li.sel')?.scrollIntoView({ block: 'nearest' });
  });

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

<div class="editor" bind:this={el}></div>

{#if items.length}
  <ul class="suggest" style="left:{pos.x}px; top:{pos.y}px" transition:fly={{ y: 4, duration: 120 }}>
    {#each items as t, i}
      <li class:sel={i === sel}><button onmousedown={(e) => { e.preventDefault(); pick(t); }}>{t.label}{#if t.hint}<span class="hint">{t.hint}</span>{/if}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .editor { height: 100%; overflow-y: auto; }
  .suggest {
    position: fixed;
    z-index: 10;
    list-style: none;
    margin: 0;
    padding: 4px;
    min-width: 200px;
    max-width: 340px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 13px;
  }
  .suggest button { width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .suggest li.sel button { background: var(--accent-soft); }
  .suggest .hint { float: right; margin-left: 12px; color: var(--fg-dim); font-size: 11.5px; }
</style>
