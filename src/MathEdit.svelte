<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { isMobile } from './lib/platform';
  import { loadMath, mathMarkup } from './lib/mathRender';
  import { SHELVES, tidyTex, type MathPart } from './lib/mathParts';
  import type { MathDone } from './lib/mathEdit.svelte';

  /**
   * A formula being edited, right where it is in the note: MathLive's box, showing the formula as it will look and
   * typed into as such (x^2 puts the 2 up, / makes a fraction, ⇥ moves through the empty slots), and under it a row of
   * the parts a formula is made of, put in by a click, no TeX to know. Its TeX is a click away for whoever knows it.
   * Every change is written into the note as it is made (onInput); an undo or a sync comes back as `latex`.
   */
  let { latex, display, at = null, onInput, onDone, onHistory }: {
    latex: string;
    display: boolean;
    /** where the formula was clicked: the caret goes there (it always went to the end, and a typo in the middle took
     *  another click) */
    at?: { x: number; y: number } | null;
    onInput: (latex: string) => void;
    onDone: (how: MathDone) => void;
    onHistory: (redo: boolean) => void;
  } = $props();

  let root: HTMLElement, slot: HTMLElement, tools = $state<HTMLElement | null>(null);
  let mf: (HTMLElement & { value: string; mode: string; insert(s: string, o?: object): boolean; executeCommand(c: unknown): boolean }) | null = null;
  let shelf = $state(SHELVES[0].id);
  let tex = $state(false);
  let texValue = $state(untrack(() => latex));
  let faces = $state<Record<string, string>>({}); // each part's button, drawn
  let finished = false;
  /** an inline formula's row, where it floats: fixed to the window, under the formula and on the screen (inside a table
   *  its row was cut off by the table's own scroll box, and could not be used) */
  let popAt = $state<{ left: number; top: number } | null>(null);

  const done = (how: MathDone) => { if (finished) return; finished = true; onDone(how); };
  const clean = tidyTex;

  // what the note changed (an undo, a sync): shown, unless it is what was just typed
  $effect(() => {
    const l = latex;
    untrack(() => {
      if (mf && clean(mf.value) !== l) mf.value = l;
      if (clean(texValue) !== l) texValue = l;
    });
  });

  onMount(() => {
    let gone = false;
    loadMath().then((m) => {
      if (gone || !slot.isConnected) return; // the formula left the page while MathLive loaded
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
        f.value = latex;
      } catch { return; }
      mf = f;
      f.addEventListener('input', () => { texValue = clean(f.value); onInput(clean(f.value)); });
      // the ↵ of MathLive's own keyboard (a phone's)
      f.addEventListener('change', () => done('after'));
      f.addEventListener('move-out', (e: Event) => {
        e.preventDefault();
        const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
        // after the key has been dealt with: done at once, the note took the same ↓ and moved the caret a line further,
        // and MathLive, its box gone under it, threw
        setTimeout(() => done(dir === 'backward' || dir === 'upward' ? 'before' : 'after'));
      });
      // ⌫ on an empty formula from MathLive's own keyboard (a phone's) removes it, as the key does
      let prev = f.value;
      f.addEventListener('input', (e: Event) => {
        const kind = (e as InputEvent).inputType;
        if (!prev && !f.value && kind === 'deleteContentBackward') setTimeout(() => done('remove'));
        prev = f.value;
      });
      f.addEventListener('keydown', (e: KeyboardEvent) => {
        if (f.mode === 'latex') return; // typing a \command: Esc and Enter are MathLive's
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
        if (at) { try { const o = el.getOffsetFromPoint(at.x, at.y); if (o >= 0) el.position = o; } catch { /* the end, as before */ } }
        place();
        // a phone: MathLive's keyboard comes up over the lower part of the screen; the formula and its row above it
        if (isMobile) setTimeout(clearKeyboard, 350);
      });
      const out: Record<string, string> = {};
      for (const s of SHELVES) for (const p of s.parts) out[p.tex] = mathMarkup(m, p.show ?? p.tex, false);
      faces = out;
    }, () => {});
    // a click anywhere else in the app is done with it (not one on its own row or box)
    const away = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && !root.contains(t) && !(t instanceof Element && t.closest('.ML__keyboard'))) done('away');
    };
    document.addEventListener('mousedown', away, true);
    // ⌘Z with the keyboard elsewhere than the box (the TeX line, a part's button): the note's own undo
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || !root.contains(e.target as Node) || e.target === mf) return;
      if ((e.target as Element).matches?.('input, textarea')) return;
      e.preventDefault(); onHistory(e.shiftKey);
    };
    window.addEventListener('keydown', keys, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      gone = true;
      document.removeEventListener('mousedown', away, true);
      window.removeEventListener('keydown', keys, true);
      mf?.remove();
      (window as any).mathVirtualKeyboard?.hide?.();
    };
  });

  /** the inline row under its formula, on the screen */
  function place() {
    if (display || !root || !tools) return;
    const r = root.getBoundingClientRect();
    const w = tools.offsetWidth || 440;
    popAt = { left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left - 8)), top: r.bottom + 8 };
  }
  /** what MathLive's keyboard covers brought up above it */
  function clearKeyboard() {
    const kb = (window as any).mathVirtualKeyboard?.boundingRect as DOMRect | undefined;
    if (!kb || !kb.height || !root) return;
    const r = (display ? root : tools ?? root).getBoundingClientRect();
    const over = r.bottom - (kb.top - 12);
    if (over > 0) (root.closest('.scroll') as HTMLElement | null)?.scrollBy({ top: over, behavior: 'smooth' });
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
    if (mf) mf.value = v;
    onInput(v);
  }
  const keep = (e: Event) => e.preventDefault(); // a press on the row leaves the keyboard in the box
  /** out of the TeX line, the keyboard back in the box (it went nowhere: keys typed were lost, Esc did nothing) */
  function backToBox() {
    tex = false;
    requestAnimationFrame(() => mf?.focus());
  }
