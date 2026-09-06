<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown, type SuggestItem } from './lib/editor';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui } from './lib/ui.svelte';
  import Icon from './Icon.svelte';

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

  async function changeIcon(anchor: HTMLElement) {
    const v = await ui.pickEmoji(anchor, note.icon ?? '');
    if (v !== null) notes.setIcon(note.id, v);
  }

  // keep the highlighted suggestion visible while arrowing through a long list
  $effect(() => {
    sel;
    document.querySelector('.suggest li.sel')?.scrollIntoView({ block: 'nearest' });
  });

  // more top room for the big icon
  $effect(() => { editor?.view.dom.classList.toggle('with-icon', !!note.icon); });

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

{#if !note.path}
  <div class="page-head">
    {#if note.icon}
      <button class="big-icon" title="아이콘 변경" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={56} /></button>
    {:else}
      <button class="add-icon" onclick={(e) => changeIcon(e.currentTarget)}>
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
        아이콘 추가
      </button>
    {/if}
  </div>
{/if}
<div class="editor" class:has-head={!note.path} bind:this={el}></div>

{#if items.length}
  <ul class="suggest" style="left:{pos.x}px; top:{pos.y}px" transition:fly={{ y: 4, duration: 120 }}>
    {#each items as t, i}
      <li class:sel={i === sel}><button onmousedown={(e) => { e.preventDefault(); pick(t); }}>{t.label}{#if t.hint}<span class="hint">{t.hint}</span>{/if}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .editor { height: 100%; overflow-y: auto; }
  .page-head {
    position: absolute; top: 40px; left: 0; right: 0; z-index: 2; pointer-events: none;
    max-width: var(--editor-width, 820px); margin: 0 auto; padding: 0 clamp(24px, 8vw, 96px); box-sizing: border-box;
  }
  .page-head button { pointer-events: auto; }
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
  .editor.has-head :global(.tiptap) { padding-top: 72px; }
  .editor.has-head :global(.tiptap.with-icon) { padding-top: 120px; }
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
