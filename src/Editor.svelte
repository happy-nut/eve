<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown, goToSection } from './lib/editor';
  import { notes, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui, hooks } from './lib/ui.svelte';
  import Icon from './Icon.svelte';
  import Suggest from './Suggest.svelte';
  import Outline from './Outline.svelte';
  import TableTools from './TableTools.svelte';
  import Find from './Find.svelte';
  import { randomIcon } from './lib/icons';

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
      onOpenNote: (title) => {
        notes.flush(note.id);
        notes.openByTitle(title);
        // a link into this very page: no navigation happens, so make the jump here
        if (notes.section && notes.currentId === note.id) {
          const s = notes.section;
          notes.section = '';
          goToSection(editor!, s);
        }
      },
      targets: () => notes.visible,
      suggestionUI: suggest.ui,
      // a [[Title#Section]] link says where to land, over wherever the caret was left last time
      cursor: notes.section ? undefined : notes.cursor.get(note.id),
    });
    if (import.meta.env.DEV) (window as any).__editor = editor;
    // a file dropped outside the note (the sidebar, the margins) still attaches to the open one
    // an attachment joins the note as its own block, never glued onto the last sentence
    hooks.attach = (md) => {
      const e = editor!;
      const content = (e.storage as any).markdown.parser.parse(md);
      const last = e.state.doc.lastChild;
      const chain = e.chain().focus('end');
      (last && last.content.size ? chain.splitBlock() : chain).insertContent(content).run();
    };
    hooks.noteHtml = () => editor?.getHTML() ?? '';
    // summoned back: the caret in the middle of the page, where it is comfortable to write from —
    // not pinned to whichever edge the last scroll into view left it against
    hooks.centerCaret = () => {
      if (!editor || !scrollEl) return;
      const caret = editor.view.coordsAtPos(editor.state.selection.head);
      const box = scrollEl.getBoundingClientRect();
      scrollEl.scrollBy({ top: caret.top - (box.top + box.height / 2) });
    };
    const section = notes.section; // a [[Title#Section]] link brought us here
    notes.section = '';
    if (section) {
      goToSection(editor, section);
    } else if (notes.selectTitle) {
      // a brand-new page: its placeholder title is selected, so typing renames it right away
      notes.selectTitle = false;
      editor.commands.setTextSelection({ from: 1, to: 1 + (editor.state.doc.firstChild?.content.size ?? 0) });
      editor.commands.focus();
    } else if (ui.focusOwner !== 'sidebar') editor?.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    return () => {
      hooks.attach = undefined;
      hooks.noteHtml = undefined;
      hooks.centerCaret = undefined;
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

  // remote sync may replace the body under us. Trailing newlines do not count as a difference: a note
  // that ends in one (created from a template, imported from a file) would otherwise be re-set on every
  // mount, throwing away where the caret was just put — the jump a [[Title#Section]] link makes, say.
  $effect(() => {
    const body = note.body;
    if (editor && !editor.isFocused && getMarkdown(editor).trimEnd() !== body.trimEnd()) {
      editor.commands.setContent(body);
    }
  });
</script>

<div class="scroll" bind:this={scrollEl}>
  <div class="page-head" class:with-icon={!!note.icon}>
    {#if note.icon}
      <button class="big-icon" title="아이콘 변경" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={56} /></button>
    {:else}
      <button class="add-icon" onclick={() => notes.setIcon(note.id, randomIcon())}>
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
        아이콘 추가
      </button>
    {/if}
  </div>
  <!-- Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the editor -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor has-head" bind:this={el}
    onkeydown={(e) => { if (e.key === 'Tab' && !e.defaultPrevented) e.preventDefault(); }}></div>
</div>
<Outline {scrollEl} {editor} />
<TableTools {editor} />
{#if ui.find}<Find {editor} />{/if}

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
