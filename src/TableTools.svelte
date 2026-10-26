<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { floatAt, screenInsets } from './lib/popup';
  import { isMobile } from './lib/platform';
  import { scrollHint } from './lib/scrollHint';

  /**
   * Row/column controls for the table the caret is in, on a phone (a Mac has the table's own handles, Notion's:
   * tableHandles.ts). A small bar over the table's top-left corner,
   * the way the outline rail sits beside the page — no grips to hunt for, and nothing on screen while
   * you are writing anywhere else. On a Mac only while the pointer is over that table (or the bar): there with every
   * caret in the table, it sat over the top-right cells and covered what was being typed in them. A phone has no
   * pointer to bring it up, and keeps it while the caret is in the table.
   */
  /** `sheet`: the editor is a card's or a day's page (--z-sheet), which drew over the bar and left a table there with
   *  no way to add a row; the bar goes over that page then, still under the phone's formatting bar (--z-phone-bar) */
  let { editor, sheet = false }: { editor: Editor | undefined; sheet?: boolean } = $props();

  /** `inside`: over the table's own top-right corner, smaller (no room above it or under it) */
  let at = $state<{ x: number; y: number; inside?: boolean } | null>(null);

  function place() {
    // a Mac has the table's own handles instead, under the pointer (tableHandles.ts)
    if (!isMobile) { at = null; return; }
    const e = editor;
    if (!e || e.isDestroyed) { at = null; return; } // gone already (the note was switched)
    // the caret's own element, not view.hasFocus(): a window that is not the frontmost one still has
    // a caret sitting in the table, and the bar should be there when it comes back
    const caretIn = document.activeElement && e.view.dom.contains(document.activeElement);
    if (!caretIn || !e.isActive('table')) { at = null; return; }
    const dom = e.view.domAtPos(e.state.selection.from).node;
    const el = (dom instanceof HTMLElement ? dom : dom.parentElement)?.closest('table');
    if (!el) { at = null; return; }
    const r = el.getBoundingClientRect();
    if (!isMobile && !pointerOver(r)) { at = null; return; }
    // (not drawn yet, its size is not known: placed again once it is)
    if (!bar) requestAnimationFrame(() => { if (bar) place(); });
    const h = bar?.offsetHeight ?? 32, w = bar?.offsetWidth ?? 0, was = !!at?.inside;
    // the room it needs is its full size's, also while it is the smaller one (judged by that, it went back and forth)
    if (bar && !was) fullH = h;
    const tall = was ? fullH || h + 5 : h;
    // Over the table where nothing is written above it, else under it where nothing is under it: over the table's top
    // it sat on the line above, which could not be read while the table was edited. With text close on both sides,
    // smaller, in the table's own top-right corner. (It never pushes the note apart: moving text under the caret.)
    // That is floatAt's room `within` the band from the line above to the line under; as far off the table as that
    // room lets it be, up to 8px; kept on screen across (a table scrolled sideways, or a phone's bar wider than a narrow
    // table, left the bar's end off it) and under the note's scroll area's top.
    const above = gap(el, -1, r), under = gap(el, 1, r), ins = screenInsets(), top = scrollTop(el);
    // in a table taller than the window the top had scrolled away and the bar with it, out of sight above the note
    // while the caret was in a row on screen. It stays at the top of the note's scroll area then, as long as some
    // of the table is still under it: what of the table is on screen is what it goes over.
    const shown = above >= tall + 3 ? Math.min(Math.max(r.top, top + 4 + tall + 8), r.bottom) : r.top;
    const f = floatAt({ left: r.left, right: r.right, top: shown, bottom: r.bottom }, { w, h: tall },
      { prefer: 'above', gap: 8, avoid: { ...ins, top: Math.max(ins.top, top + 4) }, within: { left: -Infinity, right: Infinity, top: r.top - above, bottom: r.bottom + under } });
    // (y is the bar's foot: it is drawn up from there)
    at = { x: f.left, y: f.side === 'above' ? f.top + tall : f.top + h, inside: f.side === 'inside' };
    // smaller in the corner, larger out of it: placed again at its new size
    if (!!at.inside !== was) requestAnimationFrame(place);
  }

  /** How far off the table the nearest thing written is on that side (-1 above, 1 under): the nearest block with
   *  something in it, past empty lines; none, no end */
  function gap(table: HTMLElement, dir: -1 | 1, r: DOMRect): number {
    const root = editor?.view.dom;
    let block: Element = table.closest('.tableWrapper') ?? table;
    let next = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
    // the table first (last) in what holds it (a callout, a list item): what is beside that
    while (!next && block.parentElement && block.parentElement !== root) {
      block = block.parentElement;
      next = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
    }
    const blank = (el: Element) => !el.textContent?.trim() && !el.querySelector('img, video, svg, iframe, canvas, hr, table');
    while (next && blank(next)) next = dir < 0 ? next.previousElementSibling : next.nextElementSibling;
    if (!next) return Infinity;
    const n = next.getBoundingClientRect();
    return dir < 0 ? r.top - n.bottom : n.top - r.bottom;
  }

  /** where the area the table scrolls in begins on screen (the window's top when nothing in between scrolls) */
  function scrollTop(el: HTMLElement): number {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return Math.max(0, p.getBoundingClientRect().top);
    }
    return 0;
  }
  let bar = $state<HTMLDivElement | null>(null);
  let fullH = 0;

  /** where the pointer last was, and whether it is over the table, the bar, or the gap between them (crossed on the
   *  way from one to the other: the bar must not go before it is reached) */
  let pointer: { x: number; y: number } | null = null;
  function pointerOver(r: DOMRect): boolean {
    if (!pointer) return false;
    const b = bar?.getBoundingClientRect();
    const left = Math.min(r.left, b?.left ?? r.left), right = Math.max(r.right, b?.right ?? r.right);
    const top = Math.min(r.top, b?.top ?? r.top) - 4, bottom = Math.max(r.bottom, b?.bottom ?? r.bottom) + 4;
    return pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom;
  }

  $effect(() => {
    const e = editor;
    if (!e) return;
    // a moment later, not inside the event: switching notes destroys this editor in the middle of the page's own
    // update, and its blur arriving then may not touch state (Svelte's state_unsafe_mutation)
    const update = () => queueMicrotask(place);
    e.on('selectionUpdate', update);
    e.on('transaction', update);
    e.on('focus', update);
    e.on('blur', update);
    window.addEventListener('scroll', update, true); // the note scrolls under it
    window.addEventListener('resize', update);
    // the pointer coming over the table or leaving it (a Mac: the bar shows only then)
    const moved = (ev: PointerEvent) => { const was = pointer; pointer = { x: ev.clientX, y: ev.clientY }; if (!was || at || e.isActive('table')) update(); };
    const left = () => { pointer = null; update(); };
    if (!isMobile) { window.addEventListener('pointermove', moved, { passive: true }); document.documentElement.addEventListener('pointerleave', left); }
    update();
    return () => {
      e.off('selectionUpdate', update);
      e.off('transaction', update);
      e.off('focus', update);
      e.off('blur', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('pointermove', moved);
      document.documentElement.removeEventListener('pointerleave', left);
    };
  });

  /** the press must not take the caret out of the cell it is about to act on */
  const hold = (ev: MouseEvent) => ev.preventDefault();
  const run = (name: string) => () => (editor as any)?.chain().focus()[name]().run();

  const GROUPS: { tip: string; cmd: string; icon: string; gap?: boolean }[][] = [
    [
      { tip: 'Row above', cmd: 'addRowBefore', icon: '<rect x="2.5" y="8" width="11" height="5.5" rx="1"/><path d="M8 2v4M6 4l2-2 2 2"/>' },
      { tip: 'Row below', cmd: 'addRowAfter', icon: '<rect x="2.5" y="2.5" width="11" height="5.5" rx="1"/><path d="M8 14v-4M6 12l2 2 2-2"/>' },
      { tip: 'Delete row', cmd: 'deleteRow', icon: '<rect x="2.5" y="5.2" width="11" height="5.5" rx="1"/><path d="M5.6 8h4.8"/>' },
    ],
    [
      { tip: 'Column left', cmd: 'addColumnBefore', icon: '<rect x="8" y="2.5" width="5.5" height="11" rx="1"/><path d="M2 8h4M4 6 2 8l2 2"/>' },
      { tip: 'Column right', cmd: 'addColumnAfter', icon: '<rect x="2.5" y="2.5" width="5.5" height="11" rx="1"/><path d="M14 8h-4M12 6l2 2-2 2"/>' },
      { tip: 'Delete column', cmd: 'deleteColumn', icon: '<rect x="5.2" y="2.5" width="5.5" height="11" rx="1"/><path d="M8 5.6v4.8"/>' },
    ],
    [
      { tip: 'Header row', cmd: 'toggleHeaderRow', icon: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6.2h11"/>' },
      { tip: 'Merge or split', cmd: 'mergeOrSplit', icon: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M8 3v3M8 10v3"/>' },
      { tip: 'Delete table', cmd: 'deleteTable', gap: true, icon: '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9"/>' },
    ],
  ];
</script>

{#if at}
  <div class="tbl-tools" class:sheet class:inside={at.inside} bind:this={bar} {@attach scrollHint} style:left="{at.x}px" style:top="{at.y}px" onmousedown={hold} role="toolbar" tabindex="-1" aria-label="Table">
    {#each GROUPS as group, g}
      {#if g}<span class="tbl-sep"></span>{/if}
      {#each group as b}
        <button class="icon tip-up" class:gap={b.gap} data-tip={b.tip} aria-label={b.tip} onclick={run(b.cmd)}>
          <svg viewBox="0 0 16 16">{@html b.icon}</svg>
        </button>
      {/each}
    {/each}
  </div>
{/if}

<style>
  .tbl-tools {
    position: fixed; z-index: var(--z-block-bar); display: flex; align-items: center; gap: 1px;
    transform: translateY(-100%); padding: 3px;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
  }
  .tbl-tools.sheet { z-index: var(--z-over-sheet); }
  /* in the table's corner, over its cells: smaller, and see-through until the pointer comes to it */
  .tbl-tools.inside { padding: 2px; opacity: 0.88; transition: opacity 0.12s; }
  .tbl-tools.inside:hover { opacity: 1; }
  :global(html:not(.mobile)) .tbl-tools.inside .icon { width: 21px; height: 21px; }
  :global(html:not(.mobile)) .tbl-tools.inside svg { width: 13px; height: 13px; }
  .tbl-tools .icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .tbl-tools svg { width: 15px; height: 15px; display: block; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .tbl-sep { width: 1px; height: 15px; background: var(--line); margin: 0 3px; }
  /* a phone: buttons a finger can hit, and Delete table set apart from Merge or split beside it. Too wide for a
     narrow screen, the row scrolls sideways */
  :global(html.mobile) .tbl-tools { max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile) .tbl-tools .icon { flex: none; width: 38px; height: 38px; }
  :global(html.mobile) .tbl-tools svg { width: 19px; height: 19px; }
  /* set well apart from Merge or split (a tap a little off must not delete the table); on a narrow phone the bar scrolls,
     its end fading, to reach it */
  :global(html.mobile) .tbl-tools .gap { margin-left: 14px; color: #ff453a; }
  :global(html.mobile) .tbl-sep { flex: none; height: 20px; }
</style>
