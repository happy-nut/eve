<script lang="ts">
  import { tick } from 'svelte';
  import { isMobile } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { composing } from './lib/keys';
  import { sliceColor, branchColor } from './lib/mermaid';
  import {
    starter, freshId, addDays, ganttDates, isMessage, replies, type Diagram, type Message, type Sequence, type Pie, type Mindmap, type Timeline, type Gantt, type Task,
    type BlockKind, type ClassDiagram, type StateDiagram, type ErDiagram, type MindShape, type StateBox, type StateLink, stateParent,
  } from './lib/diagram';
  import Select from './Select.svelte';
  import {
    depthAt, DIVIDERS, OPENERS, SPLITS, dropStep, openerOf, SPLIT_OF, wellFormed, ARROWS, arrowOf, seqArrows, setArrow, BARS, pieValue, dropBranch, deeper, indent, movePeriod, MIND_SHAPES, ROOT_SHAPES, plausible, endOf, startOf, startOptions, setStart, taskName, andAfterOptions, addAfter, TAG_OPTIONS, setTags, tagOptions, rename, NAME_ID, TABLE_ID, drop, options, CLASS_ARROWS, arrowOptions, stateDepth, STATE_KINDS, insideOptions, renameState, dropState, LEFT, RIGHT,
  } from './lib/diagramOps';

  /**
   * The parts of a sequence, pie, mind map, timeline, Gantt, class, state or table diagram, as rows to fill in, under its
   * drawing in the note (DiagramBlock.svelte). A flowchart has none: it is drawn on its picture (FlowEditor.svelte).
   * What a pasted diagram says that the rows cannot show is kept as a line of code, where it was, to edit as written.
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

  /** a row gone with its ×: the keyboard goes to the × that took its place (or the last one left, or the rows' first
   *  button). It fell to the page with the row, and the next ⌘A and letter were the note's — the whole note went */
  async function removed(x: HTMLElement, run: () => unknown) {
    const at = [...box.querySelectorAll('button.x')].indexOf(x);
    await run();
    await tick();
    if (box.contains(document.activeElement)) return;
    const xs = box.querySelectorAll<HTMLElement>('button.x');
    (xs[Math.min(at, xs.length - 1)] ?? box.querySelector<HTMLElement>('button'))?.focus();
  }

  // ---- sequence ----
  function addPerson(s: Sequence) {
    s.people.push({ id: freshId('p', s.people), name: `Person ${s.people.length + 1}`, actor: false });
    void focusLast('.s-person input');
  }
  /** a participant gone, and the messages to and from it and the notes on it: asked first when there are any (they
   *  went without a word) */
  async function dropPerson(s: Sequence, i: number) {
    const id = s.people[i].id;
    const theirs = (st: Sequence['messages'][number]) => (isMessage(st) ? st.from === id || st.to === id : 'note' in st && st.who.includes(id));
    const n = s.messages.filter((m) => isMessage(m) && theirs(m)).length;
    if (n && !(await ui.ask(`Remove “${s.people[i].name.trim() || id}” and the ${n} message${n > 1 ? 's' : ''} to or from them?`))) return;
    s.people.splice(i, 1);
    s.messages = s.messages.filter((m) => !theirs(m));
  }
  function addNote(s: Sequence) {
    const who = s.people[0]?.id;
    if (!who) return;
    s.messages.push({ note: 'right of', who: [who], text: '' });
    void focusLast('.s-step input.grow');
  }
  /** a loop around a message of its own, to be changed into whatever group it is */
  function addGroup(s: Sequence) {
    const [a, b] = [s.people[0]?.id, s.people[1]?.id ?? s.people[0]?.id];
    if (!a || !b) return;
    s.messages.push({ block: 'loop', text: '' }, { from: a, to: b, text: '', reply: false }, { block: 'end', text: '' });
    void focusAt('.s-step input.grow', s.messages.filter((x) => !('block' in x && x.block === 'end')).length - 2);
  }
  function addMessage(s: Sequence) {
    const last = s.messages.filter(isMessage).pop();
    const [a, b] = last ? [last.to, last.from] : [s.people[0]?.id, s.people[1]?.id ?? s.people[0]?.id];
    if (!a || !b) return;
    s.messages.push({ from: a, to: b, text: '', reply: !!last && !last.reply }); // the answer to the one above
    void focusLast('.s-step input.grow');
  }
  /** a row put in a group, just above its end (added at the bottom, it was outside every group, and there was no way in) */
  async function addInside(s: Sequence, end: number, step: 'message' | 'group' | BlockKind) {
    const [a, b] = [s.people[0]?.id, s.people[1]?.id ?? s.people[0]?.id];
    if (!a || !b) return;
    const msg = { from: a, to: b, text: '', reply: false };
    s.messages.splice(end, 0, ...(step === 'group' ? [{ block: 'loop' as const, text: '' }, msg, { block: 'end' as const, text: '' }] : step === 'message' ? [msg] : [{ block: step, text: '' }]));
    await tick();
    box.querySelectorAll('.s-step')[end]?.querySelector<HTMLElement>('input.grow')?.focus();
  }
  /** a row one up or down, past the row beside it: into a group past its end, out of it past its start. A group's own
   *  start or end moved takes a row in or leaves it out. Not where the groups would no longer close */
  async function moveStep(s: Sequence, i: number, by: -1 | 1, from?: HTMLElement) {
    const j = i + by;
    if (j < 0 || j >= s.messages.length) return;
    const next = [...s.messages];
    [next[i], next[j]] = [next[j], next[i]];
    if (wellFormed(s.messages) && !wellFormed(next)) return;
    s.messages = next;
    await tick();
    // the keyboard goes with the row
    const row = box.querySelectorAll('.s-step')[j];
    const label = from?.getAttribute('aria-label');
    (row?.querySelector<HTMLElement>(label ? `[aria-label="${label}"]` : 'input.grow') ?? row?.querySelector<HTMLElement>('button'))?.focus();
  }
  /** ⌥↑ / ⌥↓ (or ⌘⇧↑ / ⌘⇧↓, as Notion moves a block) in a row moves it */
  function stepKey(e: KeyboardEvent, s: Sequence, i: number) {
    if (composing(e) || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    if (!(e.altKey && !e.metaKey && !e.ctrlKey) && !((e.metaKey || e.ctrlKey) && e.shiftKey)) return;
    if ((e.target as Element).closest('[aria-expanded="true"]')) return; // an open list's own arrows
    e.preventDefault();
    void moveStep(s, i, e.key === 'ArrowUp' ? -1 : 1, (e.target as Element).closest('button') ?? undefined);
  }
  // a participant with no name yet: said so, not its inner id ("p3")
  const peopleOptions = (s: Sequence) => s.people.map((p) => [p.id, p.name.trim() || '(no name)'] as const);

  /** Enter in a row: on to the same field of the next row, or, in the last, a row more (it did nothing but in a mind map) */
  async function rowEnter(e: KeyboardEvent, sel: string, add: () => void) {
    if (composing(e) || e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const all = [...box.querySelectorAll<HTMLInputElement>(sel)];
    const i = all.indexOf(e.currentTarget as HTMLInputElement);
    if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); all[i + 1].select(); }
    else add();
  }
  // ---- pie ----
  function addSlice(p: Pie) { p.slices.push({ label: `Part ${p.slices.length + 1}`, value: 10 }); void focusLast('.p-slice input.label'); }

  // ---- mind map ----
  /** a branch next to the one at `at`: after its own branches (right after it, it took them over as its own) */
  function addBranch(m: Mindmap, at = m.items.length - 1) {
    const depth = m.items[at]?.depth ?? 1;
    let end = at + 1;
    while (end < m.items.length && m.items[end].depth > depth) end++;
    m.items.splice(end, 0, { text: '', depth });
    void focusAt('.m-item input', end);
  }
  function branchKey(e: KeyboardEvent, m: Mindmap, i: number) {
    if (composing(e)) return;
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); addBranch(m, i); }
    else if (e.key === 'Tab') { e.preventDefault(); indent(m, i, e.shiftKey ? -1 : 1); void focusAt('.m-item input', i); }
    else if (e.key === 'Backspace' && !m.items[i].text && m.items.length > 1) { e.preventDefault(); dropBranch(m, i); void focusAt('.m-item input', Math.max(0, i - 1)); }
  }

  // ---- timeline ----
  function addPeriod(t: Timeline) { t.periods.push({ label: '', events: [''] }); void focusLast('.t-period input.label'); }
  /** a section: a stretch of periods under one name, from a new period on (they could not be grouped at all) */
  function addSection(t: Timeline) {
    const name = `Section ${t.periods.filter((p) => p.section !== undefined).length + 1}`;
    // the first: around the periods there are (it came only with a new period, after them all); then from a new one
    if (t.periods.length && t.periods[0].section === undefined) t.periods[0].section = name;
    else t.periods.push({ label: '', events: [''], section: name });
    void focusAt('.t-section input', t.periods[0].section === name ? 0 : t.periods.filter((p) => p.section !== undefined).length - 1);
  }
  function addClass(c: ClassDiagram) {
    const id = freshId('Class', c.classes);
    c.classes.push({ id, name: id, members: [] });
    void focusLast('.c-class input.name');
  }
  function addClassLink(c: ClassDiagram) {
    const [a, b] = [c.classes[0]?.id, c.classes[1]?.id ?? c.classes[0]?.id];
    if (a && b) c.links.push({ from: a, to: b, arrow: '-->', label: '', fromCard: '', toCard: '' });
  }
  function addState(s: StateDiagram) {
    const id = freshId('State', s.states);
    s.states.push({ id, name: id, desc: '' });
    void focusLast('.st-state input.name');
  }
  function addTransition(s: StateDiagram) {
    const last = s.links[s.links.length - 1];
    const from = last && last.to !== '[*]' ? last.to : s.states[0]?.id ?? '[*]';
    s.links.push({ from, to: s.states.find((x) => x.id !== from)?.id ?? '[*]', label: '' });
  }
  /** the chart's start and end, and each state of states' own (`[*] in`): a choice inside one had no line into it */
  const holders = (s: StateDiagram) => s.states.filter((x) => !x.kind && s.states.some((y) => stateParent(s, y) === x.id));
  const starts = (s: StateDiagram) => [['[*]', '● Start'] as [string, string], ...holders(s).map((x) => [`[*] ${x.id}`, `● Start in “${x.name.trim() || x.id}”`] as [string, string]), ...options(s.states)];
  const ends = (s: StateDiagram) => [['[*]', '◉ End'] as [string, string], ...holders(s).map((x) => [`[*] ${x.id}`, `◉ End in “${x.name.trim() || x.id}”`] as [string, string]), ...options(s.states)];
  /** a line's end as its choice shows it: a start or end inside a state of states with that state's id */
  const endValue = (l: StateLink, at: string) => (at === '[*]' && l.in ? `[*] ${l.in}` : at);
  function setEnd(l: StateLink, side: 'from' | 'to', v: string) {
    const inside = /^\[\*\] (.+)$/.exec(v);
    l[side] = inside ? '[*]' : v;
    if (inside) l.in = inside[1];
    else if (l.from !== '[*]' && l.to !== '[*]') delete l.in;
    else if (v === '[*]') delete l.in;
  }
  function addTable(e: ErDiagram) {
    const id = freshId('TABLE', e.tables);
    e.tables.push({ id, name: id, columns: [{ type: 'int', name: 'id', keys: 'PK', comment: '' }] });
    void focusLast('.e-table input.name');
  }
  function addRelation(e: ErDiagram) {
    const [a, b] = [e.tables[0]?.id, e.tables[1]?.id ?? e.tables[0]?.id];
    if (a && b) e.links.push({ from: a, to: b, left: '||', right: 'o{', dashed: false, label: '' });
  }
  /** a kept line's box as tall as what it holds */
  const rows = (s: string) => Math.min(12, s.split('\n').length);
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
  const cls = $derived(d.kind === 'class' ? d : null);
  const state = $derived(d.kind === 'state' ? d : null);
  const er = $derived(d.kind === 'er' ? d : null);
  /** what the chart keeps as written that its rows do not show (a class, state, table or Gantt chart's) */
  const extra = $derived(d.kind === 'class' || d.kind === 'state' || d.kind === 'er' || d.kind === 'gantt' ? d : null);
