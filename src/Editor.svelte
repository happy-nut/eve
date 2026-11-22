<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor as TipTap } from '@tiptap/core';
  import { takeBody, sameBody } from './lib/takeBody';
  import { createEditor, applyKeymap, goToSection, runEditorCommand, clickBelow } from './lib/editor';
  import { isMobile, pickImage } from './lib/platform';
  import { GRADIENTS, coverCss, gradientCover, randomCover } from './lib/cover';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { appearance } from './lib/appearance.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui, under, hooks } from './lib/ui.svelte';
  import Icon from './Icon.svelte';
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

  let suggest: ReturnType<typeof Suggest>;
  let dateMenu: ReturnType<typeof DateMenu>;
  let emojiRow: ReturnType<typeof EmojiRow>;

  let lastHandedOver = '';

  onMount(() => {
    const openedNoteId = note.id;
    lastHandedOver = note.body;
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => { lastHandedOver = md; notes.update(openedNoteId, md); },
      onNoteMove: (dir, onTitle) => (onTitle || openedFromList.id === note.id) && nudgeNote(note.id, dir),
      onOpenNote: (title) => {
        notes.flush(note.id);
        notes.openByTitle(title);
        if (notes.section && notes.currentId === note.id) {
          const s = notes.section;
          notes.section = '';
          goToSection(editor!, s);
        }
      },
      targets: () => notes.pages,
      page: () => openedNoteId,
      suggestionUI: suggest.ui,
      calendarUI: dateMenu.ui,
      emojiUI: emojiRow.ui,
      cursor: notes.section ? undefined : notes.cursor.get(note.id),
    });
    if (import.meta.env.DEV) (window as any).__editor = editor;
    hooks.attach = (md) => {
      const e = editor!;
      const content = (e.storage as any).markdown.parser.parse(md);
      const last = e.state.doc.lastChild;
      const chain = e.chain().focus('end');
      (last && last.content.size ? chain.splitBlock() : chain).insertContent(content).run();
    };
    hooks.command = (id) => {
      if (!editor) return;
      runEditorCommand(editor, id);
    };
    hooks.section = (heading) => editor && goToSection(editor, heading);
    hooks.page = () => el.querySelector<HTMLElement>('.tiptap');
    hooks.caretIntoView = () => {
      if (!editor || !scrollEl) return;
      const caret = editor.view.coordsAtPos(editor.state.selection.head);
      const box = scrollEl.getBoundingClientRect();
      if (caret.top >= box.top + 72 && caret.bottom <= box.bottom) return;
      scrollEl.scrollBy({ top: caret.top - (box.top + box.height / 2) });
    };
    // the empty line StarterKit keeps at the end of a note is only put there by the first transaction: before it, the
    // note's end is the end of its last block, and a caret sent there (opening a note) landed at the end of a closing
    // code block's last line, scrolling the code sideways to it. Put it there first, so the end is the empty line.
    // Opening a note is not writing in it: the editor's own spelling of it is not saved back, dated now.
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
    const section = notes.section;
    notes.section = '';
    if (section) {
      goToSection(editor, section);
    } else if (notes.selectTitle) {
      notes.selectTitle = false;
      editor.commands.setTextSelection({ from: 1, to: 1 + (editor.state.doc.firstChild?.content.size ?? 0) });
      editor.commands.focus();
    } else if (notes.caretEnd) {
      notes.caretEnd = false;
      editor.commands.focus('end');
    } else if (ui.focusOwner !== 'sidebar' && !isMobile) editor.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    return () => {
      hooks.attach = undefined;
      hooks.caretIntoView = undefined;
      hooks.section = undefined;
      hooks.page = undefined;
      hooks.command = undefined;
      if (editor) notes.cursor.set(openedNoteId, editor.state.selection.from);
      editor?.destroy();
      // Svelte runs teardown with pre-update state visible, so a flush here would persist stale data
      // (it resurrected deleted notes). Flush right after the batch instead.
      setTimeout(() => notes.flush(openedNoteId), 0);
    };
  });

  async function changeIcon(anchor: HTMLElement) {
    const v = await ui.pickEmoji(anchor, note.icon ?? '');
    if (v !== null) notes.setIcon(note.id, v);
    if (!isMobile) editor?.view.focus();
  }

  function addIcon() {
    notes.setIcon(note.id, randomIcon());
    if (!isMobile) editor?.view.focus();
  }

  function coverMenu(at: HTMLElement) {
    ui.openMenu(under(at), [
      ...Object.entries(GRADIENTS).map(([k, g]) => ({
        label: g.label, swatch: g.css, checked: note.cover === gradientCover(k), run: () => notes.setLook(note.id, { cover: gradientCover(k) }),
      })),
      { label: 'Image…', sep: true, run: () => void pickImage().then((src) => src && notes.setLook(note.id, { cover: src })) },
      { label: 'Remove cover', danger: true, run: () => notes.setLook(note.id, { cover: undefined }) },
    ]);
  }

  let fadeWaitsForCover = $state(true);
  const COVER_H = isMobile ? 160 : 220;
  const onScroll = () => { fadeWaitsForCover = !!note.cover && (scrollEl?.scrollTop ?? 0) < COVER_H - 72; };
  $effect(() => { void note.cover; onScroll(); });

  $effect(() => {
    if (editor && notes.caretEnd && notes.currentId === note.id) { notes.caretEnd = false; editor.commands.focus('end'); }
  });

  $effect(() => { void appearance.s.autoCorrect; if (editor) editor.view.setProps({}); });

  $effect(() => { shortcuts.actions; if (editor) applyKeymap(editor); });

  $effect(() => {
    const body = note.body;
    if (!editor || sameBody(body, lastHandedOver)) return;
    lastHandedOver = body;
    takeBody(editor, body);
  });
  const crumbs = $derived.by(() => {
    const pages: { label: string; icon: string; id: string }[] = [];
    const seen = new Set<string>([note.id]);
    for (let id = note.parent; id && !seen.has(id); ) {
      seen.add(id);
      const p = notes.all.find((n) => n.id === id && !n.deleted);
      if (!p) break;
      pages.unshift({ label: titleOf(p), icon: p.icon ?? '', id: p.id });
      id = p.parent;
    }
    return pages;
  });

  const backlinks = $derived(notes.linksTo(note.id));
  function showBacklinks(at: HTMLElement) {
    const short = (t: string) => (t.length > 60 ? t.slice(0, 59) + '…' : t);
    ui.openMenu(under(at), backlinks.map(({ note: n, line }) => ({
      label: line && line !== titleOf(n) ? `${short(titleOf(n))} — ${short(line)}` : short(titleOf(n)),
      run: () => { notes.flush(note.id); notes.currentId = n.id; },
    })));
  }

  function paneWidth(node: HTMLElement) {
    const put = () => node.style.setProperty('--pane', `${node.clientWidth}px`);
    put();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(put);
    watch.observe(node);
    return () => watch.disconnect();
  }
