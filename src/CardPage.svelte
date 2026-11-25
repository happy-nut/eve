<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { panelIn } from './lib/motion';
  import Scrim from './Scrim.svelte';
  import { isMobile } from './lib/platform';
  import { pullDown, sheet } from './lib/popup';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, runEditorCommand } from './lib/editor';
  import { notes } from './lib/notes.svelte';
  import { cardDoc, splitCard } from './lib/markdown';
  import { hooks, ui, under, type CardReq } from './lib/ui.svelte';
  import type { CardMore } from './lib/board';
  import { TextSelection } from '@tiptap/pm/state';
  import Suggest from './Suggest.svelte';
  import DateMenu from './DateMenu.svelte';
  import EmojiRow from './EmojiRow.svelte';
  import Outline from './Outline.svelte';
  import TableTools from './TableTools.svelte';
  import { composing, handledBy } from './lib/keys';

  let { req }: { req: CardReq & CardMore } = $props();
  let column = $state(untrack(() => req.column));
  let el: HTMLDivElement;
  let scrollEl = $state<HTMLDivElement | null>(null);
  let suggest: ReturnType<typeof Suggest>;
  let dateMenu: ReturnType<typeof DateMenu>;
  let emojiRow: ReturnType<typeof EmojiRow>;
  let editor = $state<TipTap | undefined>();
  const close = () => ui.closeCard();
  function cardOf(md: string) {
    const card = splitCard(md), first = editor?.state.doc.firstChild;
    let text = first?.type.name === 'heading';
    first?.forEach((n) => { if (!n.isText) text = false; });
    if (card.title && text) card.title = first!.textContent;
    return card;
  }

  onMount(() => {
    editor = createEditor({
      element: el,
      content: req.markdown ?? cardDoc(req.title, req.body),
      onUpdate: (md) => (req.onMarkdown ? req.onMarkdown(md) : req.onChange(cardOf(md))),
      onOpenNote: (t) => { close(); notes.openByTitle(t); },
      targets: () => notes.pages,
      page: req.page ?? (() => null),
      suggestionUI: suggest.ui,
      calendarUI: dateMenu.ui,
      emojiUI: emojiRow.ui,
    });
    // a card: caret at the end of what it says, to go on writing it (a card with no title yet, or one being named
    // as it was typed on the board: at the end of its title). A day's note opens to be written in: under whatever is
    // there.
    // focused first: in WebKit the focus command's own view.focus() fires the focus event at once, a plugin
    // dispatches on it, and the command's transaction no longer matched the state ("mismatched transaction").
    // The page then never finished opening, and Esc no longer closed it.
    editor.view.focus();
    if (req.markdown !== undefined || (req.title.trim() && req.caret !== 'title')) editor.commands.focus('end');
    else editor.commands.focus(editor.state.doc.firstChild!.nodeSize - 1);
    const refocusIfLost = requestAnimationFrame(() => { if (!el.contains(document.activeElement)) editor?.view.focus(); });
    const outerCardCommand = hooks.cardCommand, ownCardCommand = (id: string) => { if (editor) runEditorCommand(editor, id); };
    hooks.cardCommand = ownCardCommand;
    return () => { cancelAnimationFrame(refocusIfLost); if (hooks.cardCommand === ownCardCommand) hooks.cardCommand = outerCardCommand; editor?.destroy(); };
  });

  const appear = (node: HTMLElement) => sheet(node, (n) => scale(n, panelIn), dy);

  let dy = $state(0);
  let dragging = $state(false);
  const pull = (node: HTMLElement) => isMobile ? pullDown(node, { onpull: (d, on) => { dy = d; dragging = on; }, onclose: close, scroller: () => scrollEl, quick: true }) : undefined;

  async function remove() {
    const title = editor?.state.doc.firstChild?.textContent.trim() || 'Untitled';
    const del = req.onDelete;
    if (!del || !(await ui.ask(`Delete “${title}”?`))) return;
    close();
    del();
  }

  function moveMenu(e: MouseEvent) {
    ui.openMenu(under(e.currentTarget as HTMLElement), (req.columns ?? []).map((c) => ({
      label: c.title || 'Untitled', checked: c.id === column, run: () => { req.move?.(c.id); column = c.id; editor?.commands.focus(); },
    })));
  }
  const columnTitle = $derived((req.columns?.find((c) => c.id === column)?.title || 'Untitled'));

  function titleEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || composing(e) || req.markdown !== undefined || !editor) return;
    const { state, view } = editor, { selection: sel, doc } = state, title = doc.firstChild;
    if (!sel.empty || title?.type.name !== 'heading' || sel.$from.parent !== title || sel.$from.parentOffset !== title.content.size) return;
    if (ui.menu || document.querySelector('.suggest')) return;
    e.preventDefault();
    e.stopPropagation();
    const after = title.nodeSize, next = doc.nodeAt(after), para = state.schema.nodes.paragraph;
    const tr = state.tr;
    if (!(next?.type === para && !next.content.size)) tr.insert(after, para.create());
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  }

  function keepTabInPage(e: KeyboardEvent) {
    if (!e.defaultPrevented) e.preventDefault();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && handledBy(e) !== 'taken') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Tab') keepTabInPage(e);
  }