</script>

<svelte:element this={display ? 'div' : 'span'} class="math-edit" class:display bind:this={root}>
  <svelte:element this={display ? 'div' : 'span'} class="slot" class:hidden={tex} bind:this={slot}></svelte:element>
  <svelte:element this={display ? 'div' : 'span'} class="tools" class:pop={!display} bind:this={tools} style:left={popAt ? `${popAt.left}px` : null} style:top={popAt ? `${popAt.top}px` : null}>
    <span class="tabs">
      <span class="shelves" role="tablist">
        {#each SHELVES as s (s.id)}
          <button type="button" role="tab" aria-selected={shelf === s.id} aria-label={s.label} title={s.label} class:on={shelf === s.id && !tex} onmousedown={keep} onclick={() => { shelf = s.id; backToBox(); }}>{isMobile ? s.short : s.label}</button>
        {/each}
      </span>
      <button type="button" class="texb" class:on={tex} aria-pressed={tex} onmousedown={keep} onclick={() => { if (tex) backToBox(); else tex = true; }}>TeX</button>
      <button type="button" class="done" onmousedown={keep} onclick={() => done('after')}>Done</button>
    </span>
    {#if tex}
      <textarea class="texin" rows={display ? 3 : 1} spellcheck="false" value={texValue} {@attach (el: HTMLTextAreaElement) => { el.focus(); }}
        oninput={(e) => typedTex((e.currentTarget as HTMLTextAreaElement).value)}
        onkeydown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !display)) { e.preventDefault(); e.stopPropagation(); done('after'); } }}></textarea>
    {:else}
      <span class="parts" role="tabpanel">
        {#each SHELVES.find((s) => s.id === shelf)!.parts as p (p.tex)}
          <button type="button" class="part" title={p.name} aria-label={p.name} onmousedown={keep} onclick={() => put(p)}>
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
  /* the box draws the formula as the note does (the same size, a display formula centred), on a soft wash */
  .slot :global(math-field) {
    display: inline-block; min-width: 2em; padding: 0 4px; margin: 0 -4px; border-radius: 6px; font-size: 1em;
    background: var(--bg-input); outline: none; border: 0; color: var(--fg);
    --caret-color: var(--accent); --selection-background-color: var(--accent-soft); --contains-highlight-background-color: transparent;
    --placeholder-color: var(--fg-dim); --smart-fence-color: var(--fg-dim);
  }
  .display .slot :global(math-field) { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; font-size: 1.15em; border-radius: 12px; }
  .display .slot :global(math-field::part(content)) { justify-content: center; }
  /* in a line, no taller than the formula drawn there: the line does not jump as it opens */
  .math-edit:not(.display) .slot :global(math-field::part(container)) { padding: 0; }
  .slot :global(math-field::part(menu-toggle)) { display: none; }
  :global(html:not(.mobile)) .slot :global(math-field::part(virtual-keyboard-toggle)) { display: none; }
  /* in a line its keyboard comes up by itself: the toggle only made the box taller than its line */
  .math-edit:not(.display) .slot :global(math-field::part(virtual-keyboard-toggle)) { display: none; }

  .tools { display: block; margin-top: 8px; user-select: none; -webkit-user-select: none; font-size: 13px; line-height: 1.2; }
  .tools.pop {
    position: fixed; z-index: 30; width: min(440px, calc(100vw - 24px)); margin: 0; padding: 8px;
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
  .tabs .done { background: var(--accent); color: #fff; margin-left: 2px; }
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
  /* a phone: MathLive's own keyboard is up under it, so the row takes one line each, swiped sideways */
  :global(html.mobile) .parts { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile) .part { flex: none; min-width: 44px; min-height: 44px; }
</style>
