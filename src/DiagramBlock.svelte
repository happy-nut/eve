<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { isMobile } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { renderMermaid, themeKey } from './lib/mermaid';
  import { KINDS, fromCode, toCode, type Diagram } from './lib/diagram';
  import FlowEditor from './FlowEditor.svelte';
  import DiagramForm from './DiagramForm.svelte';

  /**
   * A ```mermaid block in the note: its drawing, and, clicked, the drawing made editable right there — a flowchart's
   * boxes and lines on the picture itself (FlowEditor.svelte), any other chart's parts as rows under it
   * (DiagramForm.svelte). Every change is written back into the block's code (onCode), which is what the note keeps;
   * an undo, a sync or the code typed by hand comes back as `code` and is read again. A diagram written with more
   * than these can show (styles, subgraphs, notes) is drawn, and edited as its code.
   */
  let { code, start, codeShown, onCode, onCodeEdit, onError }: {
    code: string;
    /** made just now from the / menu: open for editing at once */
    start: boolean;
    /** the caret is in the block's code, which shows above the drawing */
    codeShown: boolean;
    onCode: (code: string) => void;
    onCodeEdit: () => void;
    onError: (failed: boolean) => void;
  } = $props();

  let root: HTMLDivElement, canvas = $state<HTMLDivElement | null>(null);
  // what it was given when the block was made; later changes come through the effects below
  const first = untrack(() => ({ code, start }));
  let d = $state<Diagram | null>(fromCode(first.code));
  let active = $state(first.start && !!fromCode(first.code));
  // The note's code is left exactly as it was written until the chart is changed here: read into a chart and written
  // back, `A --> B` would become the chart's own spelling of it, a change no one made. `base` is the chart as the
  // note holds it; only a chart that differs from it is written. `sent` is the code last written, coming back.
  const mine = $derived(d ? toCode(d) : null);
  let base = untrack(() => mine);
  let sent: string | null = null;
  let edited = $state(false);
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const c = mine;
    if (c === null || c === base) return;
    base = c;
    sent = c;
    edited = true;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => onCode(c), 250); // written into the note a moment after the last change
  });
  // the code changed elsewhere (undo, sync, typed by hand): read again
  $effect(() => {
    const c = code;
    untrack(() => {
      if (c === sent) return;
      sent = null;
      edited = false;
      d = fromCode(c);
      base = d ? toCode(d) : null;
      if (!d) active = false;
    });
  });
  /** what is drawn: the note's own code, or the chart as changed here (written into the note a moment later) */
  const drawn = $derived(edited && mine !== null ? mine : code);

  // ---- the drawing ----
  let svg = $state(''), error = $state(''), seq = 0, drawTimer: ReturnType<typeof setTimeout> | undefined;
  let theme = $state(themeKey());
  $effect(() => {
    const c = drawn;
    void theme;
    clearTimeout(drawTimer);
    const n = ++seq;
    drawTimer = setTimeout(async () => {
      const out = await renderMermaid(c);
      if (n !== seq) return;
      if ('svg' in out) { svg = out.svg; error = ''; } else error = out.error;
      onError(!!error);
    }, untrack(() => svg) ? 120 : 0); // read without depending on it: each drawing is a new string, and would draw again
  });
  onMount(() => {
    // drawn again in the other theme (Settings, or the system's dark mode)
    const again = () => (theme = themeKey());
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    scheme?.addEventListener('change', again);
    const watch = new MutationObserver(again);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // a press anywhere else in the app is done with it (not one on a choice's popup or sheet, or its backdrop)
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (active && t && !root.contains(t) && !t.closest('[role="listbox"], .scrim, .sheet, [role="dialog"]')) active = false;
    };
    document.addEventListener('pointerdown', away, true);
    return () => {
      clearTimeout(writeTimer); clearTimeout(drawTimer);
      if (edited && mine !== null && mine !== code) onCode(mine); // a change still waiting is not lost
      scheme?.removeEventListener('change', again); watch.disconnect();
      document.removeEventListener('pointerdown', away, true);
    };
  });
  $effect(() => { if (codeShown) active = false; });

  function open(e: MouseEvent) {
    if (active || error) return;
    if (!d) { onCodeEdit(); return; } // written by hand: its code is how it is edited
    e.preventDefault();
    active = true;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && active && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); active = false; }
  }

  const flow = $derived(active && d?.kind === 'flowchart' ? d : null);
  const kindLabel = $derived(d ? KINDS.find((k) => k.kind === d!.kind)?.label ?? '' : '');
  let flowEd = $state<ReturnType<typeof FlowEditor> | null>(null);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dblock" class:active bind:this={root} onkeydown={onKey}>
  <div class="pic">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mermaid-view diagram-canvas" class:error={!!error} bind:this={canvas} onclick={open}>
    {#if error}{error}{:else}{@html svg}{/if}
  </div>
  {#if flow && canvas && svg && !error}<FlowEditor bind:this={flowEd} {flow} host={canvas} version={svg} k={1} />{/if}
  {#if !error && svg}
    <button class="mermaid-expand" type="button" aria-label="View full screen" data-tip="View full screen"
      onclick={(e) => { e.stopPropagation(); if (canvas?.firstElementChild) ui.viewDiagram(canvas.innerHTML); }}>
      <svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
    </button>
  {/if}
  </div>

  {#if active && d}
    <div class="tools">
      <span class="kind">{kindLabel}</span>
      {#if flow}
        <div class="seg">
          <button class:on={flow.dir === 'LR'} onclick={() => (flow.dir = 'LR')}>→ Across</button>
          <button class:on={flow.dir === 'TD'} onclick={() => (flow.dir = 'TD')}>↓ Down</button>
        </div>
        <button class="ghost" onclick={() => flowEd?.addBox()}>+ Box</button>
      {/if}
      <span class="grow"></span>
      <button class="ghost" onclick={() => { active = false; onCodeEdit(); }}>Code</button>
      <button class="done" onclick={() => (active = false)}>Done</button>
    </div>
    {#if flow}
      <p class="tip">{isMobile ? 'Tap a box to type in it · its + adds the next step; drag the + onto another box to connect' : 'Click a box to type in it · its + adds the next step; drag the + onto another box to connect · Tab adds a step, ⌫ deletes'}</p>
    {:else}
      <DiagramForm {d} />
    {/if}
  {/if}
</div>

<style>
  .dblock { border-radius: 16px; }
  .pic { position: relative; }
  .dblock.active { box-shadow: 0 0 0 2px var(--accent-soft); padding-bottom: 10px; background: var(--bg); }
  .dblock.active :global(.mermaid-view) { cursor: default; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 10px 4px; font-size: 13px; user-select: none; -webkit-user-select: none; }
  .kind { font-weight: 600; color: var(--fg-dim); font-size: 12px; margin-right: 4px; }
  .grow { flex: 1; }
  .tools button {
    border: 0; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 500; background: none; color: var(--fg-dim);
    white-space: nowrap;
  }
  :global(html.mobile) .tools .kind { display: none; } /* a phone's row has room for the buttons only */
  @media (hover: hover) { .tools button:hover { background: var(--bg-hover); color: var(--fg); } }
  .tools .done { background: var(--accent); color: #fff; }
  @media (hover: hover) { .tools .done:hover { background: color-mix(in srgb, var(--accent) 88%, #000); color: #fff; } }
  .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--bg-input); }
  .seg button { border-radius: 6px; padding: 3px 9px; }
  .seg button.on { background: var(--bg-pop); color: var(--fg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
  .tip { margin: 2px 12px 0; font-size: 12px; color: var(--fg-dim); user-select: none; -webkit-user-select: none; }
  .dblock :global(.form) { padding: 4px 12px 0; }
</style>
