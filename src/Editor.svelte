<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { createEditor, applyKeymap, getMarkdown, type SuggestItem } from './lib/editor';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import { ui } from './lib/ui.svelte';
  import Icon from './Icon.svelte';
  import { RANDOM_ICONS } from './lib/icons';

  let { note }: { note: Note } = $props();

  let el: HTMLDivElement;
  let editor: TipTap | undefined;

  // Section outline in place of a scrollbar: one tick per heading, dark while that section is on screen;
  // hovering a tick shows the section's title and first lines. Only when the note does not fit the window.
  let scrollEl = $state<HTMLDivElement | null>(null);
  let heads = $state<{ top: number; text: string; preview: string; level: number; on: boolean }[]>([]);
  let overflow = $state(false);
  let hover = $state<number | null>(null);
  let raf = 0;
  function measure() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const sc = scrollEl;
      const root = sc?.querySelector('.tiptap');
      if (!sc || !root) return;
      const top = sc.scrollTop, bottom = top + sc.clientHeight;
      const base = sc.getBoundingClientRect().top - top;
      const last = root.lastElementChild;
      overflow = !!last && last.getBoundingClientRect().bottom - base > sc.clientHeight;
      const hs = [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5')];
      const tops = hs.map((h) => h.getBoundingClientRect().top - base);
      heads = hs.map((h, i) => {
        let preview = '', e = h.nextElementSibling;
        while (e && !/^H[1-5]$/.test(e.tagName) && preview.length < 240) { preview += (e.textContent?.trim() ?? '') + ' '; e = e.nextElementSibling; }
        return {
          top: tops[i], text: h.textContent?.trim() || '…', preview: preview.trim(), level: Number(h.tagName[1]),
          on: tops[i] < bottom && (tops[i + 1] ?? sc.scrollHeight) > top,
        };
      });
    });
  }
  const go = (top: number) => scrollEl?.scrollTo({ top: Math.max(0, top - 44), behavior: 'smooth' });

  // [[ suggestion popup state
  let items = $state<SuggestItem[]>([]);
  let sel = $state(0);
  let pos = $state({ x: 0, y: 0 });
  let pick: (t: SuggestItem) => void = () => {};

  const suggestionUI = {
    show(list: SuggestItem[], rect: DOMRect | null, cb: (t: SuggestItem) => void) {
      items = list; sel = 0; pick = cb;
      if (rect) pos = { x: rect.left, y: rect.bottom + 4 };
    },
    move: (d: number) => { sel = (sel + d + items.length) % items.length; },
    select: () => { if (!items.length) return false; pick(items[sel]); return true; },
    hide: () => { items = []; },
    visible: () => items.length > 0,
  };

  onMount(() => {
    const id = note.id;
    editor = createEditor({
      element: el,
      content: note.body,
      onUpdate: (md) => notes.update(note.id, md),
      onOpenNote: (title) => { notes.flush(note.id); notes.openByTitle(title); },
      titles: () => notes.visible.filter((n) => n.id !== note.id).map(titleOf),
      suggestionUI,
      cursor: notes.cursor.get(note.id),
    });
    if (ui.focusOwner !== 'sidebar') editor?.commands.focus(notes.cursor.has(note.id) ? undefined : 'end');
    editor.on('update', measure);
    const ro = new ResizeObserver(measure);
    if (scrollEl) ro.observe(scrollEl);
    measure();
    return () => {
      ro.disconnect();
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

  // keep the highlighted suggestion visible while arrowing through a long list
  $effect(() => {
    sel;
    document.querySelector('.suggest li.sel')?.scrollIntoView({ block: 'nearest' });
  });

  // rebind editor shortcuts live when the user changes them
  $effect(() => { shortcuts.actions; if (editor) applyKeymap(editor); });

  // remote sync may replace the body under us
  $effect(() => {
    const body = note.body;
    if (editor && !editor.isFocused && getMarkdown(editor) !== body) {
      editor.commands.setContent(body);
    }
  });
</script>

<div class="scroll" bind:this={scrollEl} onscroll={measure}>
  {#if !note.path}
    <div class="page-head" class:with-icon={!!note.icon}>
      {#if note.icon}
        <button class="big-icon" title="아이콘 변경" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={note.icon} size={56} /></button>
      {:else}
        <button class="add-icon" onclick={() => notes.setIcon(note.id, RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)])}>
          <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5M6 6.5h.01M10 6.5h.01"/></svg>
          아이콘 추가
        </button>
      {/if}
    </div>
  {/if}
  <div class="editor" class:has-head={!note.path} bind:this={el}></div>
</div>
{#if overflow && heads.length}
  <nav class="outline" aria-label="Sections" onmouseleave={() => (hover = null)}>
    {#each heads as h, i (i)}
      <button class="tick l{h.level}" class:on={h.on} title={h.text} onmouseenter={() => (hover = i)} onclick={() => go(h.top)}>
        <i></i>
        {#if hover === i}
          <span class="peek"><span class="peek-in" in:fly={{ x: -8, duration: 150 }}>
            <b>{h.text}</b>{#if h.preview}<span class="pv">{h.preview}</span>{/if}
          </span></span>
        {/if}
      </button>
    {/each}
  </nav>
{/if}

{#if items.length}
  <ul class="suggest" style="left:{pos.x}px; top:{pos.y}px" transition:fly={{ y: 4, duration: 120 }}>
    {#each items as t, i}
      <li class:sel={i === sel}><button onmousedown={(e) => { e.preventDefault(); pick(t); }}>{t.label}{#if t.hint}<span class="hint">{t.hint}</span>{/if}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .scroll { height: 100%; overflow-y: auto; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .outline {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 4;
    display: flex; flex-direction: column; gap: 4px; max-height: 72%;
  }
  .tick { position: relative; display: flex; align-items: center; height: 10px; width: 44px; padding: 0; border: 0; background: none; }
  .tick i { display: block; width: 12px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 20%, transparent); transition: background 0.25s, width 0.25s, height 0.25s; }
  .tick.l1 i { width: 22px; }
  .tick.l2 i { width: 16px; }
  .tick.on i { width: 28px; height: 3px; background: var(--fg); }
  .tick:hover i { background: color-mix(in srgb, var(--fg) 45%, transparent); }
  .tick.on:hover i { background: var(--fg); }
  .peek { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); z-index: 5; }
  .peek-in {
    display: flex; flex-direction: column; gap: 5px; width: min(460px, 60vw); padding: 12px 16px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: 0 0 0 0.5px var(--line), 0 12px 36px rgba(0, 0, 0, 0.16);
    text-align: left; font-size: 13px; line-height: 1.45; color: var(--fg);
  }
  .peek b { display: block; font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pv {
    color: var(--fg-dim); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical;
    mask-image: linear-gradient(#000 50%, transparent); -webkit-mask-image: linear-gradient(#000 50%, transparent);
  }
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
  .suggest {
    position: fixed;
    z-index: 10;
    list-style: none;
    margin: 0;
    padding: 4px;
    min-width: 200px;
    max-width: 340px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 13px;
  }
  .suggest button { width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .suggest li.sel button { background: var(--accent-soft); }
  .suggest .hint { float: right; margin-left: 12px; color: var(--fg-dim); font-size: 11.5px; }
</style>
