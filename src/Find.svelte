<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { caretIn } from './lib/motion';
  import type { Editor } from '@tiptap/core';
  import { findState, setQuery, step, replaceOne, replaceAll, clearFind } from './lib/find';
  import { ui } from './lib/ui.svelte';
  import { composing } from './lib/keys';
  import { isMobile } from './lib/platform';

  let { editor }: { editor: Editor | undefined } = $props();

  let query = $state('');
  let replacement = $state('');
  let replacing = $state(false);
  let bar = $state<HTMLDivElement | null>(null);
  let count = $state({ index: 0, total: 0 });

  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };

  function sync() {
    if (!editor) return;
    const s = findState(editor);
    count = { index: s.hits.length ? s.index + 1 : 0, total: s.hits.length };
  }

  $effect(() => {
    const e = editor;
    if (!e) return;
    const on = () => sync();
    e.on('transaction', on);
    sync();
    return () => { e.off('transaction', on); clearFind(e); };
  });

  function type(value: string) {
    query = value;
    if (editor) setQuery(editor, value);
    sync();
  }

  function walk(dir: 1 | -1) {
    if (editor) step(editor, dir);
    sync();
  }

  function close() {
    ui.closeFind();
    editor?.commands.focus();
  }

  function replaceNext() {
    if (editor) replaceOne(editor, replacement);
    sync();
  }

  function makeRoom(bar: HTMLElement) {
    const scroll = isMobile ? bar.parentElement?.querySelector<HTMLElement>(':scope > .scroll') : null;
    if (!scroll) return;
    const fit = () => { scroll.style.paddingTop = `${bar.offsetHeight + 8}px`; };
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(bar);
    fit();
    return { destroy() { ro.disconnect(); scroll.style.paddingTop = ''; } };
  }

  const inReplaceField = (e: KeyboardEvent) => replacing && !e.shiftKey && (e.target as HTMLElement).classList.contains('rep');

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    else if (e.key !== 'Enter' || composing(e)) return;
    e.preventDefault();
    if (inReplaceField(e)) replaceNext();
    else walk(e.shiftKey ? -1 : 1);
  }
</script>

<!-- its buttons keep the keyboard in the field (WebKit gives a clicked button no focus: it went to nothing, and ↩ no
     longer stepped through the matches) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="find" bind:this={bar} use:makeRoom transition:fly|global={{ ...caretIn, y: -6 }} onkeydown={onKey} onmousedown={(e) => { if ((e.target as Element).closest('button')) e.preventDefault(); }} role="search">
  <div class="line">
    <svg class="glass" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>
    <input use:focus placeholder="Find" spellcheck="false" value={query} oninput={(e) => type(e.currentTarget.value)} />
    <span class="count">{count.total ? `${count.index}/${count.total}` : query ? '0/0' : ''}</span>
    <button class="icon" data-tip="Previous (⇧↩)" aria-label="Previous" onclick={() => walk(-1)}>
      <svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4"/></svg>
    </button>
    <button class="icon" data-tip="Next (↩)" aria-label="Next" onclick={() => walk(1)}>
      <svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>
    </button>
    <button class="icon" class:on={replacing} data-tip="Replace" aria-label="Replace" onclick={async () => { replacing = !replacing; if (replacing) { await tick(); bar?.querySelector<HTMLInputElement>('input.rep')?.focus(); } }}>
      <svg viewBox="0 0 16 16"><path d="M3 5.5h7.5a2 2 0 0 1 0 4H8M5 3.5l-2 2 2 2M11 12.5l2-2-2-2"/></svg>
    </button>
    <button class="icon" data-tip="Close (Esc)" aria-label="Close" onclick={close}>
      <svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>
    </button>
  </div>
  {#if replacing}
    <div class="line">
      <span class="glass-gap" aria-hidden="true"></span>
      <input class="rep" placeholder="Replace with" spellcheck="false" bind:value={replacement} />
      <button class="icon" data-tip="Replace (↩)" aria-label="Replace" onclick={replaceNext}>
        <svg viewBox="0 0 16 16"><rect x="8.2" y="3" width="5.3" height="10" rx="1"/><path d="M2.5 8h4.3M4.7 5.9 6.8 8l-2.1 2.1"/></svg>
      </button>
      <button class="icon" data-tip="Replace all" aria-label="Replace all" onclick={() => { if (editor) replaceAll(editor, replacement); sync(); }}>
        <svg viewBox="0 0 16 16"><rect x="8.2" y="1.8" width="5.3" height="5" rx="1"/><rect x="8.2" y="9.2" width="5.3" height="5" rx="1"/><path d="M2.5 4.3h4.3M4.7 2.2 6.8 4.3 4.7 6.4M2.5 11.7h4.3M4.7 9.6l2.1 2.1-2.1 2.1"/></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .find {
    position: absolute; top: 10px; right: 16px; z-index: var(--z-find); width: min(360px, calc(100% - 32px));
    display: flex; flex-direction: column; gap: 4px; padding: 6px;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
  }
  .line { display: flex; align-items: center; gap: 4px; }
  .glass, .glass-gap { width: 14px; height: 14px; margin: 0 2px 0 4px; flex: none; }
  .glass { fill: none; stroke: var(--fg-dim); stroke-width: 1.4; stroke-linecap: round; }
  input {
    flex: 1; min-width: 0; border: 0; outline: none; background: var(--bg-input); color: inherit;
    font: inherit; font-size: 13px; padding: 5px 8px; border-radius: 6px;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .count { font-size: 11.5px; color: var(--fg-dim); font-variant-numeric: tabular-nums; padding: 0 2px; }
  .find .icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .find svg { width: 14px; height: 14px; display: block; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  :global(html.mobile) .find { left: 12px; right: 12px; top: 8px; width: auto; padding: 8px; gap: 6px; }
  :global(html.mobile) .find input { font-size: 16px; padding: 8px 10px; border-radius: 8px; }
  :global(html.mobile) .find .icon { width: 36px; height: 36px; }
  :global(html.mobile) .find svg { width: 18px; height: 18px; }
  :global(html.mobile) .count { font-size: 13px; }
</style>
