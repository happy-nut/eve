<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown } from './lib/editor';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';

  let { note }: { note: Note } = $props();

  let el: HTMLDivElement;
  let editor: TipTap | undefined;

  // [[ suggestion popup state
  let items = $state<string[]>([]);
  let sel = $state(0);
  let pos = $state({ x: 0, y: 0 });
  let pick: (t: string) => void = () => {};

  const suggestionUI = {
    show(list: string[], rect: DOMRect | null, cb: (t: string) => void) {
      items = list; sel = 0; pick = cb;
      if (rect) pos = { x: rect.left, y: rect.bottom + 4 };
    },
    move: (d: number) => { sel = (sel + d + items.length) % items.length; },
    select: () => { if (!items.length) return false; pick(items[sel]); return true; },
    hide: () => { items = []; },
    visible: () => items.length > 0,
  };

  onMount(() => {
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => notes.update(note.id, md),
      onOpenNote: (title) => { notes.flush(note.id); notes.openByTitle(title); },
      titles: () => notes.visible.filter((n) => n.id !== note.id).map(titleOf),
      suggestionUI,
    });
    return () => { notes.flush(note.id); editor?.destroy(); };
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
      <li class:sel={i === sel}><button onmousedown={(e) => { e.preventDefault(); pick(t); }}>{t}</button></li>
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
    min-width: 180px;
    max-width: 320px;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 13px;
  }
  .suggest button { width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .suggest li.sel button { background: var(--accent-soft); }
</style>
