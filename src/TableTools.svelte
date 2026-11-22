<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { floatAt, screenInsets } from './lib/popup';
  import { isMobile } from './lib/platform';
  import { scrollHint } from './lib/scrollHint';

  let { editor, sheet = false }: { editor: Editor | undefined; sheet?: boolean } = $props();

  let at = $state<{ x: number; y: number } | null>(null);

  function place() {
    if (!isMobile) { at = null; return; }
    const e = editor;
    if (!e || e.isDestroyed) { at = null; return; }
    const caretIn = document.activeElement && e.view.dom.contains(document.activeElement);
    if (!caretIn || !e.isActive('table')) { at = null; return; }
    const dom = e.view.domAtPos(e.state.selection.from).node;
    const el = (dom instanceof HTMLElement ? dom : dom.parentElement)?.closest('table');
    if (!el) { at = null; return; }
    const r = el.getBoundingClientRect();
    if (!bar) requestAnimationFrame(() => { if (bar) place(); });
    const h = bar?.offsetHeight ?? 32, w = bar?.offsetWidth ?? 0;
    const above = gap(el, -1, r), ins = screenInsets(), top = scrollTop(el);
    const shown = above >= h + 3 ? Math.min(Math.max(r.top, top + 4 + h + 8), r.bottom) : r.top;
    const f = floatAt({ left: r.left, right: r.right, top: shown, bottom: r.bottom }, { w, h },
      { prefer: 'above', gap: 8, avoid: { ...ins, top: Math.max(ins.top, top + 4) } });
    at = { x: f.left, y: f.top + h };
  }

  function gap(table: HTMLElement, dir: -1 | 1, r: DOMRect): number {
    const root = editor?.view.dom;
    let block: Element = table.closest('.tableWrapper') ?? table;
    let next = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
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

  function scrollTop(el: HTMLElement): number {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return Math.max(0, p.getBoundingClientRect().top);
    }
    return 0;
  }
  let bar = $state<HTMLDivElement | null>(null);

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
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      e.off('selectionUpdate', update);
      e.off('transaction', update);
      e.off('focus', update);
      e.off('blur', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  });

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
  <div class="tbl-tools" class:sheet bind:this={bar} {@attach scrollHint} style:left="{at.x}px" style:top="{at.y}px" onmousedown={hold} role="toolbar" tabindex="-1" aria-label="Table">
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
  .tbl-tools .icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .tbl-tools svg { width: 15px; height: 15px; display: block; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .tbl-sep { width: 1px; height: 15px; background: var(--line); margin: 0 3px; }
  :global(html.mobile) .tbl-tools { max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile) .tbl-tools .icon { flex: none; width: 38px; height: 38px; }
  :global(html.mobile) .tbl-tools svg { width: 19px; height: 19px; }
  :global(html.mobile) .tbl-tools .gap { margin-left: 14px; color: #ff453a; }
  :global(html.mobile) .tbl-sep { flex: none; height: 20px; }
</style>
