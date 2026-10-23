<script lang="ts">
  import { onMount } from 'svelte';
  import { createDocument, type Editor as TipTap } from '@tiptap/core';
  import { TextSelection } from '@tiptap/pm/state';
  import type { Node as PMNode } from '@tiptap/pm/model';
  import { createEditor, applyKeymap, getMarkdown, goToSection, runEditorCommand, clickBelow } from './lib/editor';
  import { isMobile } from './lib/platform';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { appearance } from './lib/appearance.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui, hooks } from './lib/ui.svelte';
  import Icon from './Icon.svelte';
  import { groups, leafOf } from './lib/groups.svelte';
  import Suggest from './Suggest.svelte';
  import DateMenu from './DateMenu.svelte';
  import EmojiRow from './EmojiRow.svelte';
  import Outline from './Outline.svelte';
  import TableTools from './TableTools.svelte';
  import Find from './Find.svelte';
  import { randomIcon } from './lib/icons';
  import { nudgeNote, openedFromList } from './lib/moves';

  let { note }: { note: Note } = $props();

  let el: HTMLDivElement;
  let editor = $state<TipTap | undefined>();

  let scrollEl = $state<HTMLDivElement | null>(null);

  let suggest: ReturnType<typeof Suggest>; // [[ and / popup
  let dateMenu: ReturnType<typeof DateMenu>; // the @ calendar
  let emojiRow: ReturnType<typeof EmojiRow>; // the :smile row

  // the markdown the editor last handed over (or was given): a body that differs from it came from elsewhere
  let lastEmitted = '';

  onMount(() => {
    const id = note.id;
    lastEmitted = note.body;
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => { lastEmitted = md; notes.update(note.id, md); },
      onNoteMove: (dir, onTitle) => (onTitle || openedFromList.id === note.id) && nudgeNote(note.id, dir),
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
      targets: () => notes.pages,
      suggestionUI: suggest.ui,
      calendarUI: dateMenu.ui,
      emojiUI: emojiRow.ui,
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
    // summoned back: the caret in the middle of the page, where it is comfortable to write from —
    // not pinned to whichever edge the last scroll into view left it against
    hooks.command = (id) => {
      if (!editor) return;
      runEditorCommand(editor, id);
    };
    hooks.section = (heading) => editor && goToSection(editor, heading);
    hooks.centerCaret = () => {
      if (!editor || !scrollEl) return;
      const caret = editor.view.coordsAtPos(editor.state.selection.head);
      const box = scrollEl.getBoundingClientRect();
      scrollEl.scrollBy({ top: caret.top - (box.top + box.height / 2) });
    };
    // the empty line StarterKit keeps at the end of a note is only put there by the first transaction: before it, the
    // note's end is the end of its last block, and a caret sent there (opening a note) landed at the end of a closing
    // code block's last line, scrolling the code sideways to it. Put it there first, so the end is the empty line.
    // Opening a note is not writing in it: the editor's own spelling of it is not saved back, dated now.
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
    const section = notes.section; // a [[Title#Section]] link brought us here
    notes.section = '';
    if (section) {
      goToSection(editor, section);
    } else if (notes.selectTitle) {
      // a brand-new page: its placeholder title is selected, so typing renames it right away
      notes.selectTitle = false;
      editor.commands.setTextSelection({ from: 1, to: 1 + (editor.state.doc.firstChild?.content.size ?? 0) });
      editor.commands.focus();
    } else if (notes.caretEnd) {
      notes.caretEnd = false; // opened to write in: under whatever the template put there
      editor.commands.focus('end');
    } else if (ui.focusOwner !== 'sidebar' && !isMobile) editor?.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    // (a phone opens a note to read it: the keyboard comes up when the text is tapped, not before)
    return () => {
      hooks.attach = undefined;
      hooks.centerCaret = undefined;
      hooks.section = undefined;
      hooks.command = undefined;
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
    if (!isMobile) editor?.view.focus(); // back into the note, the caret where it was (a phone's keyboard stays down)
  }

  /** A random icon (picked again with a click on it). The button goes as the icon takes its place, and the keyboard
   *  went with it, to nothing: back into the note, the caret where it was (a phone's keyboard stays down). */
  function addIcon() {
    notes.setIcon(note.id, randomIcon());
    if (!isMobile) editor?.view.focus();
  }

  // asked to write at the end of this very note (the reminder's today, already open): no remount brings it there
  $effect(() => {
    if (editor && notes.caretEnd && notes.currentId === note.id) { notes.caretEnd = false; editor.commands.focus('end'); }
  });

  // the spelling help switched in Settings: the note's attributes are read again (editor.ts), without a remount
  $effect(() => { void appearance.s.autoCorrect; if (editor) editor.view.setProps({}); });

  // rebind editor shortcuts live when the user changes them
  $effect(() => { shortcuts.actions; if (editor) applyKeymap(editor); });

  // remote sync may replace the body under us — even while the caret is in it (a window in the background keeps
  // its focus), or the next keystroke would save the old text over the other device's edit. Only a body the editor
  // did not hand over itself counts: the editor writes `- a` for `* a`, and putting the note back as it was saved
  // would just re-set it. Re-setting it is not an edit here, so it is not saved back, nor dated now. Trailing
  // newlines do not count as a difference: a note that ends in one (created from a template, imported from a file)
  // would otherwise be re-set on every mount, throwing away where the caret was just put — the jump a
  // [[Title#Section]] link makes, say.
  $effect(() => {
    const body = note.body;
    if (!editor || body.trimEnd() === lastEmitted.trimEnd()) return;
    lastEmitted = body;
    if (getMarkdown(editor).trimEnd() === body.trimEnd()) return;
    // only the stretch that differs is replaced: the caret stays by the text it was in (put back at the same
    // offset, it landed inside a line the other device added above, and the next keys went into that), and the
    // writer's own steps before it can still be undone. Not a step of theirs to undo either: ⌘Z took the other
    // device's edit back out, and saved that.
    const doc = editor.state.doc;
    let next = createDocument((editor.storage as any).markdown.parser.parse(body), editor.schema, editor.options.parseOptions);
    // the empty line the editor keeps after a last block that is not a line of text (a picture, a toggle, a list) is
    // not in the note read again: without it the two never ended alike, and everything from the change to the end
    // was replaced (the caret landed on the picture, and the next key replaced it)
    const tail = doc.lastChild, nextTail = next.lastChild;
    if (tail?.type.name === 'paragraph' && !tail.content.size && nextTail && nextTail.type.name !== 'paragraph') {
      next = next.copy(next.content.addToEnd(tail.type.create()));
    }
    const start = doc.content.findDiffStart(next.content);
    if (start === null) return;
    let { a: endA, b: endB } = doc.content.findDiffEnd(next.content)!;
    const overlap = start - Math.min(endA, endB); // a line added next to one like it: the two ends cross
    if (overlap > 0) { endA += overlap; endB += overlap; }
    // whole blocks of the note are replaced, the first and the last that changed: a piece cut from inside a toggle or
    // a list was fitted into whatever stood there (a toggle with no title around the new line, a title split in two)
    const edges: number[] = [0];
    doc.forEach((c) => edges.push(edges[edges.length - 1] + c.nodeSize));
    const from = Math.max(...edges.filter((p) => p <= start));
    const toA = Math.min(...edges.filter((p) => p >= endA)), toB = toA + endB - endA;
    const { selection } = editor.state;
    const tr = editor.state.tr.replace(from, toA, next.slice(from, toB));
    // the caret stays by the text it was in, judged by the stretch that really differs (start…endA), not by the whole
    // blocks replaced: before it and after it, by the same text; in it, as far in as it was, or at its end. (By the
    // blocks, a caret in a table — one block, however big — went into another cell as soon as a cell before it grew.)
    if (selection instanceof TextSelection) {
      const map = (p: number) => (p <= start ? p : p >= endA ? p + endB - endA : Math.min(p, endB));
      tr.setSelection(TextSelection.between(tr.doc.resolve(map(selection.anchor)), tr.doc.resolve(map(selection.head))));
    }
    editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
  });
  /**
   * Where the note sits, over its title: its groups, outermost first, then the pages it is under. A page opens on a
   * click; a group is only said (the list is where groups are). Nothing for a note at the top level.
   */
  const crumbs = $derived.by(() => {
    const out: { label: string; icon: string; id?: string }[] = [];
    const parts = (note.group ?? '').split('/').filter(Boolean);
    parts.forEach((_, i) => { const path = parts.slice(0, i + 1).join('/'); out.push({ label: leafOf(path), icon: groups.icon(path) }); });
    const pages: { label: string; icon: string; id: string }[] = [];
    const seen = new Set<string>([note.id]);
    for (let id = note.parent; id && !seen.has(id); ) {
      seen.add(id);
      const p = notes.all.find((n) => n.id === id && !n.deleted);
      if (!p) break;
      pages.unshift({ label: titleOf(p), icon: p.icon ?? '', id: p.id });
      id = p.parent;
    }
    return [...out, ...pages];
  });

  /** the pane's width on it as --pane, for the blocks that reach past the text to its edges (app.css) */
  function paneWidth(node: HTMLElement) {
    const put = () => node.style.setProperty('--pane', `${node.clientWidth}px`);
    put();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(put);
    watch.observe(node);
    return () => watch.disconnect();
  }
</script>

<!-- a wide note takes the whole pane: nothing holds its text to the reading width -->
<div class="scroll" bind:this={scrollEl} style:--editor-width={note.wide ? 'none' : null}>
  <div class="page-head" class:with-icon={!!note.icon}>
    {#if note.icon}
      <button class="big-icon" title="Change icon" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={isMobile ? 44 : 56} /></button>
    {:else}
      <button class="add-icon" onclick={addIcon}>
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
        Add icon
      </button>
    {/if}
  </div>
  <!-- Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the editor -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor has-head" bind:this={el} {@attach paneWidth}
    onkeydown={(e) => {
      // …but a row of a diagram's form keeps Tab: to the next row, as anywhere a form is filled in
      if (e.key === 'Tab' && !e.defaultPrevented && !(e.target as HTMLElement).closest?.('.dblock .form')) e.preventDefault();
      // any other key (or a click, below) means the note is being written in: ⌥↑ / ⌥↓ move lines again
      if (!(e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) openedFromList.id = '';
    }}
    onmousedown={() => (openedFromList.id = '')}
    onclick={(e) => { if (e.target === el && editor) clickBelow(editor.view, e); }}></div>
</div>
{#if crumbs.length}
  <!-- in the window's top row, as a title bar would have it: it stays put while the note scrolls under it -->
  <nav class="crumbs" aria-label="Where this note is">
    {#each crumbs as c, i (i)}
      <span class="sep">/</span>
      {#if c.id}
        <button class="crumb" onclick={() => (notes.currentId = c.id!)}>{#if c.icon}<Icon icon={c.icon} size={14} />{/if}<span>{c.label}</span></button>
      {:else}
        <span class="crumb">{#if c.icon}<Icon icon={c.icon} size={14} />{/if}<span>{c.label}</span></span>
      {/if}
    {/each}
    <span class="sep">/</span>
    <span class="crumb here">{#if note.icon}<Icon icon={note.icon} size={14} />{/if}<span>{titleOf(note)}</span></span>
  </nav>
{/if}
<Outline {scrollEl} {editor} />
<TableTools {editor} />
{#if ui.find}<Find {editor} />{/if}

<Suggest bind:this={suggest} />
<DateMenu bind:this={dateMenu} />
<EmojiRow bind:this={emojiRow} />

<style>
  .scroll { height: 100%; overflow-y: auto; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .editor { min-height: 100%; }
  .page-head {
    max-width: var(--editor-width, 820px); margin: 0 auto; padding: 44px clamp(24px, 8vw, 96px) 0; box-sizing: border-box;
    height: 72px; /* reserves the "add icon" row so the title doesn't jump */
  }
  .page-head.with-icon { height: 118px; }
  /* on a Mac the breadcrumbs sit in the window's top row: the note starts a little further down, clear of them */
  @media screen {
    :global(html:not(.mobile)) .page-head { padding-top: 68px; height: 96px; }
    :global(html:not(.mobile)) .page-head.with-icon { height: 142px; }
  }
  /* level with the window's toolbar, past it when the sidebar is closed and it sits over the note; only the crumbs
     take clicks, the rest of the row still drags the window */
  .crumbs {
    position: absolute; top: 10px; left: 14px; right: 52px; height: 24px; z-index: var(--z-toolbar); pointer-events: none;
    display: flex; align-items: center; gap: 2px; min-width: 0; overflow: hidden; font-size: 13px; color: var(--fg-dim); white-space: nowrap;
  }
  :global(.shell:not(:has(aside))) .crumbs { left: 214px; }
  .sep { opacity: 0.45; flex: none; padding: 0 1px; }
  .sep:first-child { display: none; }
  .crumb {
    display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 220px; height: 24px; padding: 0 6px;
    border-radius: 6px; border: 0; background: none; color: inherit; font: inherit; pointer-events: auto;
  }
  .crumb span { overflow: hidden; text-overflow: ellipsis; }
  .crumb.here { color: var(--fg); flex-shrink: 0.2; }
  button.crumb:hover { background: var(--bg-hover); color: var(--fg); }
  /* a phone: in its own bar, between the back button and the note's icons */
  :global(html.mobile) .crumbs { top: -52px; left: 50px; right: 138px; height: 52px; font-size: 14px; }
  .add-icon {
    display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: var(--fg-dim);
    font: inherit; font-size: 12.5px; padding: 3px 6px; margin-left: -6px; border-radius: 6px; opacity: 0;
    transition: opacity 0.15s, background 0.12s;
  }
  .add-icon svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  :global(main:hover) .add-icon, .add-icon:focus-visible { opacity: 1; }
  /* a phone has no hover: an unseen button above the title took a tap there and gave the note a random icon */
  :global(html.mobile) .add-icon { opacity: 1; }
  .add-icon:hover { background: var(--bg-hover); color: var(--fg); }
  .big-icon {
    border: 0; background: none; font-size: 56px; line-height: 1; padding: 4px; margin-left: -4px; border-radius: 10px;
    transition: background 0.12s, transform 0.12s;
  }
  .big-icon:hover { background: var(--bg-hover); }
  .big-icon:active { transform: scale(0.95); }
  .editor.has-head :global(.tiptap) { padding-top: 0; min-height: calc(100% - 72px); }

  /* On paper the head is a fixed block that holds the icon below the band at the top of the printed
     flow — WebKit lays that band out but never paints it, and the note's title used to vanish into it.
     The icon prints as a picture (a colour glyph only ever draws in part), left-aligned with the text
     rather than centred the way a button centres what it holds. */
  @media print {
    .page-head, .page-head.with-icon {
      height: 150px; padding: 84px 0 0; box-sizing: border-box; max-width: none; margin: 0; break-after: avoid;
    }
    .big-icon { display: block; width: 56px; height: 56px; padding: 0; margin: 0; }
    .add-icon { visibility: hidden; }
    .crumbs { display: none; }
  }
</style>
