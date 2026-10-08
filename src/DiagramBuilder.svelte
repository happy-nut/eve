<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { isMobile } from './lib/platform';
  import { sheet } from './lib/popup';
  import { ui } from './lib/ui.svelte';
  import { renderMermaid, sliceColor, branchColor, themeKey } from './lib/mermaid';
  import {
    KINDS, starter, toCode, fromCode, freshId, addDays,
    type Diagram, type Kind, type Shape, type Line, type Flowchart, type Sequence, type Pie, type Mindmap, type Timeline, type Gantt,
  } from './lib/diagram';
  import Select from './Select.svelte';
  import FlowEditor from './FlowEditor.svelte';

  /**
   * A mermaid diagram made without writing mermaid: pick a kind of chart, fill in its parts, and watch it drawn.
   * The preview is the note's own drawing: the same code through the same renderer (lib/mermaid.ts), on the same
   * canvas (.diagram-canvas) at the width the note gives it (scaled down whole, never laid out anew, when the
   * window is narrower), so what is inserted looks as it did here.
   */
  const given = ui.diagram?.code ?? null;
  const read = given === null ? null : fromCode(given);

  let mode = $state<'pick' | 'visual' | 'code'>(given === null ? 'pick' : read ? 'visual' : 'code');
  let d = $state<Diagram>(read ?? starter('flowchart'));
  let text = $state(given ?? '');
  let codeNote = $state(given !== null && !read ? 'Drawn with more than the builder shows: its code is edited here.' : '');
  const kept: Partial<Record<Kind, Diagram>> = {}; // each kind's chart as it was left, switching back and forth

  const code = $derived(mode === 'code' ? text : toCode(d));

  // ---- the preview ----
  let svg = $state(''), error = $state(''), seq = 0, timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const c = code;
    void themeKey();
    if (mode === 'pick') return;
    clearTimeout(timer);
    const n = ++seq;
    timer = setTimeout(async () => {
      const out = await renderMermaid(c);
      if (n !== seq) return;
      if ('svg' in out) { svg = out.svg; error = ''; } else error = out.error;
    }, svg ? 160 : 0);
  });
  $effect(() => () => clearTimeout(timer));

  // the note's canvas width; a narrower panel shows it scaled, as a picture of it
  const width = ui.diagram?.width ?? 640;
  let stageW = $state(0), canvasH = $state(0);
  let previewEl = $state<HTMLDivElement | null>(null);
  const k = $derived(stageW ? Math.min(1, stageW / width) : 1);
  /** an element's layout size, read a frame after it changes: set straight from the observer, the preview's new
   *  height resized what it observed in the same frame, and the browser reported a ResizeObserver loop */
  function size(node: HTMLElement, set: (w: number, h: number) => void) {
    let frame = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => set(node.clientWidth, node.offsetHeight)); });
    ro.observe(node);
    return { destroy: () => { cancelAnimationFrame(frame); ro.disconnect(); } };
  }

  // ---- choosing a kind ----
  function choose(kind: Kind) {
    if (mode !== 'pick' && d.kind !== kind) kept[d.kind] = d;
    d = kept[kind] ?? starter(kind);
    mode = 'visual';
    codeNote = '';
  }
  function toCodeMode() { text = toCode(d); codeNote = ''; mode = 'code'; }
  function toVisual() {
    const r = fromCode(text);
    if (!r) { codeNote = 'This code has parts the builder can’t show (styles, groups, notes…). Keep editing it as code.'; return; }
    d = r; mode = 'visual'; codeNote = '';
  }

  // ---- the panel ----
  let box: HTMLDivElement;
  const done = (v: string | null) => ui.closeDiagram(v);
  const save = () => { if (code.trim()) done(code); };
  const openedAt = performance.now();
  function onKey(e: KeyboardEvent) {
    if (e.timeStamp < openedAt) return; // the Enter that picked "Diagram" in the / menu
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); done(null); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); save(); }
  }
  const appear = (node: Element) => sheet(node, (n) => scale(n, panelIn));

  /** a row just added: its first text box takes the keyboard */
  async function focusLast(sel: string) {
    await tick();
    const all = box.querySelectorAll<HTMLInputElement>(sel);
    const el = all[all.length - 1];
    el?.focus(); el?.select();
  }
  async function focusAt(sel: string, i: number) {
    await tick();
    const el = box.querySelectorAll<HTMLInputElement>(sel)[i];
    el?.focus();
  }

  // ---- flowchart ----
  const SHAPES: [Shape, string][] = [['round', 'Rounded'], ['box', 'Box'], ['pill', 'Pill'], ['diamond', 'Decision'], ['circle', 'Circle'], ['db', 'Database']];
  const LINES: [Line, string][] = [['solid', '→  Arrow'], ['dotted', '⇢  Dotted'], ['thick', '⇒  Bold']];
  function addStep(f: Flowchart) {
    const id = freshId('n', f.nodes);
    const last = f.nodes[f.nodes.length - 1];
    f.nodes.push({ id, label: `Step ${f.nodes.length + 1}`, shape: 'round' });
    if (last) f.edges.push({ from: last.id, to: id, label: '', line: 'solid' }); // a new step follows the last
    void focusLast('.f-node input');
  }
  function dropStep(f: Flowchart, i: number) {
    const id = f.nodes[i].id;
    f.nodes.splice(i, 1);
    f.edges = f.edges.filter((e) => e.from !== id && e.to !== id);
  }
  function addLink(f: Flowchart) {
    const a = f.nodes[f.nodes.length - 2] ?? f.nodes[0], b = f.nodes[f.nodes.length - 1];
    if (!a || !b) return;
    f.edges.push({ from: a.id, to: b.id, label: '', line: 'solid' });
  }
  const nodeOptions = (f: Flowchart) => f.nodes.map((n) => [n.id, n.label.trim() || n.id] as const);

  // ---- sequence ----
  function addPerson(s: Sequence) {
    s.people.push({ id: freshId('p', s.people), name: `Person ${s.people.length + 1}`, actor: false });
    void focusLast('.s-person input');
  }
  function dropPerson(s: Sequence, i: number) {
    const id = s.people[i].id;
    s.people.splice(i, 1);
    s.messages = s.messages.filter((m) => m.from !== id && m.to !== id);
  }
  function addMessage(s: Sequence) {
    const last = s.messages[s.messages.length - 1];
    const [a, b] = last ? [last.to, last.from] : [s.people[0]?.id, s.people[1]?.id ?? s.people[0]?.id];
    if (!a || !b) return;
    s.messages.push({ from: a, to: b, text: '', reply: !!last && !last.reply }); // the answer to the one above
    void focusLast('.s-msg input');
  }
  const peopleOptions = (s: Sequence) => s.people.map((p) => [p.id, p.name.trim() || p.id] as const);

  // ---- pie ----
  function addSlice(p: Pie) { p.slices.push({ label: `Part ${p.slices.length + 1}`, value: 10 }); void focusLast('.p-slice input.label'); }

  // ---- mind map ----
  function addBranch(m: Mindmap, at = m.items.length - 1) {
    const depth = m.items[at]?.depth ?? 1;
    m.items.splice(at + 1, 0, { text: '', depth });
    void focusAt('.m-item input', at + 1);
  }
  const deeper = (m: Mindmap, i: number) => i > 0 && m.items[i].depth <= m.items[i - 1].depth;
  function indent(m: Mindmap, i: number, by: number) {
    const it = m.items[i];
    if (by > 0 && !deeper(m, i)) return;
    if (by < 0 && it.depth <= 1) return;
    // its own branches move with it
    let j = i + 1;
    while (j < m.items.length && m.items[j].depth > it.depth) m.items[j++].depth += by;
    it.depth += by;
  }
  function branchKey(e: KeyboardEvent, m: Mindmap, i: number) {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); addBranch(m, i); }
    else if (e.key === 'Tab') { e.preventDefault(); indent(m, i, e.shiftKey ? -1 : 1); void focusAt('.m-item input', i); }
    else if (e.key === 'Backspace' && !m.items[i].text && m.items.length > 1) { e.preventDefault(); m.items.splice(i, 1); void focusAt('.m-item input', Math.max(0, i - 1)); }
  }

  // ---- timeline ----
  function addPeriod(t: Timeline) { t.periods.push({ label: '', events: [''] }); void focusLast('.t-period input.label'); }

  // ---- gantt ----
  const endOf = (g: Gantt) => {
    const all = g.sections.flatMap((s) => s.tasks);
    const last = all[all.length - 1];
    return last ? addDays(last.start, last.days) : (starter('gantt') as Gantt).sections[0].tasks[0].start;
  };
  function addTask(g: Gantt, s: Gantt['sections'][number]) {
    s.tasks.push({ name: '', start: endOf(g), days: 2 });
    void focusLast('.g-task input.label');
  }
  function addPhase(g: Gantt) { g.sections.push({ name: `Phase ${g.sections.length + 1}`, tasks: [{ name: '', start: endOf(g), days: 2 }] }); void focusLast('.g-phase input.label'); }

  // narrowed views of the chart for the form (each kind's part of it)
  const flow = $derived(d.kind === 'flowchart' ? d : null);
  const seqD = $derived(d.kind === 'sequence' ? d : null);
  const pie = $derived(d.kind === 'pie' ? d : null);
  const mind = $derived(d.kind === 'mindmap' ? d : null);
  const time = $derived(d.kind === 'timeline' ? d : null);
  const gantt = $derived(d.kind === 'gantt' ? d : null);

  const kindLabel = (kind: Kind) => KINDS.find((x) => x.kind === kind)!.label;
