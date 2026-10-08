<script lang="ts">
  import { tick } from 'svelte';
  import { isMobile } from './lib/platform';
  import { sliceColor, branchColor } from './lib/mermaid';
  import { starter, freshId, addDays, type Diagram, type Sequence, type Pie, type Mindmap, type Timeline, type Gantt } from './lib/diagram';
  import Select from './Select.svelte';

  /**
   * The parts of a sequence, pie, mind map, timeline or Gantt chart, as rows to fill in, under its drawing in the note
   * (DiagramBlock.svelte). A flowchart has none: it is drawn on its picture (FlowEditor.svelte).
   */
  let { d }: { d: Diagram } = $props();
  let box: HTMLDivElement;

  /** a row just added: its first text box takes the keyboard */
  async function focusLast(sel: string) {
    await tick();
    const all = box.querySelectorAll<HTMLInputElement>(sel);
    const el = all[all.length - 1];
    el?.focus(); el?.select();
  }
  async function focusAt(sel: string, i: number) {
    await tick();
    box.querySelectorAll<HTMLInputElement>(sel)[i]?.focus();
  }

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
  const seqD = $derived(d.kind === 'sequence' ? d : null);
  const pie = $derived(d.kind === 'pie' ? d : null);
  const mind = $derived(d.kind === 'mindmap' ? d : null);
  const time = $derived(d.kind === 'timeline' ? d : null);
  const gantt = $derived(d.kind === 'gantt' ? d : null);
</script>

{#snippet remove(run: () => void, label: string)}
  <button class="x" type="button" aria-label={label} title={label} onclick={run}>
    <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  </button>
{/snippet}

{#snippet add(run: () => void, label: string)}
  <button class="add" type="button" onclick={run}><svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>{label}</button>
{/snippet}

<div class="form" bind:this={box}>
  {#if seqD}
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

<style>
  .form { font-size: 13px; color: var(--fg); user-select: text; -webkit-user-select: text; }
  .x svg, .add svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .section { padding: 10px 0 6px; }
  .section + .section { border-top: 1px solid var(--line); }
  .head { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--fg-dim); }
  .head .check { margin-left: auto; }
  .tip { margin-left: auto; font-weight: 400; opacity: 0.8; }
  .row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .row.top { align-items: flex-start; }
  .row :global(.select) { flex: none; max-width: 150px; }
  .grow { flex: 1; min-width: 0; }
  input:not([type='checkbox']) {
    box-sizing: border-box; font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 8px;
    border: 0; background: var(--bg-input); color: var(--fg); outline: none; min-width: 0;
  }
  .section > input { width: 100%; }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  input::placeholder { color: var(--fg-dim); opacity: 0.7; }
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

  :global(html.mobile) .s-msg { flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
  :global(html.mobile) .s-msg .grow { flex: 1 1 70%; }
  :global(html.mobile) input:not([type='checkbox']) { font-size: 16px; padding: 9px 10px; } /* 16px: a phone does not zoom in */
</style>