</script>

{#snippet remove(run: () => void, label: string)}
  <button class="x" type="button" aria-label={label} title={label} onclick={(e) => removed(e.currentTarget, run)}>
    <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  </button>
{/snippet}

{#snippet trash(run: () => void, label: string)}
  <!-- a row and all it holds: not a second × beside its first line's own (they looked the same, and did not do the same) -->
  <button class="x" type="button" aria-label={label} title={label} onclick={(e) => removed(e.currentTarget, run)}>
    <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg>
  </button>
{/snippet}

{#snippet updown(up: (() => void) | null, down: (() => void) | null)}
  <button class="x" type="button" aria-label="Move up" title="Move up" disabled={!up} onclick={() => up?.()}><svg viewBox="0 0 16 16"><path d="M4.5 9.5 8 6l3.5 3.5" /></svg></button>
  <button class="x" type="button" aria-label="Move down" title="Move down" disabled={!down} onclick={() => down?.()}><svg viewBox="0 0 16 16"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg></button>
{/snippet}

{#snippet addSmall(run: () => void, label: string)}
  <button class="add small" type="button" onclick={run}><svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>{label}</button>
{/snippet}

{#snippet moves(s: Sequence, i: number)}
  <button class="x mv" type="button" aria-label="Move up" title="Move up (⌥↑)" disabled={i === 0} onclick={(e) => moveStep(s, i, -1, e.currentTarget)}>
    <svg viewBox="0 0 16 16"><path d="M4.5 9.5 8 6l3.5 3.5" /></svg>
  </button>
  <button class="x mv" type="button" aria-label="Move down" title="Move down (⌥↓)" disabled={i === s.messages.length - 1} onclick={(e) => moveStep(s, i, 1, e.currentTarget)}>
    <svg viewBox="0 0 16 16"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
  </button>
{/snippet}

{#snippet add(run: () => void, label: string)}
  <button class="add" type="button" onclick={run}><svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>{label}</button>
{/snippet}

{#snippet keptLines(list: string[])}
  <div class="section">
    <div class="head">Kept as code <span class="tip">what these rows cannot show, as written</span></div>
    {#each list as _, i (i)}
      <div class="row top">
        <textarea class="grow code" rows={rows(list[i])} bind:value={list[i]} spellcheck="false" aria-label="Code kept as written"></textarea>
        {@render remove(() => list.splice(i, 1), 'Remove these lines')}
      </div>
    {/each}
  </div>
{/snippet}

<div class="form" bind:this={box}>
  {#if seqD}
    <div class="section">
      <div class="head">Participants</div>
      {#each seqD.people as p, i (p.id)}
        <div class="row s-person">
          <Select label="Person or system" value={p.actor ? 'actor' : 'box'} options={[['box', 'System'], ['actor', 'Person']]} onchange={(v) => (p.actor = v === 'actor')} />
          <input class="grow" bind:value={p.name} placeholder="Name" aria-label="Participant name" onkeydown={(e) => rowEnter(e, '.s-person input.grow', () => addPerson(seqD))} />
          {@render remove(() => dropPerson(seqD, i), 'Remove participant')}
        </div>
      {/each}
      {@render add(() => addPerson(seqD), 'Add participant')}
    </div>
    <div class="section">
      <div class="head">Messages
        <label class="check"><input type="checkbox" bind:checked={seqD.numbered} />Numbered</label>
      </div>
      {#each seqD.messages as st, i (i)}
        <!-- a group's steps indented under it, as the drawing boxes them -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="row s-step" class:s-msg={isMessage(st)} role="group" style:padding-left={`${depthAt(seqD, i) * 18}px`} onkeydown={(e) => stepKey(e, seqD, i)}>
          {#if 'raw' in st}
            <input class="grow code" bind:value={st.raw} spellcheck="false" aria-label="Code kept as written" />
            <span class="tools">{@render moves(seqD, i)}{@render remove(() => dropStep(seqD, i), 'Remove line')}</span>
          {:else if 'block' in st}
            {#if st.block === 'end'}
              <span class="end">end</span>
              <!-- a row put in the group, above its end -->
              {@render addSmall(() => addInside(seqD, i, 'message'), 'Message')}
              {#if SPLIT_OF[openerOf(seqD, i) ?? 'end']}
                {@const split = SPLIT_OF[openerOf(seqD, i) ?? 'end']!}
                {@render addSmall(() => addInside(seqD, i, split), SPLITS.find(([k]) => k === split)![1])}
              {/if}
              {@render addSmall(() => addInside(seqD, i, 'group'), 'Group')}
              <span class="tools">{@render moves(seqD, i)}</span>
            {:else}
              <Select label="Group" value={st.block} options={DIVIDERS.has(st.block) ? SPLITS : OPENERS} onchange={(v) => (st.block = v as BlockKind)} />
              <input class="grow" bind:value={st.text} placeholder={st.block === 'rect' ? 'Colour, rgb(…)' : 'Condition'} aria-label="Group" />
              <span class="tools">{@render moves(seqD, i)}{@render remove(() => dropStep(seqD, i), 'Remove group')}</span>
            {/if}
          {:else if 'note' in st}
            <Select label="Where" value={st.note} options={[['right of', 'Note right of'], ['left of', 'Note left of'], ['over', 'Note over']]} onchange={(v) => (st.note = v as typeof st.note)} />
            <Select label="Who" value={st.who[0]} options={peopleOptions(seqD)} onchange={(v) => (st.who[0] = v)} />
            {#if st.note === 'over'}
              <Select label="And" value={st.who[1] ?? ''} options={[['', '—'], ...peopleOptions(seqD)]} onchange={(v) => (st.who = v ? [st.who[0], v] : [st.who[0]])} />
            {/if}
            <input class="grow" bind:value={st.text} placeholder="Note" aria-label="Note" />
            <span class="tools">{@render moves(seqD, i)}{@render remove(() => dropStep(seqD, i), 'Remove note')}</span>
          {:else}
            <Select label="From" value={st.from} options={peopleOptions(seqD)} onchange={(v) => (st.from = v)} />
            <Select label="Sends or replies" value={arrowOf(st)} options={seqArrows(st)} onchange={(v) => setArrow(st, v)} />
            <Select label="To" value={st.to} options={peopleOptions(seqD)} onchange={(v) => (st.to = v)} />
            <Select label="Activation" value={st.act ?? ''} options={BARS} onchange={(v) => { if (v) st.act = v as '+' | '-'; else delete st.act; }} />
            <input class="grow" bind:value={st.text} placeholder="Message" aria-label="Message" onkeydown={(e) => rowEnter(e, '.s-msg input.grow', () => addMessage(seqD))} />
            <span class="tools">{@render moves(seqD, i)}{@render remove(() => dropStep(seqD, i), 'Remove message')}</span>
          {/if}
        </div>
      {/each}
      {#if seqD.people.length}
        <div class="adds">
          {@render add(() => addMessage(seqD), 'Add message')}
          {@render add(() => addNote(seqD), 'Note')}
          {@render add(() => addGroup(seqD), 'Group')}
        </div>
      {/if}
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
          <input class="grow label" bind:value={s.label} placeholder="Part" aria-label="Part name" onkeydown={(e) => rowEnter(e, '.p-slice input.label', () => addSlice(pie))} />
          <input class="num" type="number" min="0" step="any" inputmode="decimal" value={s.value} aria-label="Value"
            oninput={(e) => { const v = e.currentTarget.value; if (v !== '') s.value = pieValue(+v); }} onblur={(e) => (e.currentTarget.value = String(s.value))}
            onkeydown={(e) => rowEnter(e, '.p-slice input.num', () => addSlice(pie))} />
          {@render remove(() => pie.slices.splice(i, 1), 'Remove part')}
        </div>
      {/each}
      {@render add(() => addSlice(pie), 'Add part')}
    </div>
  {:else if mind}
    <div class="section">
      <div class="head">Center</div>
      <div class="row">
        <input class="grow" bind:value={mind.root} placeholder="The main idea" aria-label="Center" />
        <Select label="Center shape" value={mind.rootShape ?? 'circle'} options={ROOT_SHAPES} onchange={(v) => { if (v === 'circle') delete mind.rootShape; else mind.rootShape = v as MindShape; }} />
      </div>
    </div>
    <div class="section">
      <div class="head">Branches <span class="tip">{isMobile ? '' : '↩ new · ⇥ deeper · ⇧⇥ back'}</span></div>
      {#each mind.items as b, i (i)}
        <!-- each first-level branch in its colour in the drawing (the centre takes the first) -->
        <div class="row m-item" style:padding-left={`${(b.depth - 1) * 22}px`}>
          <span class="bullet" style:background={b.depth === 1 ? branchColor(mind.items.slice(0, i + 1).filter((x) => x.depth === 1).length - 1) : 'var(--fg-dim)'}></span>
          <input class="grow" bind:value={b.text} placeholder="Idea" aria-label="Branch" onkeydown={(e) => branchKey(e, mind, i)} />
          <Select label="Shape" value={b.shape ?? 'plain'} options={MIND_SHAPES} onchange={(v) => { if (v === 'plain') delete b.shape; else b.shape = v as MindShape; }} />
<span class="tools">
                    <button class="x" type="button" aria-label="Back a level" title="Back a level" disabled={b.depth <= 1} onclick={() => indent(mind, i, -1)}>
            <svg viewBox="0 0 16 16"><path d="M9.5 4.5 6 8l3.5 3.5" /></svg>
          </button>
          <button class="x" type="button" aria-label="Deeper" title="Deeper" disabled={!deeper(mind, i)} onclick={() => indent(mind, i, 1)}>
            <svg viewBox="0 0 16 16"><path d="M6.5 4.5 10 8l-3.5 3.5" /></svg>
          </button>
          {@render remove(() => dropBranch(mind, i), 'Remove branch')}
          </span>
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
        {#if p.section !== undefined}
          <div class="row t-section">
            <input class="grow phase" bind:value={p.section} placeholder="Section" aria-label="Section" />
            {@render remove(() => { delete p.section; }, 'Remove section')}
          </div>
        {/if}
        <div class="row t-period top" data-i={i} class:in-section={time.periods.slice(0, i + 1).some((x) => x.section !== undefined)}>
          <input class="label when" bind:value={p.label} placeholder="2026" aria-label="When" onkeydown={(e) => { if (e.key === 'Enter' && !composing(e)) { e.preventDefault(); void focusAt(`.t-period[data-i="${i}"] .events input`, 0); } }} />
          <div class="events grow">
            {#each p.events as _, j (j)}
              <div class="row">
                <input class="grow" bind:value={p.events[j]} placeholder="What happened" aria-label="Event"
                  onkeydown={(e) => rowEnter(e, `.t-period[data-i="${i}"] .events input`, () => { p.events.push(''); void focusAt(`.t-period[data-i="${i}"] .events input`, p.events.length - 1); })} />
                {#if p.events.length > 1}{@render remove(() => p.events.splice(j, 1), 'Remove event')}{/if}
              </div>
            {/each}
            <button class="add small" type="button" onclick={() => { p.events.push(''); void focusAt(`.t-period[data-i="${i}"] .events input`, p.events.length - 1); }}>
              <svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>Event
            </button>
          </div>
          <span class="tools">
            {@render updown(i > 0 ? () => movePeriod(time, i, -1) : null, i < time.periods.length - 1 ? () => movePeriod(time, i, 1) : null)}
            {@render trash(() => time.periods.splice(i, 1), 'Remove period')}
          </span>
        </div>
      {/each}
      <div class="adds">
        {@render add(() => addPeriod(time), 'Add period')}
        {@render add(() => addSection(time), 'Section')}
      </div>
    </div>
  {:else if gantt}
    <div class="section">
      <div class="head">Title</div>
      <input bind:value={gantt.title} placeholder="Optional" aria-label="Title" />
      <div class="settings">
        <label class="check"><input type="checkbox" checked={!!gantt.skipWeekends} onchange={(e) => { if (e.currentTarget.checked) gantt.skipWeekends = true; else delete gantt.skipWeekends; }} />Skip weekends</label>
        <label class="check"><input type="checkbox" checked={!gantt.noToday} onchange={(e) => { if (e.currentTarget.checked) delete gantt.noToday; else gantt.noToday = true; }} />Today line</label>
      </div>
    </div>
    {#each gantt.sections as s, i (i)}
      <div class="section g-phase" data-i={i}>
        <div class="row">
          <input class="grow label phase" bind:value={s.name} placeholder="Phase" aria-label="Phase" />
          {@render remove(() => gantt.sections.splice(i, 1), 'Remove phase')}
        </div>
        {#each s.tasks as t, j (j)}
          <div class="row g-task">
            <input class="grow label" bind:value={t.name} placeholder="Task" aria-label="Task" onkeydown={(e) => rowEnter(e, `.g-phase[data-i="${i}"] .g-task input.label`, () => addTask(gantt, s))} />
            <Select label="Starts" value={startOf(t)} options={startOptions(gantt, t)} onchange={(v) => setStart(gantt, t, v)} />
            {#if t.after === undefined}
              <input class="date" type="date" value={t.start} aria-label="Starts" oninput={(e) => { const v = e.currentTarget.value; if (plausible(v)) t.start = v; }} onblur={(e) => (e.currentTarget.value = t.start)} />
            {/if}
            {#if t.after}
              <Select label="And after" value="" options={andAfterOptions(gantt, t)} onchange={(v) => addAfter(gantt, t, v)} />
            {/if}
            <Select label="Status" value={(t.tags ?? []).join(', ')} options={tagOptions(t)} onchange={(v) => setTags(t, v)} />
            <span class="days"><input class="num" type="number" min={t.tags?.includes('milestone') ? 0 : 1} max="3650" step="1" inputmode="numeric" value={t.days} aria-label="Days" oninput={(e) => { const n = Math.round(+e.currentTarget.value); if (n >= (t.tags?.includes('milestone') ? 0 : 1)) t.days = Math.min(n, 3650); }} onblur={(e) => (e.currentTarget.value = String(t.days))} />d</span>
            {@render remove(() => s.tasks.splice(j, 1), 'Remove task')}
          </div>
        {/each}
        {@render add(() => addTask(gantt, s), 'Add task')}
      </div>
    {/each}
    <div class="section">{@render add(() => addPhase(gantt), 'Add phase')}</div>
  {:else if cls}
    <div class="section">
      <div class="head">Classes <span class="tip">one field or method a line</span></div>
      {#each cls.classes as c, i (i)}
        <div class="c-class">
          <div class="row">
            <input class="grow name" value={c.name} oninput={(e) => rename(cls.classes, cls.links, c, e.currentTarget.value, NAME_ID)} placeholder="Class" aria-label="Class name" />
            {@render remove(() => drop(cls.classes, cls.links, i), 'Remove class')}
          </div>
          <textarea class="members code" rows={Math.max(2, c.members.length)} value={c.members.join('\n')} spellcheck="false"
            oninput={(e) => (c.members = e.currentTarget.value.split('\n'))} placeholder={'+String name\n+run() bool'} aria-label="Fields and methods"></textarea>
        </div>
      {/each}
      {@render add(() => addClass(cls), 'Add class')}
    </div>
    <div class="section">
      <div class="head">Relations</div>
      {#each cls.links as l, i (i)}
        <div class="row c-link">
          <Select label="From" value={l.from} options={options(cls.classes)} onchange={(v) => (l.from = v)} />
          <input class="card" bind:value={l.fromCard} placeholder="1" aria-label="How many at its start" />
          <Select label="Kind" value={l.arrow} options={arrowOptions(l.arrow)} onchange={(v) => (l.arrow = v)} />
          <input class="card" bind:value={l.toCard} placeholder="*" aria-label="How many at its end" />
          <Select label="To" value={l.to} options={options(cls.classes)} onchange={(v) => (l.to = v)} />
          <input class="grow" bind:value={l.label} placeholder="Label" aria-label="Label" />
          {@render remove(() => cls.links.splice(i, 1), 'Remove relation')}
        </div>
      {/each}
      {#if cls.classes.length}{@render add(() => addClassLink(cls), 'Add relation')}{/if}
    </div>
  {:else if state}
    <div class="section">
      <div class="head">States</div>
      {#each state.states as st, i (i)}
        <!-- a state inside another indented under it, as the drawing boxes it -->
        <div class="row st-state" style:padding-left={`${stateDepth(state, st) * 18}px`}>
          <input class="name" value={st.name} oninput={(e) => renameState(state, st, e.currentTarget.value)} placeholder="State" aria-label="State name" />
          {#if !st.kind && !state.states.some((x) => stateParent(state, x) === st.id)}<input class="grow" bind:value={st.desc} placeholder="Description" aria-label="Description" />{/if}
          <Select label="Kind" value={st.kind ?? 'state'} options={STATE_KINDS} onchange={(v) => { if (v === 'state') delete st.kind; else st.kind = v as 'choice'; }} />
          <Select label="Inside" value={stateParent(state, st) ?? ''} options={insideOptions(state, st)} onchange={(v) => { if (v) st.parent = v; else delete st.parent; }} />
          <input class="grow" value={st.note?.text ?? ''} placeholder="Note" aria-label="Note"
            oninput={(e) => { const text = e.currentTarget.value; if (text) st.note = { side: st.note?.side ?? 'right', text }; else delete st.note; }} />
          {@render remove(() => dropState(state, i), 'Remove state')}
        </div>
      {/each}
      {@render add(() => addState(state), 'Add state')}
    </div>
    <div class="section">
      <div class="head">Transitions</div>
      {#each state.links as l, i (i)}
        <div class="row st-link">
          <Select label="From" value={endValue(l, l.from)} options={starts(state)} onchange={(v) => setEnd(l, 'from', v)} />
          <span class="arrow">→</span>
          <Select label="To" value={endValue(l, l.to)} options={ends(state)} onchange={(v) => setEnd(l, 'to', v)} />
          <input class="grow" bind:value={l.label} placeholder="When" aria-label="When" />
          {@render remove(() => state.links.splice(i, 1), 'Remove transition')}
        </div>
      {/each}
      {@render add(() => addTransition(state), 'Add transition')}
    </div>
  {:else if er}
    {#each er.tables as t, i (i)}
      <div class="section e-table">
        <div class="row">
          <input class="grow name" value={t.name} oninput={(e) => rename(er.tables, er.links, t, e.currentTarget.value, TABLE_ID)} placeholder="Table" aria-label="Table name" />
          {@render remove(() => drop(er.tables, er.links, i), 'Remove table')}
        </div>
        {#each t.columns as c, j (j)}
          <div class="row e-col">
            <input class="type code" bind:value={c.type} placeholder="type" aria-label="Type" spellcheck="false" />
            <input class="grow" bind:value={c.name} placeholder="column" aria-label="Column" spellcheck="false" />
            <input class="pkfk" bind:value={c.keys} placeholder="PK, FK" aria-label="Keys" spellcheck="false" />
            <input class="grow" bind:value={c.comment} placeholder="Comment" aria-label="Comment" />
            {@render remove(() => t.columns.splice(j, 1), 'Remove column')}
          </div>
        {/each}
        {@render add(() => { t.columns.push({ type: 'string', name: '', keys: '', comment: '' }); void focusAt(`.e-table:nth-of-type(${i + 1}) .e-col input.grow`, 2 * t.columns.length - 2); }, 'Add column')}
      </div>
    {/each}
    <div class="section">{@render add(() => addTable(er), 'Add table')}</div>
    <div class="section">
      <div class="head">Relations</div>
      {#each er.links as l, i (i)}
        <div class="row e-link">
          <Select label="From" value={l.from} options={options(er.tables)} onchange={(v) => (l.from = v)} />
          <Select label="How many of it" value={l.left} options={LEFT} onchange={(v) => (l.left = v)} />
          <Select label="Line" value={l.dashed ? 'dashed' : 'solid'} options={[['solid', '──'], ['dashed', '┄┄']]} onchange={(v) => (l.dashed = v === 'dashed')} />
          <Select label="How many of the other" value={l.right} options={RIGHT} onchange={(v) => (l.right = v)} />
          <Select label="To" value={l.to} options={options(er.tables)} onchange={(v) => (l.to = v)} />
          <input class="grow" bind:value={l.label} placeholder="Label" aria-label="Label" />
          {@render remove(() => er.links.splice(i, 1), 'Remove relation')}
        </div>
      {/each}
      {#if er.tables.length}{@render add(() => addRelation(er), 'Add relation')}{/if}
    </div>
  {/if}
  {#if extra?.extra?.length}{@render keptLines(extra.extra)}{/if}
</div>

<style>
  .form { font-size: 13px; color: var(--fg); user-select: text; -webkit-user-select: text; }
  .x svg, .add svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .section { padding: 10px 0 6px; }
  .section + .section { border-top: 1px solid var(--line); }
  .head { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--fg-dim); }
  .head .check { margin-left: auto; }
  .tip { margin-left: auto; font-weight: 400; opacity: 0.8; }
  /* a row too full goes on to a second line: its choices cut to a few letters (Composit…, After the one be…) could
     not be read */
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }
  .row.top { align-items: flex-start; }
  .row :global(.select) { flex: none; max-width: 100%; }
  .grow { flex: 1 1 120px; min-width: 0; }
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
  .t-period.in-section { padding-left: 14px; }
  /* a row's buttons kept together at its end: wrapped one by one, a ▼ or a × sat alone on a line of its own, an
     event's × between two events */
  .tools { display: inline-flex; flex: none; align-items: center; gap: 2px; margin-left: auto; }
  .events .row, .t-period { flex-wrap: nowrap; } /* a period's buttons by its date, not under its events, over the next section */
  .row > .x:last-child { margin-left: auto; } /* a row's × wrapped alone: at its end, not under its first field */
  .settings { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; }
  .g-phase > :global(.add) { margin-left: 14px; }
  .swatch, .bullet { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .bullet { width: 7px; height: 7px; margin: 0 2px; }
  .check { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; color: var(--fg); }
  .check input { accent-color: var(--accent); margin: 0; }
  textarea {
    box-sizing: border-box; font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 8px; resize: vertical;
    border: 0; background: var(--bg-input); color: var(--fg); outline: none; min-width: 0;
  }
  textarea:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  input.code, textarea.code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; }
  .adds { display: flex; flex-wrap: wrap; gap: 2px; }
  /* a row's ↑↓ while it is the one being worked on: on every row, they crowded out its words */
  .s-step .mv { display: none; }
  .s-step:focus-within .mv, :global(html.mobile) .s-step .mv { display: inline-flex; }
  @media (hover: hover) { .s-step:hover .mv { display: inline-flex; } }
  .end { flex: 1; padding: 4px 9px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; color: var(--fg-dim); }
  .name { font-weight: 600; }
  .st-state .name { width: 160px; flex: none; }
  .c-class { margin-bottom: 10px; }
  .members { width: 100%; }
  .card { width: 44px; text-align: center; }
  .arrow { color: var(--fg-dim); }
  .e-table .e-col { padding-left: 14px; }
  .e-table > :global(.add) { margin-left: 14px; }
  .type { width: 90px; }
  /* not .keys: a phone hides every .keys, the shortcuts shown beside a menu's items (app.css) */
  .pkfk { width: 70px; }


  .x {
    flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 0; border-radius: 6px;
    background: none; color: var(--fg-dim); padding: 0;
  }
  @media (hover: hover) { .x:hover:not(:disabled) { background: var(--bg-hover); color: var(--fg); } }
  .x:disabled { opacity: 0.3; }
  .add {
    display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 7px; padding: 5px 9px 5px 6px; margin: 2px 0 4px;
    background: none; color: var(--accent-text); font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .add.small { padding: 3px 7px 3px 4px; font-size: 12px; margin-top: 0; }
  @media (hover: hover) { .add:hover { background: var(--accent-soft); } }

  :global(html.mobile) .s-step:not(:has(.end)), :global(html.mobile) .c-link, :global(html.mobile) .e-link, :global(html.mobile) .e-col, :global(html.mobile) .st-link {
    flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 8px;
  }
  :global(html.mobile) .s-step .grow, :global(html.mobile) .c-link .grow, :global(html.mobile) .e-link .grow, :global(html.mobile) .st-link .grow { flex: 1 1 70%; }
  :global(html.mobile) .st-state .name { width: 40%; }
  /* a period on a phone: its date and its buttons on a line, its events the whole width under them (beside them, an
     event's box was two letters wide) */
  :global(html.mobile) .t-period { flex-wrap: wrap; }
  :global(html.mobile) .t-period .when { flex: 1 1 auto; }
  :global(html.mobile) .t-period .events { flex: 1 1 100%; order: 3; }

  /* a task: its name a line of its own, its start and length under it (four in a row left the name a few letters) */
  :global(html.mobile) .g-task { flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
  :global(html.mobile) .g-task .label { flex: 1 1 100%; }
  :global(html.mobile) .g-task .date { flex: 1 1 auto; width: auto; }
  /* a finger's size: 26px ×s side by side were easy to miss into the wrong one */
  :global(html.mobile) .x { width: 40px; height: 40px; }
  :global(html.mobile) .add { min-height: 40px; }
  :global(html.mobile) .check input { width: 20px; height: 20px; }
  :global(html.mobile) .row { gap: 4px; }
  :global(html.mobile) input:not([type='checkbox']) { font-size: 16px; padding: 9px 10px; } /* 16px: a phone does not zoom in */
</style>
