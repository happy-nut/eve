<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { isMobile } from './lib/platform';
  import { pullDown, sheet } from './lib/popup';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, runEditorCommand } from './lib/editor';
  import { notes } from './lib/notes.svelte';
  import { cardDoc, splitCard } from './lib/markdown';
  import { hooks, ui } from './lib/ui.svelte';
  import Suggest from './Suggest.svelte';
  import DateMenu from './DateMenu.svelte';
  import EmojiRow from './EmojiRow.svelte';
  import Outline from './Outline.svelte';
  import TableTools from './TableTools.svelte';

  // a kanban card as a floating page (Notion "peek"): one markdown editor whose first line is the title,
  // like a note. One editing host, so a drag that starts in the title runs on into the body.
  const req = ui.card!;
  let el: HTMLDivElement;
  let scrollEl = $state<HTMLDivElement | null>(null);
  let suggest: ReturnType<typeof Suggest>;
  let dateMenu: ReturnType<typeof DateMenu>;
  let emojiRow: ReturnType<typeof EmojiRow>;
  let editor = $state<TipTap | undefined>();
  const close = () => ui.closeCard(); // it puts the keyboard back

  onMount(() => {
    editor = createEditor({
      element: el,
      content: req.markdown ?? cardDoc(req.title, req.body),
      onUpdate: (md) => (req.onMarkdown ? req.onMarkdown(md) : req.onChange(splitCard(md))),
      onOpenNote: (t) => { close(); notes.openByTitle(t); },
      targets: () => notes.pages,
      suggestionUI: suggest.ui,
      calendarUI: dateMenu.ui,
      emojiUI: emojiRow.ui,
    });
    // a card: caret at the end of its title line, so a long card opens at its top rather than scrolled to
    // the end. A day's note opens to be written in: under whatever is there.
    // focused first: in WebKit the focus command's own view.focus() fires the focus event at once, a plugin
    // dispatches on it, and the command's transaction no longer matched the state ("mismatched transaction").
    // The page then never finished opening, and Esc no longer closed it.
    editor.view.focus();
    if (req.markdown !== undefined) editor.commands.focus('end');
    else editor.commands.focus(editor.state.doc.firstChild!.nodeSize - 1);
    // the page grows in from a day opened with Enter: if the webview left the focus on that day behind
    // it, the keys (Esc included) would go to the calendar, not to the page
    const again = requestAnimationFrame(() => { if (!el.contains(document.activeElement)) editor?.view.focus(); });
    hooks.cardCommand = (id) => { if (editor) runEditorCommand(editor, id); }; // the phone's formatting bar
    return () => { cancelAnimationFrame(again); hooks.cardCommand = undefined; editor?.destroy(); };
  });

  /** a sheet slides up on a phone; the Mac's floating page grows in place */
  const appear = (node: HTMLElement) => sheet(node, (n) => scale(n, panelIn), dy);

  // a phone: pulled down by its handle, or from the top of the note, the sheet follows the finger and closes.
  // From inside the note only a drag that sets off at once: a finger held first is selecting text.
  let dy = $state(0);
  let dragging = $state(false);
  const pull = (node: HTMLElement) => isMobile ? pullDown(node, { onpull: (d, on) => { dy = d; dragging = on; }, onclose: close, scroller: () => scrollEl, quick: true }) : undefined;

  // a phone: no ⌫ on a focused card there, so the card's page carries the delete, asked first like a note's
  async function remove() {
    const title = editor?.state.doc.firstChild?.textContent.trim() || 'Untitled';
    const del = req.onDelete;
    if (!del || !(await ui.ask(`Delete “${title}”?`))) return;
    close();
    del();
  }

  function onKey(e: KeyboardEvent) {
    // a popup's Esc has already been taken by the editor (and closed the popup) by the time it gets here
    if (e.key === 'Escape' && (!e.defaultPrevented || (e as any).eveApp)) { e.preventDefault(); e.stopPropagation(); close(); }
    // Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the page
    if (e.key === 'Tab' && !e.defaultPrevented) e.preventDefault();
  }
</script>

<!-- preventDefault: the press would otherwise move the focus to the page under it after close() put it back -->
<div class="backdrop" transition:fade|global={scrimFade} style:opacity={dy ? Math.max(0.2, 1 - dy / 400) : null} onmousedown={(e) => { e.preventDefault(); close(); }} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="card-page" transition:appear|global use:pull class:dragging class:with-del={isMobile && !!req.onDelete} style:translate={dy ? `0 ${dy}px` : null}
  role="dialog" tabindex="-1" onkeydown={onKey}>
  {#if isMobile}
    <div class="grip" aria-hidden="true"></div>
    {#if req.onDelete}
      <button class="cdel" aria-label="Delete card" onclick={remove}>
        <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9M6.8 7v4.2M9.2 7v4.2"/></svg>
      </button>
    {/if}
  {/if}
  {#if req.note}<p class="tpl-note">{req.note}</p>{/if}
  <div class="card-scroll" bind:this={scrollEl}>
    <div class="card-body editor" bind:this={el}></div>
  </div>
  <Outline {scrollEl} {editor} />
</div>
<!-- outside the card: it is transformed, which would clip a fixed bar hanging over the table's top -->
<TableTools {editor} />
<Suggest bind:this={suggest} />
<DateMenu bind:this={dateMenu} />
<EmojiRow bind:this={emojiRow} />

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: 30; }
  .card-page {
    position: fixed; z-index: 31; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(760px, 92vw); height: min(80vh, 760px); display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-pop); border-radius: var(--panel-radius); box-shadow: var(--panel-shadow);
  }
  /* the scroller sits inside the card so the outline rail can stay put while the page scrolls */
  .card-scroll { flex: 1; padding: 40px 56px 0; overflow-y: auto; scrollbar-width: none; }
  .card-scroll::-webkit-scrollbar { display: none; }
  /* a phone: the note's own 20px margins, no card margin on top of them; a handle says it is a sheet */
  :global(html.mobile) .card-scroll { padding: 8px 0 0; }
  /* let go short of closing: it settles back */
  :global(html.mobile) .card-page { transition: translate 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
  :global(html.mobile) .card-page.dragging { transition: none; }
  .grip { flex: none; width: 36px; height: 4px; border-radius: 2px; margin: 8px auto 2px; background: var(--bg-active); }
  /* the card's delete, at the sheet's top right beside the handle; the title starts below it */
  .cdel {
    position: absolute; top: 4px; right: 6px; z-index: 1; width: 44px; height: 44px; border: 0; border-radius: 10px; background: none;
    color: var(--fg-dim); display: inline-flex; align-items: center; justify-content: center;
  }
  .cdel:active { background: var(--bg-active); }
  .cdel svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  :global(html.mobile) .card-page.with-del .card-scroll { padding-top: 40px; }
  .card-body { flex: 1; }
  .card-page .card-body :global(.tiptap) { padding: 0 0 120px; max-width: none; min-height: 100%; }
  /* an untitled card still shows where the title goes (the editor's own placeholder is for paragraphs) */
  .card-page .card-body :global(.tiptap > h1:first-child:has(> br:only-child))::before {
    content: 'Untitled'; color: var(--fg-dim); float: left; height: 0; pointer-events: none;
  }
  /* a template, not a card: says so above it */
  .tpl-note {
    margin: 0; padding: 10px 18px; font-size: 12.5px; color: var(--fg-dim);
    background: color-mix(in srgb, var(--accent) 7%, transparent); border-bottom: 1px solid var(--line);
  }
</style>