</script>

<div class="scroll" bind:this={scrollEl} onscroll={onScroll} class:cover-top={fadeWaitsForCover && !!note.cover}
  style:--editor-width={note.wide ? 'none' : null} style:--font-size={note.small ? `${appearance.smallPx}px` : null}>
  {#if note.cover}
    <div class="cover" style:background={coverCss(note.cover)} style:height="{COVER_H}px">
      <button class="cover-change" onclick={(e) => coverMenu(e.currentTarget)}>Change cover</button>
    </div>
  {/if}
  <div class="page-head" class:with-icon={!!note.icon} class:with-cover={!!note.cover}>
    {#if note.icon}
      <button class="big-icon" aria-label="Change icon" title="Change icon" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={isMobile ? 44 : 56} /></button>
    {/if}
    <div class="page-controls" class:none={!!note.icon && !!note.cover && !backlinks.length}>
    {#if !note.icon}
      <button class="add-icon" onmousedown={(e) => e.preventDefault()} onclick={addIcon}>
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
        Add icon
      </button>
    {/if}
    {#if !note.cover}
      <button class="add-icon add-cover" onmousedown={(e) => e.preventDefault()} onclick={() => notes.setLook(note.id, { cover: randomCover() })}>
        <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="m2.5 11 3.5-3.5 3 3 1.5-1.5 3 3"/></svg>
        Add cover
      </button>
    {/if}
    {#if backlinks.length}
      <button class="backlinks" title="Notes that link here" onclick={(e) => showBacklinks(e.currentTarget)}>
        <svg viewBox="0 0 16 16"><path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/></svg>
        {backlinks.length} {backlinks.length === 1 ? 'link' : 'links'} here
      </button>
    {/if}
    </div>
  </div>
  <div class="editor has-head" role="presentation" bind:this={el} {@attach paneWidth}
    onkeydown={(e) => {
      // …but a row of a diagram's form keeps Tab: to the next row, as anywhere a form is filled in (a database's fields,
      // a chart part's bar too)
      if (e.key === 'Tab' && !e.defaultPrevented && !(e.target as HTMLElement).closest?.('.dblock .form, .dblock .layer .bar, .db')) e.preventDefault();
      // any other key (or a click, below) means the note is being written in: ⌥↑ / ⌥↓ move lines again
      if (!(e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) openedFromList.id = '';
    }}
    onmousedown={() => (openedFromList.id = '')}
    onclick={(e) => { if (e.target === el && editor) clickBelow(editor.view, e); }}></div>
</div>
{#if crumbs.length}
  <nav class="crumbs" aria-label="Where this note is">
    {#each crumbs as c, i (i)}
      <span class="sep">/</span>
      <button class="crumb" onclick={() => (notes.currentId = c.id)}>{#if c.icon}<Icon icon={c.icon} size={14} />{/if}<span>{c.label}</span></button>
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
  .scroll { --head-top: 44px; --head-side: clamp(24px, 8vw, 96px); }
  @media screen {
    :global(html:not(.mobile)) .scroll { --head-top: 64px; }
    :global(main.tabbed) .scroll { --head-top: 24px; }
    :global(html.mobile) .scroll { --head-top: 18px; --head-side: 20px; }
  }
  .page-head {
    max-width: var(--editor-width, 900px); margin: 0 auto; padding: var(--head-top) var(--head-side) 0; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: flex-start;
  }
  .page-controls { display: flex; align-items: center; gap: 2px; width: 100%; height: 28px; margin: 4px 0; }
  .page-controls.none { height: 0; margin: 0 0 12px; }
  .backlinks {
    margin-left: auto; display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: var(--fg-dim);
    font: inherit; font-size: 12.5px; padding: 3px 6px; margin-right: -6px; border-radius: 6px; white-space: nowrap;
  }
  .backlinks svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  .backlinks:hover { background: var(--bg-hover); color: var(--fg); }
  .crumbs {
    position: absolute; top: 10px; right: 52px;
    left: max(14px, calc(214px - (100vw - 100%))); height: 24px; z-index: var(--z-toolbar); pointer-events: none;
    display: flex; align-items: center; gap: 2px; min-width: 0; overflow: hidden; font-size: 13px; color: var(--fg-dim); white-space: nowrap;
  }
  :global(main.tabbed) .crumbs { top: -61px; }
  :global(main:has(.find)) .crumbs { right: 400px; }
  .sep { opacity: 0.45; flex: none; padding: 0 1px; }
  .sep:first-child { display: none; }
  .crumb {
    display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 220px; height: 24px; padding: 0 6px;
    border-radius: 6px; border: 0; background: none; color: inherit; font: inherit; pointer-events: auto;
  }
  .crumb span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .crumb:not(.here) { min-width: 3.2em; flex-shrink: 1; }
  .crumb.here { color: var(--fg); flex-shrink: 0.2; }
  button.crumb:hover { background: var(--bg-hover); color: var(--fg); }
  :global(html.mobile) .crumbs { top: -52px; left: 50px; right: 146px; height: 52px; font-size: 14px; }
  :global(html.mobile) .crumbs > :not(:nth-last-child(-n + 3)) { display: none; }
  :global(html.mobile .shell:not(:has(> .mhead))) .crumbs { display: none; }
  .add-icon {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; border: 0; background: none; color: var(--fg-dim);
    font: inherit; font-size: 13.5px; padding: 0 8px 0 6px; border-radius: 6px; opacity: 0;
    transition: opacity 0.15s, background 0.12s;
  }
  .page-controls > :first-child { margin-left: -6px; }
  .add-icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  :global(main:hover) .add-icon, .add-icon:focus-visible { opacity: 1; }
  :global(html.mobile) .add-icon { opacity: 1; }
  .add-icon:hover { background: var(--bg-hover); color: var(--fg); }
  .add-icon:focus-visible, .big-icon:focus-visible { outline: none; background: var(--bg-hover); box-shadow: 0 0 0 2px var(--accent-soft); }
  .big-icon {
    border: 0; background: none; font-size: 56px; line-height: 1; padding: 4px; margin-left: -4px; border-radius: 10px;
    transition: background 0.12s, transform 0.12s;
  }
  .big-icon:hover { background: var(--bg-hover); }
  .big-icon:active { transform: scale(0.95); }
  .editor.has-head :global(.tiptap) { padding-top: 0; min-height: calc(100% - 72px); }
  .cover { position: relative; width: 100%; }
  :global(html:not(.mobile) main:not(.tabbed)) .cover { margin-top: 44px; }
  .cover-change {
    position: absolute; right: clamp(24px, 8vw, 96px); bottom: 12px; border: 0; border-radius: 6px; padding: 4px 9px;
    font: inherit; font-size: 12.5px; color: var(--fg-dim); background: var(--bg-pop); box-shadow: var(--pop-shadow);
    opacity: 0; transition: opacity 0.15s;
  }
  .cover:hover .cover-change, .cover-change:focus-visible { opacity: 1; }
  :global(html.mobile) .cover-change { opacity: 1; }
  .cover-change:hover { color: var(--fg); }
  .page-head.with-cover { padding-top: 12px; }
  .page-head.with-cover.with-icon { padding-top: 0; }
  .page-head.with-cover { position: relative; }
  .page-head.with-cover .big-icon { margin-top: -38px; }

  /* On paper the head is a fixed block that holds the icon below the band at the top of the printed
     flow — WebKit lays that band out but never paints it, and the note's title used to vanish into it.
     The icon prints as a picture (a colour glyph only ever draws in part), left-aligned with the text
     rather than centred the way a button centres what it holds. */
  @media print {
    .page-head, .page-head.with-icon {
      height: 150px; padding: 84px 0 0; box-sizing: border-box; max-width: none; margin: 0; break-after: avoid;
    }
    .big-icon { display: block; width: 56px; height: 56px; padding: 0; margin: 0; }
    .add-icon, .backlinks { visibility: hidden; }
    .cover { display: none; }
    .crumbs { display: none; }
  }
</style>
