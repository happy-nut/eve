<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { isMobile } from './lib/platform';
  import { sheet } from './lib/popup';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor } from './lib/editor';
  import { notes } from './lib/notes.svelte';
  import { cardDoc, splitCard } from './lib/markdown';
  import { ui } from './lib/ui.svelte';
  import Suggest from './Suggest.svelte';
  import DateMenu from './DateMenu.svelte';
  import Outline from './Outline.svelte';
  import TableTools from './TableTools.svelte';

  // a kanban card as a floating page (Notion "peek"): one markdown editor whose first line is the title,
  // like a note. One editing host, so a drag that starts in the title runs on into the body.
  const req = ui.card!;
  let el: HTMLDivElement;
  let scrollEl = $state<HTMLDivElement | null>(null);
  let suggest: ReturnType<typeof Suggest>;
  let dateMenu: ReturnType<typeof DateMenu>;
  let editor = $state<TipTap | undefined>();
  const returnTo = document.activeElement as HTMLElement | null;

  function close() { returnTo?.isConnected && returnTo.focus(); ui.closeCard(); }

  onMount(() => {
    editor = createEditor({
      element: el,
      content: req.markdown ?? cardDoc(req.title, req.body),
      onUpdate: (md) => (req.onMarkdown ? req.onMarkdown(md) : req.onChange(splitCard(md))),
      onOpenNote: (t) => { close(); notes.openByTitle(t); },
      targets: () => notes.pages,
      suggestionUI: suggest.ui,
      calendarUI: dateMenu.ui,
    });
    // a card: caret at the end of its title line, so a long card opens at its top rather than scrolled to
    // the end. A day's note opens to be written in: under whatever is there.
    if (req.markdown !== undefined) editor.commands.focus('end');
    else editor.commands.focus(editor.state.doc.firstChild!.nodeSize - 1);
    editor.view.focus();
    // the page grows in from a day opened with Enter: if the webview left the focus on that day behind
    // it, the keys (Esc included) would go to the calendar, not to the page
    const again = requestAnimationFrame(() => { if (!el.contains(document.activeElement)) editor?.view.focus(); });
    return () => { cancelAnimationFrame(again); editor?.destroy(); };
  });

  /** a sheet slides up on a phone; the Mac's floating page grows in place */
  const appear = (node: HTMLElement) => sheet(node, (n) => scale(n, { start: 0.96, duration: 180 }));

  function onKey(e: KeyboardEvent) {
    // a popup's Esc has already been taken by the editor (and closed the popup) by the time it gets here
    if (e.key === 'Escape' && (!e.defaultPrevented || (e as any).eveApp)) { e.preventDefault(); e.stopPropagation(); close(); }
    // Tab indents a list (the editor marks those handled); anywhere else it must not walk focus out of the page
    if (e.key === 'Tab' && !e.defaultPrevented) e.preventDefault();
  }
</script>

<div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={close} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="card-page" transition:appear role="dialog" tabindex="-1" onkeydown={onKey}>
  {#if isMobile}<div class="grip" aria-hidden="true"></div>{/if}
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

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); z-index: 30; }
  .card-page {
    position: fixed; z-index: 31; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(760px, 92vw); height: min(80vh, 760px); display: flex; flex-direction: column; overflow: hidden;
    border-radius: 14px; background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  }
  /* the scroller sits inside the card so the outline rail can stay put while the page scrolls */
  .card-scroll { flex: 1; padding: 40px 56px 0; overflow-y: auto; scrollbar-width: none; }
  .card-scroll::-webkit-scrollbar { display: none; }
  /* a phone: the note's own 20px margins, no card margin on top of them; a handle says it is a sheet */
  :global(html.mobile) .card-scroll { padding: 8px 0 0; }
  .grip { flex: none; width: 36px; height: 4px; border-radius: 2px; margin: 8px auto 2px; background: var(--bg-active); }
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
