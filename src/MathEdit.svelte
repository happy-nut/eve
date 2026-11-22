<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { isMobile } from './lib/platform';
  import { floatAt, screenInsets, viewSize } from './lib/popup';
  import { ui } from './lib/ui.svelte';
  import { claimKeys } from './lib/keys';
  import { loadMath, mathMarkup } from './lib/mathRender';
  import { SHELVES, tidyTex, fullSize, type MathPart } from './lib/mathParts';
  import type { MathDone } from './lib/mathEdit.svelte';

  let { latex, display, clickedAt = null, onInput, onDone, onHistory }: {
    latex: string;
    display: boolean;
    clickedAt?: { x: number; y: number } | null;
    onInput: (latex: string) => void;
    onDone: (how: MathDone) => void;
    onHistory: (redo: boolean) => void;
  } = $props();

  let root: HTMLElement, slot: HTMLElement, tools = $state<HTMLElement | null>(null);
  let mf: (HTMLElement & { value: string; mode: string; insert(s: string, o?: object): boolean; executeCommand(c: unknown): boolean }) | null = null;
  let shelf = $state(SHELVES[0].id);
  let tex = $state(false);
  let texValue = $state(untrack(() => latex));
  let faces = $state<Record<string, string>>({});
  let finished = false;
  let popAt = $state<{ left: number; top?: number; bottom?: number } | null>(null);

  let armedEdge = '', lastKeyDown = '';
  const EDGE_KEY: Record<string, string> = { forward: 'ArrowRight', backward: 'ArrowLeft', upward: 'ArrowUp', downward: 'ArrowDown' };
  let edgeBumped = $state(false), bumpTimer: ReturnType<typeof setTimeout> | undefined;
  function bumpEdge() { edgeBumped = false; requestAnimationFrame(() => { edgeBumped = true; clearTimeout(bumpTimer); bumpTimer = setTimeout(() => (edgeBumped = false), 400); }); }
  function secondArrowLeaves(dir: string) {
    if (lastKeyDown !== EDGE_KEY[dir] || armedEdge === dir) return true;
    armedEdge = dir;
    bumpEdge();
    return false;
  }
  const done = (how: MathDone) => { if (finished) return; finished = true; onDone(how); off(); };
  const doneAfterKey = (how: MathDone) => setTimeout(() => done(how));
  const SLASH_KEYS = ['/', '[NumpadDivide]'];
  const FRACTION_KEYS = SLASH_KEYS.map((key) => ({ key, ifMode: 'math' as const, command: ['insert', '\\dfrac{#@}{#?}'] as ['insert', string] }));
  const CALCULATOR_SHORTCUTS = { '*': '\\times', '**': '\\cdot' };
  const ROW_INSET = 8, POP_GAP = 8, SIDE_MARGIN = 12;
  const TOOLS_FALLBACK = { w: 440, h: 90 };
  function caretAtClickElseEnd(el: { getOffsetFromPoint(x: number, y: number): number; position: number }, at: { x: number; y: number }) {
    try {
      const o = el.getOffsetFromPoint(at.x, at.y);
      if (o >= 0) el.position = o;
    } catch { }
  }
  const off = ui.editingMath(() => done('after'));
  const clean = tidyTex;

  $effect(() => {
    const l = latex;
    untrack(() => {
      if (mf && clean(mf.value) !== fullSize(l)) mf.value = fullSize(l);
      if (clean(texValue) !== l) texValue = l;
    });
  });

  onMount(() => {
    let gone = false;
    loadMath().then((m) => {
      if (gone || !slot.isConnected) return;
      const f = new m.MathfieldElement() as unknown as NonNullable<typeof mf>;
      const el = f as unknown as InstanceType<typeof m.MathfieldElement>;
      el.defaultMode = display ? 'math' : 'inline-math';
      el.mathVirtualKeyboardPolicy = isMobile ? 'auto' : 'manual';
      slot.append(f);
      // these only once it is on the page (MathLive throws before it has drawn itself there)
      try {
        // `(` is a plain bracket (smart fences wrote \left( \right), drawn with a gap: "f (x)"); a digit in an exponent
        // does not end it (with it, the → after x^2 left the root or fraction it was in)
        el.smartFence = false;
        el.smartSuperscript = false;
        el.popoverPolicy = 'off';
        el.menuItems = [];
        el.placeholder = '\\text{Formula}';
        el.keybindings = [...el.keybindings.filter((k) => !SLASH_KEYS.includes(k.key)), ...FRACTION_KEYS];
        el.inlineShortcuts = { ...el.inlineShortcuts, ...CALCULATOR_SHORTCUTS };
        f.value = fullSize(latex);
      } catch { return; }
      mf = f;
      f.addEventListener('input', () => { texValue = clean(f.value); onInput(clean(f.value)); });
      // the ↵ of MathLive's own keyboard (a phone's)
      f.addEventListener('change', () => done('after'));
      f.addEventListener('move-out', (e: Event) => {
        e.preventDefault();
        const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
        if (!secondArrowLeaves(dir)) return;
        doneAfterKey(dir === 'backward' || dir === 'upward' ? 'before' : 'after');
      });
      // ⌫ on an empty formula from MathLive's own keyboard (a phone's) removes it, as the key does
      let prev = f.value;
      f.addEventListener('input', (e: Event) => {
        const kind = (e as InputEvent).inputType;
        if (!prev && !f.value && kind === 'deleteContentBackward') doneAfterKey('remove');
        prev = f.value;
      });
      f.addEventListener('keydown', (e: KeyboardEvent) => {
        lastKeyDown = e.key;
        if (armedEdge && e.key !== EDGE_KEY[armedEdge]) armedEdge = '';
        if (f.mode === 'latex') return;
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
          e.preventDefault(); e.stopPropagation(); done('after');
        } else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // through the empty slots (⇧⇥ back); with none left, out of the part the caret is in (a fraction's
          // denominator filled: on after the fraction). MathLive's own selected the whole part, and the next key
          // typed over it
          e.preventDefault(); e.stopPropagation();
          const back = e.shiftKey;
          if (f.value.includes('\\placeholder')) f.executeCommand(back ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder');
          else f.executeCommand(back ? 'moveBeforeParent' : 'moveAfterParent');
        } else if (e.key === 'Backspace' && !f.value) {
          e.preventDefault(); e.stopPropagation(); done('remove');
        }
      }, { capture: true });
      requestAnimationFrame(() => {
        if (gone) return;
        f.focus();
        if (clickedAt) caretAtClickElseEnd(el, clickedAt);
        place();
        if (isMobile) setTimeout(clearKeyboard, 350);
      });
      const out: Record<string, string> = {};
      for (const s of SHELVES) for (const p of s.parts) out[p.tex] = mathMarkup(m, p.show ?? p.tex, false);
      faces = out;
    }, () => {});
    const away = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && !root.contains(t) && !(t instanceof Element && t.closest('.ML__keyboard'))) done('away');
    };
    document.addEventListener('mousedown', away, true);
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || !root.contains(e.target as Node) || e.target === mf) return;
      if ((e.target as Element).matches?.('input, textarea')) return;
      e.preventDefault(); onHistory(e.shiftKey);
    };
    const unclaim = claimKeys(root, { '*': keys }, { capture: true });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const vk = (window as any).mathVirtualKeyboard as EventTarget | undefined;
    vk?.addEventListener?.('geometrychange', clearKeyboard);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      vk?.removeEventListener?.('geometrychange', clearKeyboard);
      gone = true;
      document.removeEventListener('mousedown', away, true);
      unclaim();
      mf?.remove();
      off();
      (window as any).mathVirtualKeyboard?.hide?.();
    };
  });

  function place() {
    if (display || !root || !tools) return;
    const r = root.getBoundingClientRect(), ins = { ...screenInsets() };
    // MathLive's keyboard is the page's own, not the phone's: the room ends at its top too
    const kb = (window as any).mathVirtualKeyboard?.boundingRect as DOMRect | undefined;
    // (by its height: it docks at the window's foot, and its top is still sliding up while it comes)
    if (kb?.height) ins.bottom = Math.max(ins.bottom, kb.height);
    const f = floatAt({ left: r.left - ROW_INSET, right: r.right, top: r.top, bottom: r.bottom }, { w: tools.offsetWidth || TOOLS_FALLBACK.w, h: tools.offsetHeight || TOOLS_FALLBACK.h },
      { gap: POP_GAP, avoid: { ...ins, left: Math.max(ins.left, SIDE_MARGIN), right: Math.max(ins.right, SIDE_MARGIN) } });
    popAt = f.side === 'above' ? { left: f.left, bottom: viewSize().h - r.top + POP_GAP } : { left: f.left, top: f.top };
  }
  function clearKeyboard() {
    place();
    const kb = (window as any).mathVirtualKeyboard?.boundingRect as DOMRect | undefined;
    if (!kb || !kb.height || !root) return;
    const bottom = Math.max(root.getBoundingClientRect().bottom, !display && tools && popAt?.top !== undefined ? popAt.top + tools.offsetHeight : 0);
    const over = Math.min(bottom - (viewSize().h - kb.height - 12), root.getBoundingClientRect().top - (screenInsets().top + 60));
    if (over > 0) (root.closest('.scroll, .card-scroll') as HTMLElement | null)?.scrollBy({ top: over, behavior: 'smooth' });
  }

  function put(p: MathPart) {
    if (!mf) return;
    if (tex) tex = false;
    if (p.cmd) { mf.executeCommand(p.cmd); mf.focus(); return; }
    // with nothing selected, an empty part: #@ took the term before the caret into it (x^2+y^2, Fraction: y^2 / ?)
    const collapsed = (mf as unknown as { selectionIsCollapsed: boolean }).selectionIsCollapsed;
    mf.insert(collapsed ? p.tex.replaceAll('#@', '#?') : p.tex, { selectionMode: 'placeholder', format: 'latex' });
    mf.focus();
    texValue = clean(mf.value);
    onInput(clean(mf.value));
  }
  function typedTex(v: string) {
    texValue = v;
    if (mf) mf.value = fullSize(v);
    onInput(v);
  }
  const keepFocusInBox = (e: Event) => e.preventDefault();
  function backToBox() {
    tex = false;
    requestAnimationFrame(() => mf?.focus());
  }