</script>

<svelte:window onkeydown={onKey} />

{#snippet pictogram(kind: Kind)}
  <svg class="pict" viewBox="0 0 48 32" aria-hidden="true">
    {#if kind === 'flowchart'}
      <rect x="3" y="11" width="12" height="10" rx="3" /><path d="M24 8l8 8-8 8-8-8z" /><rect x="35" y="11" width="10" height="10" rx="5" class="fill" />
      <path d="M15 16h1M32 16h3" />
    {:else if kind === 'sequence'}
      <rect x="4" y="3" width="12" height="7" rx="2" /><rect x="32" y="3" width="12" height="7" rx="2" />
      <path d="M10 10v20M38 10v20" class="thin" /><path d="M10 16h26m-3-3 3 3-3 3" /><path d="M38 24H12" class="dash" />
    {:else if kind === 'pie'}
      <circle cx="24" cy="16" r="12" /><path d="M24 16V4a12 12 0 0 1 11.4 15.7z" class="fill" />
    {:else if kind === 'mindmap'}
      <circle cx="24" cy="16" r="5" class="fill" /><path d="M19.5 14 10 8M19.5 18 10 24M28.5 14 38 8M28.5 18 38 24" />
      <circle cx="8" cy="7" r="2.5" /><circle cx="8" cy="25" r="2.5" /><circle cx="40" cy="7" r="2.5" /><circle cx="40" cy="25" r="2.5" />
    {:else if kind === 'timeline'}
      <path d="M4 16h40" /><circle cx="12" cy="16" r="3" class="fill" /><circle cx="24" cy="16" r="3" class="fill" /><circle cx="36" cy="16" r="3" class="fill" />
      <path d="M12 9V6M24 23v3M36 9V6" class="thin" />
    {:else}
      <path d="M4 5v24h40" class="thin" /><rect x="8" y="8" width="14" height="5" rx="2" class="fill" /><rect x="18" y="15" width="16" height="5" rx="2" class="fill" />
      <rect x="30" y="22" width="11" height="5" rx="2" class="fill" />
    {/if}
  </svg>
{/snippet}

{#snippet remove(run: () => void, label: string)}
  <button class="x" type="button" aria-label={label} title={label} onclick={run}>
    <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  </button>
{/snippet}

{#snippet add(run: () => void, label: string)}
  <button class="add" type="button" onclick={run}><svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>{label}</button>
{/snippet}

<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => done(null)} role="presentation"></div>
<div class="builder" class:picking={mode === 'pick'} bind:this={box} transition:appear|global role="dialog" aria-modal="true" aria-label="Diagram"
  style:--canvas={`${width}px`}>
  {#if isMobile}<div class="grip" aria-hidden="true"></div>{/if}
  <header>
    {#if mode === 'pick'}
      <h2>New diagram</h2>
    {:else}
      <div class="kinds-bar" role="tablist">
        {#each KINDS as kd (kd.kind)}
          <button role="tab" aria-selected={mode === 'visual' && d.kind === kd.kind} class:on={mode === 'visual' && d.kind === kd.kind}
            onclick={() => choose(kd.kind)}>{@render pictogram(kd.kind)}<span>{kd.label}</span></button>
        {/each}
      </div>
    {/if}
    <button class="icon close" aria-label="Close" onclick={() => done(null)}>
      <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
    </button>
  </header>

  {#if mode === 'pick'}
    <p class="lead">What would you like to draw?</p>
    <div class="cards">
      {#each KINDS as kd (kd.kind)}
        <button class="card" onclick={() => choose(kd.kind)}>
          {@render pictogram(kd.kind)}
          <b>{kd.label}</b><span>{kd.hint}</span>
        </button>
      {/each}
    </div>
    <footer>
      <button class="ghost" onclick={() => { text = ''; mode = 'code'; }}>Write mermaid code</button>
      <span class="grow"></span>
      <button onclick={() => done(null)}>Cancel{#if !isMobile}<kbd>esc</kbd>{/if}</button>
    </footer>
  {:else}
    <div class="body">
      <!-- the note's canvas, at the note's width: scaled as a whole when the panel is narrower -->
      <div class="stage" use:size={(w) => (stageW = w)}>
        <div class="fit" style:width={`${width * k}px`} style:height={canvasH ? `${canvasH * k}px` : null}>
          <div class="diagram-canvas preview" class:error={!!error} use:size={(_, h) => (canvasH = h)} bind:this={previewEl}
            style:width={`${width}px`} style:transform={k < 1 ? `scale(${k})` : null}>
            {#if error}{error}{:else}{@html svg}{/if}
          </div>
          {#if flow && mode === 'visual' && previewEl && svg && !error}<FlowEditor {flow} host={previewEl} version={svg} {k} />{/if}
        </div>
        {#if flow && mode === 'visual'}
          <p class="draw-tip">{isMobile ? 'Tap a box to edit it · tap its + to add the next step, or drag the + onto another box to connect' : 'Click a box to edit it · its + adds the next step, or drag it onto another box to connect · double-click empty space to add a box'}</p>
        {/if}
      </div>

      {#if mode === 'code'}
        <div class="section">
          <label class="head" for="mm-code">Mermaid code</label>
          <textarea id="mm-code" bind:value={text} spellcheck="false" rows="10" placeholder="flowchart LR&#10;  A --> B"></textarea>
          {#if codeNote}<p class="note">{codeNote}</p>{/if}
        </div>
      {:else if flow}
        <div class="section">
          <div class="head">Direction
            <div class="seg">
              <button class:on={flow.dir === 'LR'} onclick={() => (flow.dir = 'LR')}>→ Across</button>
              <button class:on={flow.dir === 'TD'} onclick={() => (flow.dir = 'TD')}>↓ Down</button>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="head">Steps</div>
          {#each flow.nodes as n, i (n.id)}
            <div class="row f-node">
              <Select label="Shape" value={n.shape} options={SHAPES} onchange={(v) => (n.shape = v as Shape)} />
              <input class="grow" bind:value={n.label} placeholder="Step" aria-label="Step text" />
              {@render remove(() => dropStep(flow, i), 'Remove step')}
            </div>
          {/each}
          {@render add(() => addStep(flow), 'Add step')}
        </div>
        <div class="section">
          <div class="head">Connections</div>
          {#each flow.edges as e, i (i)}
            <div class="row f-edge">
              <Select label="From" value={e.from} options={nodeOptions(flow)} onchange={(v) => (e.from = v)} />
              <Select label="Line" value={e.line} options={LINES} onchange={(v) => (e.line = v as Line)} />
              <Select label="To" value={e.to} options={nodeOptions(flow)} onchange={(v) => (e.to = v)} />
              <input class="grow" bind:value={e.label} placeholder="Label (optional)" aria-label="Connection label" />
              {@render remove(() => flow.edges.splice(i, 1), 'Remove connection')}
            </div>
          {/each}
          {#if flow.nodes.length > 1}{@render add(() => addLink(flow), 'Add connection')}{/if}
        </div>
      {:else if seqD}
        <div class="section">
          <div class="head">Participants</div>
          {#each seqD.people as p, i (p.id)}
            <div class="row s-person">
              <Select label="Kind" value={p.actor ? 'actor' : 'box'} options={[['box', 'System'], ['actor', 'Person']]} onchange={(v) => (p.actor = v === 'actor')} />
              <input class="grow" bind:value={p.name} placeholder="Name" aria-label="Participant name" />
              {@render remove(() => dropPerson(seqD, i), 'Remove participant')}
            </div>
          {/each}
          {@render add(() => addPerson(seqD), 'Add participant')}
        </div>
        <div class="section">
          <div class="head">Messages
            <label class="check"><input type="checkbox" bind:checked={seqD.numbered} />Numbered</label>
          </div>
          {#each seqD.messages as m, i (i)}
            <div class="row s-msg">
              <Select label="From" value={m.from} options={peopleOptions(seqD)} onchange={(v) => (m.from = v)} />
              <Select label="Kind" value={m.reply ? 'reply' : 'send'} options={[['send', '→  Sends'], ['reply', '⇠  Replies']]} onchange={(v) => (m.reply = v === 'reply')} />
              <Select label="To" value={m.to} options={peopleOptions(seqD)} onchange={(v) => (m.to = v)} />
              <input class="grow" bind:value={m.text} placeholder="Message" aria-label="Message" />
              {@render remove(() => seqD.messages.splice(i, 1), 'Remove message')}
            </div>
          {/each}
          {#if seqD.people.length}{@render add(() => addMessage(seqD), 'Add message')}{/if}
        </div>
      {:else if pie}
        <div class="section">
          <div class="head">Title</div>
          <input bind:value={pie.title} placeholder="Optional" aria-label="Title" />
        </div>
        <div class="section">
          <div class="head">Parts
            <label class="check"><input type="checkbox" bind:checked={pie.showData} />Show values</label>
          </div>
          {#each pie.slices as s, i (i)}
            <div class="row p-slice">
              <span class="swatch" style:background={sliceColor(i)}></span>
              <input class="grow label" bind:value={s.label} placeholder="Part" aria-label="Part name" />
              <input class="num" type="number" min="0" step="any" inputmode="decimal" bind:value={s.value} aria-label="Value" />
              {@render remove(() => pie.slices.splice(i, 1), 'Remove part')}
            </div>
          {/each}
          {@render add(() => addSlice(pie), 'Add part')}
        </div>
      {:else if mind}
        <div class="section">
          <div class="head">Centre</div>
          <input bind:value={mind.root} placeholder="The main idea" aria-label="Centre" />
        </div>
        <div class="section">
          <div class="head">Branches <span class="tip">{isMobile ? '' : '↩ new · ⇥ deeper · ⇧⇥ back'}</span></div>
          {#each mind.items as b, i (i)}
            <!-- each first-level branch in its colour in the drawing (the centre takes the first) -->
            <div class="row m-item" style:padding-left={`${(b.depth - 1) * 22}px`}>
              <span class="bullet" style:background={b.depth === 1 ? branchColor(mind.items.slice(0, i + 1).filter((x) => x.depth === 1).length - 1) : 'var(--fg-dim)'}></span>
              <input class="grow" bind:value={b.text} placeholder="Idea" aria-label="Branch" onkeydown={(e) => branchKey(e, mind, i)} />
              <button class="x" type="button" aria-label="Back a level" title="Back a level" disabled={b.depth <= 1} onclick={() => indent(mind, i, -1)}>
                <svg viewBox="0 0 16 16"><path d="M9.5 4.5 6 8l3.5 3.5" /></svg>
              </button>
              <button class="x" type="button" aria-label="Deeper" title="Deeper" disabled={!deeper(mind, i)} onclick={() => indent(mind, i, 1)}>
                <svg viewBox="0 0 16 16"><path d="M6.5 4.5 10 8l-3.5 3.5" /></svg>
              </button>
              {@render remove(() => mind.items.splice(i, 1), 'Remove branch')}
            </div>
          {/each}
          {@render add(() => addBranch(mind), 'Add branch')}
        </div>
      {:else if time}
        <div class="section">
          <div class="head">Title</div>
          <input bind:value={time.title} placeholder="Optional" aria-label="Title" />
        </div>
        <div class="section">
          <div class="head">When · what</div>
          {#each time.periods as p, i (i)}
            <div class="row t-period top" data-i={i}>
              <input class="label when" bind:value={p.label} placeholder="2026" aria-label="When" />
              <div class="events grow">
                {#each p.events as _, j (j)}
                  <div class="row">
                    <input class="grow" bind:value={p.events[j]} placeholder="What happened" aria-label="Event" />
                    {#if p.events.length > 1}{@render remove(() => p.events.splice(j, 1), 'Remove event')}{/if}
                  </div>
                {/each}
                <button class="add small" type="button" onclick={() => { p.events.push(''); void focusAt(`.t-period[data-i="${i}"] .events input`, p.events.length - 1); }}>
                  <svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>Event
                </button>
              </div>
              {@render remove(() => time.periods.splice(i, 1), 'Remove period')}
            </div>
          {/each}
          {@render add(() => addPeriod(time), 'Add period')}
        </div>
      {:else if gantt}
        <div class="section">
          <div class="head">Title</div>
          <input bind:value={gantt.title} placeholder="Optional" aria-label="Title" />
        </div>
        {#each gantt.sections as s, i (i)}
          <div class="section g-phase">
            <div class="row">
              <input class="grow label phase" bind:value={s.name} placeholder="Phase" aria-label="Phase" />
              {@render remove(() => gantt.sections.splice(i, 1), 'Remove phase')}
            </div>
            {#each s.tasks as t, j (j)}
              <div class="row g-task">
                <input class="grow label" bind:value={t.name} placeholder="Task" aria-label="Task" />
                <input class="date" type="date" bind:value={t.start} aria-label="Starts" />
                <span class="days"><input class="num" type="number" min="1" step="1" inputmode="numeric" bind:value={t.days} aria-label="Days" />d</span>
                {@render remove(() => s.tasks.splice(j, 1), 'Remove task')}
              </div>
            {/each}
            {@render add(() => addTask(gantt, s), 'Add task')}
          </div>
        {/each}
        <div class="section">{@render add(() => addPhase(gantt), 'Add phase')}</div>
      {/if}
    </div>

    <footer>
      {#if mode === 'code'}
        <button class="ghost" onclick={toVisual}>Edit visually</button>
      {:else}
        <button class="ghost" onclick={toCodeMode}>Edit as code</button>
      {/if}
      <span class="grow"></span>
      {#if !isMobile}<button onclick={() => done(null)}>Cancel<kbd>esc</kbd></button>{/if}
      <button class="primary" disabled={!code.trim()} onclick={save}>{given === null ? 'Insert' : 'Save'}{#if !isMobile}<kbd>⌘↩</kbd>{/if}</button>
    </footer>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: 30; }
  .builder {
    position: fixed; z-index: 31; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(calc(var(--canvas) + 56px), calc(100vw - 32px)); /* the canvas, the padding, a scrollbar */ max-height: min(88vh, 900px);
    display: flex; flex-direction: column; border-radius: var(--panel-radius);
    background: var(--bg-pop); box-shadow: var(--panel-shadow); font-size: 13px; color: var(--fg);
  }
  .builder.picking { width: min(560px, calc(100vw - 32px)); }
  :global(html.mobile) .builder {
    top: auto; bottom: 0; left: 0; right: 0; transform: none; width: auto; max-height: 94vh;
    border-radius: 16px 16px 0 0; padding-bottom: env(safe-area-inset-bottom);
  }
  .grip { width: 36px; height: 5px; border-radius: 3px; background: var(--bg-active); margin: 8px auto 0; flex: none; }

  header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 0 18px; flex: none; }
  h2 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }
  .close { margin-left: auto; flex: none; display: inline-flex; align-items: center; justify-content: center; }
  .close svg, .x svg, .add svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

  /* the kinds as a strip of tabs, each with its little picture */
  .kinds-bar { flex: 1; display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin-left: -8px; }
  .kinds-bar button {
    flex: none; display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; padding: 5px 9px 5px 6px;
    background: none; color: var(--fg-dim); font: inherit; font-size: 12.5px; font-weight: 500; transition: background 0.12s, color 0.12s;
  }
  .kinds-bar button .pict { width: 24px; height: 16px; }
  @media (hover: hover) { .kinds-bar button:hover { background: var(--bg-hover); color: var(--fg); } }
  .kinds-bar button.on { background: var(--accent-soft); color: var(--fg); }

  .pict { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .pict .fill { fill: var(--accent); stroke: var(--accent); }
  .pict .thin { stroke-width: 1.2; opacity: 0.6; }
  .pict .dash { stroke-dasharray: 3 3; }
  .on .pict, .card:hover .pict { color: var(--accent); }

  /* the first step: what to draw */
  .lead { margin: 6px 18px 12px; color: var(--fg-dim); }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 18px 4px; overflow-y: auto; }
  :global(html.mobile) .cards { grid-template-columns: repeat(2, 1fr); }
  .card {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 14px 14px 13px; border-radius: 12px; text-align: left;
    border: 0; background: var(--bg-input); color: var(--fg); font: inherit; transition: background 0.12s, transform 0.12s, box-shadow 0.12s;
  }
  .card .pict { width: 48px; height: 32px; margin-bottom: 8px; color: var(--fg-dim); }
  .card b { font-size: 13.5px; font-weight: 600; }
  .card span { color: var(--fg-dim); font-size: 12px; line-height: 1.35; }
  @media (hover: hover) { .card:hover { background: var(--bg-active); } }
  .card:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent); }
  .card:active { transform: scale(0.98); }

  .body { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding: 12px 20px 4px; }
  .stage { position: sticky; top: -12px; z-index: 1; background: var(--bg-pop); padding: 0 0 10px; margin-top: -2px; }
  .fit { position: relative; margin: 0 auto; overflow: hidden; max-height: 46vh; overflow-y: auto; border-radius: 12px; }
  .draw-tip { margin: 8px 2px 0; font-size: 12px; color: var(--fg-dim); text-align: center; }
  .preview { transform-origin: top left; box-sizing: border-box; }

  .section { padding: 10px 0 6px; }
  .section + .section { border-top: 1px solid var(--line); }
  .head { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--fg-dim); }
  .head .seg, .head .check { margin-left: auto; }
  .tip { margin-left: auto; font-weight: 400; opacity: 0.8; }
  .row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .row.top { align-items: flex-start; }
  .row :global(.select) { flex: none; max-width: 150px; }
  .grow { flex: 1; min-width: 0; }
  input:not([type='checkbox']), textarea {
    box-sizing: border-box; font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 8px;
    border: 0; background: var(--bg-input); color: var(--fg); outline: none; min-width: 0;
  }
  .section > input { width: 100%; }
  input:focus, textarea:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  input::placeholder, textarea::placeholder { color: var(--fg-dim); opacity: 0.7; }
  textarea { width: 100%; resize: vertical; font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; }
  .num { width: 72px; text-align: right; }
  .date { width: 136px; color-scheme: inherit; }
  .days { display: inline-flex; align-items: center; gap: 3px; color: var(--fg-dim); }
  .days .num { width: 54px; }
  .when { width: 110px; flex: none; }
  .events { display: flex; flex-direction: column; }
  .phase { font-weight: 600; }
  .g-phase .g-task { padding-left: 14px; }
  .g-phase > :global(.add) { margin-left: 14px; }
  .swatch, .bullet { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .bullet { width: 7px; height: 7px; margin: 0 2px; }
  .check { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; color: var(--fg); }
  .check input { accent-color: var(--accent); margin: 0; }
  .note { margin: 8px 0 0; color: var(--fg-dim); font-size: 12px; }

  .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--bg-input); }
  .seg button { border: 0; border-radius: 6px; padding: 4px 10px; background: none; color: var(--fg-dim); font: inherit; font-size: 12.5px; font-weight: 500; }
  .seg button.on { background: var(--bg-pop); color: var(--fg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }

  .x {
    flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 0; border-radius: 6px;
    background: none; color: var(--fg-dim); padding: 0;
  }
  @media (hover: hover) { .x:hover:not(:disabled) { background: var(--bg-hover); color: var(--fg); } }
  .x:disabled { opacity: 0.3; }
  .add {
    display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 7px; padding: 5px 9px 5px 6px; margin: 2px 0 4px;
    background: none; color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .add.small { padding: 3px 7px 3px 4px; font-size: 12px; margin-top: 0; }
  @media (hover: hover) { .add:hover { background: var(--accent-soft); } }

  footer { display: flex; align-items: center; gap: 6px; padding: 12px 16px 14px; border-top: 1px solid var(--line); flex: none; }
  .builder.picking footer { border-top: 0; }
  footer button {
    display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 500;
    padding: 6px 12px; border-radius: 8px; border: 0; background: var(--bg-input); color: var(--fg);
    transition: background 0.12s, transform 0.12s;
  }
  @media (hover: hover) { footer button:hover { background: var(--bg-hover); } }
  footer button:active { transform: scale(0.97); }
  footer button.ghost { background: none; color: var(--fg-dim); padding-left: 8px; padding-right: 8px; }
  @media (hover: hover) { footer button.ghost:hover { background: var(--bg-hover); color: var(--fg); } }
  .primary { background: var(--accent) !important; color: #fff !important; }
  .primary:disabled { opacity: 0.5; }
  kbd {
    font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    background: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.14)); color: inherit; opacity: 0.75;
  }
  .primary kbd { background: rgba(255, 255, 255, 0.22); }
  :global(html.mobile) footer button { padding: 10px 16px; font-size: 15px; }
  /* a phone: the drawing keeps room for the form under it, and a connection's or message's row wraps its text box
     under its three choices */
  :global(html.mobile) .fit { max-height: 32vh; }
  :global(html.mobile) .body { padding: 10px 16px 4px; }
  :global(html.mobile) .f-edge, :global(html.mobile) .s-msg { flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
  :global(html.mobile) .f-edge .grow, :global(html.mobile) .s-msg .grow { flex: 1 1 70%; }
  :global(html.mobile) input:not([type='checkbox']), :global(html.mobile) textarea { font-size: 16px; padding: 9px 10px; } /* 16px: iOS/Android don't zoom in */
</style>