</script>

<Scrim layer="sheet" tint="var(--scrim)" pulled={dy} onclose={close} />
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="card-page" transition:appear|global use:pull class:dragging class:with-del={isMobile && (!!req.onDelete || !!req.move)} style:translate={dy ? `0 ${dy}px` : null}
  role="dialog" tabindex="-1" onkeydown={onKey} onkeydowncapture={titleEnter}>
  {#if isMobile}<div class="grip" aria-hidden="true"></div>{/if}
  <div class="ctools">
    {#if req.move && (req.columns?.length ?? 0) > 1}
      <button class="cmove" aria-label="Move to another column" title="Move to another column" onmousedown={(e) => e.preventDefault()} onclick={moveMenu}>
        <svg viewBox="0 0 16 16"><path d="M2.5 8h10M9.5 5l3 3-3 3"/></svg><span>{columnTitle}</span>
      </button>
    {/if}
    {#if req.onDelete}
      <button class="cdel" aria-label="Delete card" title="Delete card" onmousedown={(e) => e.preventDefault()} onclick={remove}>
        <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9M6.8 7v4.2M9.2 7v4.2"/></svg>
      </button>
    {/if}
    {#if !isMobile}
      <button class="cclose" aria-label="Close" title="Close (Esc)" onmousedown={(e) => e.preventDefault()} onclick={close}>
        <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>
      </button>
    {/if}
  </div>
  {#if req.note}<p class="tpl-note">{req.note}</p>{/if}
  <div class="card-scroll" bind:this={scrollEl}>
    <div class="card-body editor" bind:this={el}></div>
  </div>
  <Outline {scrollEl} {editor} />
</div>
<!-- outside the card: it is transformed, which would clip a fixed bar hanging over the table's top -->
<TableTools {editor} overSheet />
<Suggest bind:this={suggest} />
<DateMenu bind:this={dateMenu} />
<EmojiRow bind:this={emojiRow} />

<style>
  .card-page {
    /* in the middle by its margins, not a transform: a transform makes the card the box a diagram's whole screen
       fills (app.css takes it off then), and with it off a translate's card sat with its corner in the middle */
    position: fixed; z-index: var(--z-sheet); inset: 0; margin: auto;
    width: min(92vw, max(760px, 66vw), 1240px); height: min(86vh, max(760px, 80vh), 1100px); display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-pop); border-radius: var(--panel-radius); box-shadow: var(--panel-shadow);
  }
  .card-scroll { flex: 1; padding: 40px 56px 0; overflow-y: auto; scrollbar-width: none; }
  .card-scroll::-webkit-scrollbar { display: none; }
  :global(html.mobile) .card-scroll { padding: 8px 0 0; }
  :global(html.mobile) .card-page { transition: translate 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
  :global(html.mobile) .card-page.dragging { transition: none; }
  .grip { flex: none; width: 36px; height: 4px; border-radius: 2px; margin: 8px auto 2px; background: var(--bg-active); }
  .ctools { position: absolute; top: 8px; right: 10px; z-index: var(--z-raised); display: flex; align-items: center; gap: 2px; }
  .ctools button {
    height: 30px; min-width: 30px; border: 0; border-radius: 8px; background: none; padding: 0 6px; font: inherit; font-size: 12.5px;
    color: var(--fg-dim); display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  }
  @media (hover: hover) { .ctools button:hover { background: var(--bg-hover); color: var(--fg); } .ctools .cdel:hover { color: #ff453a; } }
  .ctools button:active { background: var(--bg-active); }
  .ctools svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .cmove span { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(html.mobile) .ctools { top: 4px; right: 6px; gap: 6px; }
  :global(html.mobile) .ctools button { height: 44px; min-width: 44px; border-radius: 10px; font-size: 14px; }
  :global(html.mobile) .ctools svg { width: 21px; height: 21px; }
  :global(html.mobile) .card-page.with-del .card-scroll { padding-top: 40px; }
  .card-body { flex: 1; }
  .card-page .card-body :global(.tiptap) { padding: 0 0 120px; max-width: none; min-height: 100%; }
  .card-page .card-body :global(.tiptap > h1:first-child:has(> br:only-child))::before {
    content: 'Untitled'; color: var(--fg-dim); float: left; height: 0; pointer-events: none;
  }
  .tpl-note {
    margin: 0; padding: 10px 52px 10px 18px; font-size: 12.5px; color: var(--fg-dim);
    background: color-mix(in srgb, var(--accent) 7%, transparent); border-bottom: 1px solid var(--line);
  }
</style>