</script>

<svelte:element this={display ? 'div' : 'span'} class="math-edit" class:display class:edge-bumped={edgeBumped} bind:this={root}>
  <svelte:element this={display ? 'div' : 'span'} class="slot" class:hidden={tex} bind:this={slot}></svelte:element>
  <svelte:element this={display ? 'div' : 'span'} class="tools" class:pop={!display} bind:this={tools} style:left={popAt ? `${popAt.left}px` : null} style:top={popAt?.top !== undefined ? `${popAt.top}px` : null} style:bottom={popAt?.bottom !== undefined ? `${popAt.bottom}px` : null}>
    <span class="tabs">
      <span class="shelves" role="tablist">
        {#each SHELVES as s (s.id)}
          <button type="button" role="tab" aria-selected={shelf === s.id} aria-label={s.label} title={s.label} class:on={shelf === s.id && !tex} onmousedown={keepFocusInBox} onclick={() => { shelf = s.id; backToBox(); }}>{isMobile ? s.short : s.label}</button>
        {/each}
      </span>
      <button type="button" class="texb" class:on={tex} aria-pressed={tex} onmousedown={keepFocusInBox} onclick={() => { if (tex) backToBox(); else tex = true; }}>TeX</button>
      <button type="button" class="done" onmousedown={keepFocusInBox} onclick={() => done('after')}>Done</button>
    </span>
    {#if tex}
      <textarea class="texin" rows={display ? 3 : 1} spellcheck="false" value={texValue} {@attach (el: HTMLTextAreaElement) => { el.focus(); }}
        oninput={(e) => typedTex((e.currentTarget as HTMLTextAreaElement).value)}
        onkeydown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !display)) { e.preventDefault(); e.stopPropagation(); done('after'); } }}></textarea>
    {:else}
      <span class="parts" role="tabpanel">
        {#each SHELVES.find((s) => s.id === shelf)!.parts as p (p.tex)}
          <button type="button" class="part" title={p.keys ? `${p.name} — type ${p.keys}` : p.name} aria-label={p.name} onmousedown={keepFocusInBox} onclick={() => put(p)}>
            {#if faces[p.tex]}{@html faces[p.tex]}{:else}{p.show ?? p.tex}{/if}
          </button>
        {/each}
      </span>
    {/if}
  </svelte:element>
</svelte:element>

<style>
  .math-edit { display: inline-block; position: relative; vertical-align: baseline; }
  .math-edit.display { display: block; }
  .slot { display: inline-block; min-width: 2em; }
  .display .slot { display: block; }
  .slot.hidden { visibility: hidden; height: 0; overflow: hidden; }
  .slot :global(math-field) {
    display: inline-block; min-width: 2em; padding: 0 4px; margin: 0 -4px; border-radius: 6px; font-size: 1em;
    background: var(--bg-input); outline: none; border: 0; color: var(--fg);
    --caret-color: var(--accent); --selection-background-color: var(--accent-soft); --contains-highlight-background-color: transparent;
    --placeholder-color: var(--fg-dim); --smart-fence-color: var(--fg-dim);
  }
  .edge-bumped .slot :global(math-field) { animation: edge-bump 0.4s ease-out; }
  @keyframes edge-bump { 0% { box-shadow: 0 0 0 2px var(--accent-soft), 0 0 0 1px var(--accent); } 100% { box-shadow: 0 0 0 2px transparent; } }
  .display .slot :global(math-field) { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; font-size: 1.15em; border-radius: 12px; }
  .display .slot :global(math-field::part(content)) { justify-content: center; }
  .math-edit:not(.display) .slot :global(math-field::part(container)) { padding: 0; }
  .slot :global(math-field::part(menu-toggle)) { display: none; }
  :global(html:not(.mobile)) .slot :global(math-field::part(virtual-keyboard-toggle)) { display: none; }
  .math-edit:not(.display) .slot :global(math-field::part(virtual-keyboard-toggle)) { display: none; }

  .tools { display: block; margin-top: 8px; user-select: none; -webkit-user-select: none; font-size: 13px; line-height: 1.2; }
  .tools.pop {
    position: fixed; z-index: var(--z-block-pop); width: min(440px, calc(100vw - 24px)); margin: 0; padding: 8px;
    border-radius: 12px; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .tabs { display: flex; align-items: center; gap: 2px; }
  .shelves { display: flex; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .pop .tabs button { padding: 5px 7px; }
  .pop .part { min-width: 32px; min-height: 32px; padding: 3px 6px; }
  .tabs button {
    border: 0; border-radius: 8px; padding: 5px 9px; font: inherit; font-size: 12.5px; font-weight: 500; background: none; color: var(--fg-dim); white-space: nowrap;
  }
  .tabs button.on { background: var(--bg-input); color: var(--fg); }
  @media (hover: hover) { .tabs button:hover { background: var(--bg-hover); color: var(--fg); } }
  .tabs .done { background: var(--accent); color: var(--on-accent); margin-left: 2px; }
  @media (hover: hover) { .tabs .done:hover { background: color-mix(in srgb, var(--accent) 88%, #000); color: #fff; } }
  .parts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .part {
    min-width: 36px; min-height: 36px; padding: 3px 8px; border: 0; border-radius: 8px; background: var(--bg-input); color: var(--fg);
    display: inline-flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer;
  }
  .part :global(.ML__latex) { font-size: 0.95em; }
  @media (hover: hover) { .part:hover { background: var(--accent-soft); } }
  .part:active { background: var(--accent-soft); }
  .texin {
    display: block; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px 10px; border: 0; border-radius: 8px; resize: vertical;
    background: var(--bg-input); color: var(--fg); font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; outline: none;
  }
  :global(html.mobile) .parts { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile) .part { flex: none; min-width: 44px; min-height: 44px; }
  :global(html.mobile) .tabs button, :global(html.mobile) .texb, :global(html.mobile) .done { min-height: 40px; min-width: 40px; }
</style>
