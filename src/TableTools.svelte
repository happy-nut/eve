<script lang="ts">
  import type { Editor } from '@tiptap/core';

  /**
   * Row/column controls for the table the caret is in. A small bar over the table's top-left corner,
   * the way the outline rail sits beside the page — no grips to hunt for, and nothing on screen while
   * you are writing anywhere else.
   */
  let { editor }: { editor: Editor | undefined } = $props();

  let at = $state<{ x: number; y: number } | null>(null);

  function place() {
    const e = editor;
    // the caret's own element, not view.hasFocus(): a window that is not the frontmost one still has
    // a caret sitting in the table, and the bar should be there when it comes back
    const caretIn = document.activeElement && e?.view.dom.contains(document.activeElement);
    if (!e || e.isDestroyed || !caretIn || !e.isActive('table')) { at = null; return; }
    const dom = e.view.domAtPos(e.state.selection.from).node;
    const el = (dom instanceof HTMLElement ? dom : dom.parentElement)?.closest('table');
    if (!el) { at = null; return; }
    const r = el.getBoundingClientRect();
    at = { x: r.left, y: r.top - 8 };
  }

  $effect(() => {
    const e = editor;
    if (!e) return;
    const update = () => place();
    e.on('selectionUpdate', update);
    e.on('transaction', update);
    e.on('focus', update);
    e.on('blur', update);
    window.addEventListener('scroll', update, true); // the note scrolls under it
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
      { tip: 'Delete table', cmd: 'deleteTable', icon: '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9"/>' },
    ],
  ];
</script>

{#if at}
  <div class="tbl-tools" style:left="{at.x}px" style:top="{at.y}px" onmousedown={hold} role="toolbar" tabindex="-1" aria-label="Table">
    {#each GROUPS as group, g}
      {#if g}<span class="tbl-sep"></span>{/if}
      {#each group as b}
        <button class="icon tip-up" data-tip={b.tip} aria-label={b.tip} onclick={run(b.cmd)}>
          <svg viewBox="0 0 16 16">{@html b.icon}</svg>
        </button>
      {/each}
    {/each}
  </div>
{/if}

<style>
  .tbl-tools {
    position: fixed; z-index: 12; display: flex; align-items: center; gap: 1px;
    transform: translateY(-100%); padding: 3px; border-radius: 8px;
    background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  }
  .tbl-tools .icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .tbl-tools svg { width: 15px; height: 15px; display: block; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .tbl-sep { width: 1px; height: 15px; background: var(--line); margin: 0 3px; }
</style>
