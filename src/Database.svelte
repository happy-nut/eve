<script lang="ts">
  import { notes, titleOf, OWN_KEYS, propName, type Note, type PropValue } from './lib/notes.svelte';
  import { ui, type MenuItem } from './lib/ui.svelte';
  import { NAME, TYPES, columnsOf, shown, viewRows, withChoice, type DbSchema, type PropDef, type PropType } from './lib/database';

  /**
   * A database (Notion's), mounted in the `database` node view: the pages under this page are its rows, shown as a
   * table or a board. What the table is goes out through `commit` (one step of the note to undo) and comes back
   * through `set`; what a row says (its title, its properties) is the row's own page, written as it changes.
   */
  let { schema: initial, commit, page }: { schema: DbSchema; commit: (d: DbSchema) => void; page: () => string | null } = $props();
  // svelte-ignore state_referenced_locally
  let d = $state.raw(initial);
  export function set(next: DbSchema) { d = next; }
  const put = (next: DbSchema) => { d = next; commit(next); };

  const pageId = $derived(page());
  const rows = $derived(pageId ? notes.all.filter((n) => n.parent === pageId && !n.deleted) : []);
  const shownRows = $derived(viewRows(rows, d, (r) => titleOf(r)));
  const groupProp = $derived(d.props.find((p) => p.name === d.groupBy && p.type === 'select') ?? d.props.find((p) => p.type === 'select'));
  const columns = $derived(columnsOf(shownRows, groupProp));

  const at = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { clientX: Math.round(r.left), clientY: Math.round(r.bottom + 4) }; };
  const open = (n: Note) => { if (pageId) notes.flush(pageId); notes.currentId = n.id; };
  /** a row's title changed in the table: its page's first line */
  function retitle(n: Note, title: string) {
    const t = title.replace(/[\n\r]+/g, ' ').trim() || 'Untitled';
    if (t === titleOf(n)) return;
    const lines = n.body.split('\n');
    const i = lines.findIndex((l) => l.trim());
    if (i < 0) lines.unshift(`# ${t}`); else lines[i] = `# ${t}`;
    notes.update(n.id, lines.join('\n'));
    notes.flush(n.id);
  }

  // ---- the properties (columns) ----
  async function addProp(type: PropType = 'text') {
    const typed = await ui.prompt('Property name', '');
    const name = typed ? propName(typed) : '';
    if (!name) return;
    if (name === NAME || OWN_KEYS.has(name) || d.props.some((p) => p.name === name)) return void ui.tell(`“${name}” is taken: a property needs a name of its own.`);
    put({ ...d, props: [...d.props, { name, type, ...(type === 'select' || type === 'multi' ? { options: [] } : {}) }] });
  }
  async function renameProp(p: PropDef) {
    const typed = await ui.prompt('Rename property', p.name);
    const name = typed ? propName(typed) : '';
    if (!name || name === p.name) return;
    if (name === NAME || OWN_KEYS.has(name) || d.props.some((x) => x.name === name)) return void ui.tell(`“${name}” is taken: a property needs a name of its own.`);
    notes.renameProp(rows.map((r) => r.id), p.name, name);
    const re = (s?: string) => (s === p.name ? name : s);
    put({
      ...d, props: d.props.map((x) => (x === p ? { ...x, name } : x)), groupBy: re(d.groupBy),
      ...(d.sort ? { sort: { ...d.sort, by: re(d.sort.by)! } } : {}), ...(d.filter ? { filter: { ...d.filter, by: re(d.filter.by)! } } : {}),
    });
  }
  async function dropProp(p: PropDef) {
    const used = rows.filter((r) => r.props?.[p.name] !== undefined).length;
    if (used && !(await ui.ask(`Delete the property “${p.name}”? ${used} row${used > 1 ? 's' : ''} lose${used > 1 ? '' : 's'} what it says.`))) return;
    for (const r of rows) notes.setProp(r.id, p.name, null);
    put({
      ...d, props: d.props.filter((x) => x !== p), ...(d.groupBy === p.name ? { groupBy: undefined } : {}),
      ...(d.sort?.by === p.name ? { sort: undefined } : {}), ...(d.filter?.by === p.name ? { filter: undefined } : {}),
    });
  }
  function headMenu(e: MouseEvent, p: PropDef | null) {
    const name = p?.name ?? NAME;
    const sortBy = (desc: boolean) => put({ ...d, sort: { by: name, ...(desc ? { desc: true } : {}) } });
    const items: MenuItem[] = [
      { label: 'Sort ascending', checked: d.sort?.by === name && !d.sort.desc, run: () => sortBy(false) },
      { label: 'Sort descending', checked: d.sort?.by === name && !!d.sort.desc, run: () => sortBy(true) },
      { label: 'No sort', hide: !d.sort, run: () => put({ ...d, sort: undefined }) },
    ];
    if (p) {
      const choices = p.type === 'checkbox' ? ['checked'] : p.type === 'select' || p.type === 'multi' ? p.options ?? [] : [];
      if (choices.length) {
        items.push(...choices.map((c, i) => ({ label: `Only “${c}”`, sep: i === 0, checked: d.filter?.by === p.name && d.filter.is === c, run: () => put({ ...d, filter: { by: p.name, is: c } }) })));
      }
      items.push(
        { label: 'Show all rows', hide: !d.filter, run: () => put({ ...d, filter: undefined }) },
        { label: 'Rename…', sep: true, run: () => void renameProp(p) },
        ...TYPES.map((t, i) => ({ label: `Kind: ${t.label}`, sep: i === 0, checked: p.type === t.type, run: () => put({ ...d, props: d.props.map((x) => (x === p ? { ...x, type: t.type, ...(t.type === 'select' || t.type === 'multi' ? { options: x.options ?? [] } : {}) } : x)) }) })),
        { label: 'Delete property', sep: true, danger: true, run: () => void dropProp(p) },
      );
    }
    ui.openMenu(at(e.currentTarget as HTMLElement), items);
  }

  // ---- a row's cells ----
  const valueOf = (n: Note, p: PropDef) => n.props?.[p.name];
  const list = (v: PropValue | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  function setCell(n: Note, p: PropDef, v: PropValue | null) { notes.setProp(n.id, p.name, v); }
  async function newChoice(p: PropDef): Promise<string | null> {
    const typed = (await ui.prompt(`New choice for “${p.name}”`, ''))?.trim();
    if (!typed) return null;
    put(withChoice(d, p.name, typed));
    return typed;
  }
  function choiceMenu(e: MouseEvent, n: Note, p: PropDef) {
    const now = list(valueOf(n, p));
    const multi = p.type === 'multi';
    const pick = (c: string) => setCell(n, p, multi ? (now.includes(c) ? now.filter((x) => x !== c) : [...now, c]) : now[0] === c ? null : c);
    ui.openMenu(at(e.currentTarget as HTMLElement), [
      ...(p.options ?? []).map((c) => ({ label: c, checked: now.includes(c), run: () => pick(c) })),
      { label: 'New choice…', sep: !!p.options?.length, run: async () => { const c = await newChoice(p); if (c) setCell(n, p, multi ? [...now, c] : c); } },
      { label: 'Clear', hide: !now.length, run: () => setCell(n, p, null) },
    ]);
  }
  function rowMenu(e: MouseEvent, n: Note) {
    ui.openMenu(at(e.currentTarget as HTMLElement), [
      { label: 'Open', run: () => open(n) },
      { label: 'Delete row', danger: true, run: () => notes.remove(n.id) },
    ]);
  }
  /** a new row, with what the view shows already set (the board's column, the table's filter) */
  let fresh = $state<string | null>(null);
  function addRow(props: Record<string, PropValue> = {}) {
    if (!pageId) return;
    const f = d.filter;
    const given = { ...(f && f.is !== 'checked' && f.is !== '' ? { [f.by]: d.props.find((p) => p.name === f.by)?.type === 'multi' ? [f.is] : f.is } : f?.is === 'checked' ? { [f.by]: 'true' } : {}), ...props };
    fresh = notes.addRow(pageId, 'Untitled', given).id;
  }
  const focusFresh = (el: HTMLInputElement, id: string) => { if (id === fresh) { fresh = null; el.focus(); el.select(); } };

  // ---- the board: a card dragged to another column takes its value ----
  let dragging: string | null = null;
  function drop(value: string) {
    const n = rows.find((r) => r.id === dragging);
    dragging = null;
    if (n && groupProp) setCell(n, groupProp, value || null);
  }
</script>

<div class="db" role="group" aria-label="Database">
  <div class="db-top">
    <input class="db-title" value={d.title} placeholder="Untitled database" spellcheck="false"
      onchange={(e) => put({ ...d, title: e.currentTarget.value })} onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    <div class="views" role="tablist">
      <button role="tab" aria-selected={d.view === 'table'} class:on={d.view === 'table'} onclick={() => put({ ...d, view: 'table' })}>Table</button>
      <button role="tab" aria-selected={d.view === 'board'} class:on={d.view === 'board'} onclick={() => put({ ...d, view: 'board', groupBy: d.groupBy ?? groupProp?.name })}>Board</button>
    </div>
  </div>
  {#if d.filter}<div class="note">Only rows whose {d.filter.by} is “{d.filter.is}” · <button class="link" onclick={() => put({ ...d, filter: undefined })}>show all</button></div>{/if}

  {#if d.view === 'table'}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><button class="head" onclick={(e) => headMenu(e, null)}>{NAME}{#if d.sort?.by === NAME}<span class="arrow">{d.sort.desc ? '↓' : '↑'}</span>{/if}</button></th>
            {#each d.props as p (p.name)}
              <th><button class="head" onclick={(e) => headMenu(e, p)}>{p.name}{#if d.sort?.by === p.name}<span class="arrow">{d.sort.desc ? '↓' : '↑'}</span>{/if}</button></th>
            {/each}
            <th class="add-col"><button class="head plus" aria-label="Add a property" onclick={() => void addProp()}>+</button></th>
          </tr>
        </thead>
        <tbody>
          {#each shownRows as n (n.id)}
            <tr>
              <td class="name">
                <input value={titleOf(n)} spellcheck="false" aria-label="Title" {@attach (el) => focusFresh(el as HTMLInputElement, n.id)}
                  onchange={(e) => retitle(n, e.currentTarget.value)} onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                <button class="open" aria-label="Open" title="Open" onclick={() => open(n)}>↗</button>
                <button class="more" aria-label="Row menu" onclick={(e) => rowMenu(e, n)}>⋯</button>
              </td>
              {#each d.props as p (p.name)}
                {@const v = valueOf(n, p)}
                <td>
                  {#if p.type === 'checkbox'}
                    <input type="checkbox" checked={v === 'true'} aria-label={p.name} onchange={(e) => setCell(n, p, e.currentTarget.checked ? 'true' : null)} />
                  {:else if p.type === 'date'}
                    <input type="date" value={typeof v === 'string' ? v : ''} aria-label={p.name} onchange={(e) => setCell(n, p, e.currentTarget.value || null)} />
                  {:else if p.type === 'select' || p.type === 'multi'}
                    <button class="chips" aria-label={p.name} onclick={(e) => choiceMenu(e, n, p)}>
                      {#each list(v) as c}<span class="chip">{c}</span>{:else}<span class="empty">&nbsp;</span>{/each}
                    </button>
                  {:else}
                    <input type={p.type === 'number' ? 'number' : 'text'} value={shown(v, p.type)} aria-label={p.name} spellcheck="false"
                      onchange={(e) => setCell(n, p, e.currentTarget.value.trim() || null)} onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                  {/if}
                </td>
              {/each}
              <td></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button class="new" onclick={() => addRow()}>+ New</button>
  {:else}
    <div class="board">
      <!-- the rows with no value, only while there are some (Notion's "No Status" too) -->
      {#each columns.filter((c) => c.value || c.rows.length || !groupProp) as col (col.value)}
        <div class="col" role="group" aria-label={col.value || "No value"} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); drop(col.value); }}>
          <div class="col-head">{col.value || `No ${groupProp?.name ?? 'value'}`} <span class="count">{col.rows.length}</span></div>
          {#each col.rows as n (n.id)}
            <button class="card" draggable="true" ondragstart={() => (dragging = n.id)} onclick={() => open(n)}>
              <span class="card-title">{titleOf(n)}</span>
              {#each d.props.filter((p) => p !== groupProp && valueOf(n, p) !== undefined) as p (p.name)}
                <span class="card-prop">{p.name}: {shown(valueOf(n, p), p.type)}</span>
              {/each}
            </button>
          {/each}
          <button class="new" onclick={() => addRow(groupProp && col.value ? { [groupProp.name]: col.value } : {})}>+ New</button>
        </div>
      {/each}
      {#if groupProp}
        <button class="col add-choice" onclick={() => void newChoice(groupProp)}>+ Column</button>
      {:else}
        <p class="note">A board groups its rows by a Select property: add one with + in the table.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .db { margin: 0.6em 0; font-size: 0.92em; }
  .db-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .db-title { flex: 1; min-width: 0; font: inherit; font-size: 1.15em; font-weight: 600; border: 0; background: none; color: var(--fg); outline: none; padding: 2px 0; }
  .views { display: flex; gap: 2px; }
  button { font: inherit; border: 0; background: none; color: inherit; border-radius: 6px; }
  .views button { padding: 3px 9px; color: var(--fg-dim); }
  .views button.on { background: var(--bg-input); color: var(--fg); }
  .note { color: var(--fg-dim); font-size: 0.92em; margin: 2px 0 6px; }
  .link { text-decoration: underline; padding: 0; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; }
  th, td { border: 1px solid var(--line); padding: 0; text-align: left; vertical-align: middle; min-width: 120px; }
  th { font-weight: 500; color: var(--fg-dim); }
  th.add-col, td:last-child { min-width: 36px; width: 36px; }
  .head { width: 100%; text-align: left; padding: 5px 8px; }
  .head:hover, .new:hover, .chips:hover, .more:hover, .open:hover { background: var(--bg-hover); }
  .plus { text-align: center; }
  .arrow { margin-left: 4px; }
  td input:not([type='checkbox']) { width: 100%; box-sizing: border-box; font: inherit; border: 0; background: none; color: var(--fg); padding: 5px 8px; outline: none; }
  td input:focus { box-shadow: inset 0 0 0 2px var(--accent-soft); }
  td input[type='checkbox'] { margin: 0 8px; }
  .name { display: flex; align-items: center; }
  .name input { font-weight: 500; }
  .open, .more { flex: none; width: 24px; height: 24px; color: var(--fg-dim); opacity: 0; }
  tr:hover .open, tr:hover .more, .open:focus-visible, .more:focus-visible { opacity: 1; }
  .chips { width: 100%; min-height: 28px; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px; text-align: left; }
  .chip, .count { display: inline-block; padding: 0 6px; border-radius: 4px; background: var(--bg-input); color: var(--fg); }
  .new { display: block; padding: 5px 8px; color: var(--fg-dim); margin-top: 2px; }
  .board { display: flex; gap: 10px; overflow-x: auto; align-items: flex-start; padding-bottom: 4px; }
  .col { flex: none; width: 220px; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: 8px; background: var(--bg-input); }
  .col-head { font-weight: 500; padding: 2px 4px; }
  .count { background: none; color: var(--fg-dim); }
  .card { display: flex; flex-direction: column; gap: 2px; padding: 8px; text-align: left; background: var(--bg); box-shadow: 0 0 0 1px var(--line); }
  .card:hover { background: var(--bg-hover); }
  .card-title { font-weight: 500; }
  .card-prop { color: var(--fg-dim); font-size: 0.9em; }
  .add-choice { justify-content: center; color: var(--fg-dim); min-height: 36px; }
</style>
