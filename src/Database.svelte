<script lang="ts">
  import { notes, titleOf, OWN_KEYS, propName, type Note, type PropValue } from './lib/notes.svelte';
  import { ui, under, type MenuItem } from './lib/ui.svelte';
  import { previewOf } from './lib/markdown';
  import { isoDay, monthGrid, monthName, sameMonth, shiftMonths, weekdayNames } from './lib/date';
  import { evaluate, type Val } from './lib/formula';
  import {
    NAME, ROLLUPS, TYPES, VIEWS, asLink, asList, byDay, columnsOf, computed, linksIn, parseDb, rollup, shown, tagColor, viewRows, withChoice,
    type DbSchema, type PropDef, type PropType, type ViewKind,
  } from './lib/database';

  /**
   * A database (Notion's), mounted in the `database` node view: the pages under this page are its rows, shown as a
   * table, a board, a calendar or a gallery. What the table is goes out through `commit` and comes back through `set`;
   * what a row says (its title, its properties) is the row's own page, written as it changes. ⌘Z / ⌘⇧Z on the table
   * take back (and redo) its own steps, whichever of those they were.
   */
  let { schema: initial, commit, page }: { schema: DbSchema; commit: (d: DbSchema) => void; page: () => string | null } = $props();
  // svelte-ignore state_referenced_locally
  let d = $state.raw(initial);
  export function set(next: DbSchema) { d = next; }

  // ---- the table's own undo: each step knows how to undo and redo itself ----
  type Step = { undo: () => void; redo: () => void };
  const done: Step[] = [], undone: Step[] = [];
  let root: HTMLDivElement;
  function step(redo: () => void, undo: () => void) {
    redo(); done.push({ undo, redo }); undone.length = 0;
    // the keyboard on the table, so ⌘Z next is this undo: a click on a checkbox or a button gives WebKit no focus, and
    // a dialog (Delete property) hands it back to the note, whose ⌘Z undid something else (a column, the whole table)
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  }
  const apply = (next: DbSchema) => { d = next; commit(next); };
  const put = (next: DbSchema) => { const was = d; step(() => apply(next), () => apply(was)); };
  /** ⌘Z / ⌘⇧Z on the table (a field's own words have the field's own undo) */
  export function undoKey(e: KeyboardEvent): boolean {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.altKey) return false;
    if ((e.target as HTMLElement).matches?.('input[type="text"], input[type="number"], input:not([type]), textarea')) return false;
    e.preventDefault();
    const s = e.shiftKey ? undone.pop() : done.pop();
    if (!s) return true;
    if (e.shiftKey) { s.redo(); done.push(s); } else { s.undo(); undone.push(s); }
    return true;
  }

  const pageId = $derived(page());
  const rows = $derived(pageId ? notes.all.filter((n) => n.parent === pageId && !n.deleted) : []);
  const shownRows = $derived(viewRows(rows, d, (r) => titleOf(r), (r, by) => cell(r, by)));
  const groupProp = $derived(d.props.find((p) => p.name === d.groupBy && p.type === 'select') ?? d.props.find((p) => p.type === 'select'));
  const dateProp = $derived(d.props.find((p) => p.name === d.dateBy && p.type === 'date') ?? d.props.find((p) => p.type === 'date'));
  const columns = $derived(columnsOf(shownRows, groupProp));

  // ---- what a cell says: stored values as they read, a relation its pages, a rollup and a formula worked out ----
  const def = (name: string) => d.props.find((p) => p.name === name);
  const pageBy = (title: string) => notes.byTitle(title);
  /** a property of a row as a formula sees it: a number, a checkbox true or false, anything else its words */
  function val(n: Note, name: string, depth = 0): Val {
    if (name === NAME) return titleOf(n);
    const p = def(name);
    if (!p) return null;
    if (p.type === 'formula') return depth > 4 ? null : evaluate(p.expr ?? '', (x) => val(n, x, depth + 1)).value;
    if (p.type === 'rollup') { const r = rolled(n, p); return r !== '' && !isNaN(Number(r)) ? Number(r) : r; }
    const v = n.props?.[name];
    if (v === undefined) return null;
    if (p.type === 'number') { const x = Number(v); return isNaN(x) ? null : x; }
    if (p.type === 'checkbox') return v === 'true';
    return shown(v, p.type);
  }
  /** a rollup: the pages its relation links to, their property `of` (or their titles), made into one value */
  function rolled(n: Note, p: PropDef): string {
    const linked = linksIn(n.props?.[p.relation ?? '']).map(pageBy).filter((x): x is Note => !!x);
    const of = p.of ?? NAME;
    const values = linked.map((x) => (of === NAME ? titleOf(x) : x.props?.[of] === undefined ? '' : asList(x.props[of]).join(', ')));
    return rollup(p.fn === 'count' || p.fn === 'list' ? values : values.filter((v) => v !== ''), p.fn);
  }
  function cell(n: Note, name: string): string {
    if (name === NAME) return titleOf(n);
    const p = def(name);
    if (!p) return '';
    if (p.type === 'rollup') return rolled(n, p);
    if (p.type === 'formula') return evaluate(p.expr ?? '', (x) => val(n, x)).value;
    return shown(n.props?.[name], p.type);
  }
  const formulaError = (p: PropDef, n: Note) => evaluate(p.expr ?? '', (x) => val(n, x)).error;

  const at = (el: HTMLElement) => under(el);
  /** ↩ in a field: what was written is taken (its change), the keyboard stays in the field — blurred, it was on nothing */
  const enterKeeps = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const el = e.currentTarget as HTMLInputElement;
    el.blur();
    el.focus();
    el.select();
  };
  type Where = { clientX: number; clientY: number };
  /** a menu as a question: what was picked, or null when it was closed */
  function choose<T>(where: Where, items: { label: string; value: T; checked?: boolean; sep?: boolean }[]): Promise<T | null> {
    return new Promise((res) => {
      let picked = false;
      // the menu says it closed before it runs the item picked: what was picked is known a moment later
      ui.openMenu(where, items.map((i) => ({ label: i.label, checked: i.checked, sep: i.sep, run: () => { picked = true; res(i.value); } })), () => setTimeout(() => { if (!picked) res(null); }));
    });
  }
  const open = (n: Note) => { if (pageId) notes.flush(pageId); notes.currentId = n.id; };

  // ---- a row's title and its properties: each change one step of the table's undo ----
  function setTitle(id: string, t: string) {
    const n = notes.all.find((x) => x.id === id);
    if (!n) return;
    const lines = n.body.split('\n');
    const i = lines.findIndex((l) => l.trim());
    if (i < 0) lines.unshift(`# ${t}`); else lines[i] = `# ${t}`;
    notes.update(id, lines.join('\n'));
    notes.flush(id);
  }
  function retitle(n: Note, title: string) {
    const t = title.replace(/[\n\r]+/g, ' ').trim() || 'Untitled', was = titleOf(n), id = n.id;
    if (t !== was) step(() => setTitle(id, t), () => setTitle(id, was));
  }
  function setCell(n: Note, p: PropDef, v: PropValue | null) {
    const id = n.id, was = n.props?.[p.name] ?? null;
    if (JSON.stringify(was) === JSON.stringify(v)) return;
    step(() => notes.setProp(id, p.name, v), () => notes.setProp(id, p.name, was));
  }
  /** a new row, with what the view shows already set (the board's column, the calendar's day, the filter) */
  let fresh = $state<string | null>(null);
  async function addRow(props: Record<string, PropValue> = {}) {
    if (!pageId) return;
    // a board, a calendar, a gallery show no field to name it in: it is named first (it was an "Untitled" no one could
    // name, and the keys typed next went into the note)
    const named = d.view === 'table' ? 'Untitled' : await ui.prompt('Name', '');
    if (named === null || !pageId) return;
    const f = d.filter;
    const given = { ...(f && f.is !== 'checked' && f.is !== '' ? { [f.by]: def(f.by)?.type === 'multi' ? [f.is] : f.is } : f?.is === 'checked' ? { [f.by]: 'true' } : {}), ...props };
    const id = notes.addRow(pageId, named.trim() || 'Untitled', given).id;
    if (d.view === 'table') fresh = id;
    done.push({ undo: () => notes.setGone(id, true), redo: () => notes.setGone(id, false) });
    undone.length = 0;
    if (d.view !== 'table' && root) root.focus({ preventScroll: true }); // ⌘Z next takes it back
  }
  const dropRow = (n: Note) => { const id = n.id; step(() => notes.setGone(id, true), () => notes.setGone(id, false)); };
  const focusFresh = (el: HTMLInputElement, id: string) => { if (id === fresh) { fresh = null; el.focus(); el.select(); } };

  // ---- the properties (columns) ----
  /** the databases a relation can link into: pages holding a ```database, their titles */
  const databases = () => notes.pages.filter((n) => n.body.includes('```database')).map((n) => ({ id: n.id, title: titleOf(n) }));
  const schemaOf = (id: string) => {
    const body = notes.all.find((n) => n.id === id)?.body ?? '';
    const m = /```database\n([\s\S]*?)\n```/.exec(body);
    return m ? parseDb(m[1]) : null;
  };
  /** what a property of a kind needs besides its name: choices, a relation's database, a rollup's way, a formula */
  async function configure(type: PropType, where: Where, base: Partial<PropDef> = {}): Promise<Partial<PropDef> | null> {
    if (type === 'select' || type === 'multi') return { options: base.options ?? [] };
    if (type === 'relation') {
      const target = await choose(where, [{ label: 'Any page', value: '' }, ...databases().filter((x) => x.id !== pageId).map((x, i) => ({ label: x.title, value: x.id, sep: i === 0 }))]);
      return target === null ? null : { target };
    }
    if (type === 'rollup') {
      const rels = d.props.filter((p) => p.type === 'relation');
      if (!rels.length) { void ui.tell('A rollup reads through a relation: add a Relation property first.'); return null; }
      const relation = rels.length === 1 ? rels[0].name : await choose(where, rels.map((p) => ({ label: `Through ${p.name}`, value: p.name })));
      if (relation === null) return null;
      const target = rels.find((p) => p.name === relation)?.target;
      const theirs = target ? schemaOf(target)?.props.filter((p) => !computed(p.type)).map((p) => p.name) ?? [] : [];
      const of = await choose(where, [NAME, ...theirs].map((x) => ({ label: `Of ${x}`, value: x })));
      if (of === null) return null;
      const fn = await choose(where, ROLLUPS.map((r) => ({ label: r.label, value: r.fn })));
      return fn === null ? null : { relation, of, fn };
    }
    if (type === 'formula') {
      const expr = await ui.prompt('Formula — e.g. prop("Price") * 2, if(prop("Done"), "✓", "")', base.expr ?? '');
      return expr === null ? null : { expr: expr.trim() };
    }
    return {};
  }
  const nameOk = (name: string, except?: string) => !!name && name !== NAME && !OWN_KEYS.has(name) && !d.props.some((p) => p.name === name && p.name !== except);
  async function addProp(btn: HTMLElement) {
    const where = at(btn);
    const type = await choose(where, TYPES.map((t) => ({ label: t.label, value: t.type })));
    if (!type) return;
    const typed = await ui.prompt('Property name', TYPES.find((t) => t.type === type)!.label);
    const name = typed ? propName(typed) : '';
    if (!name) return;
    if (!nameOk(name)) return void ui.tell(`“${name}” is taken: a property needs a name of its own.`);
    const more = await configure(type, where);
    if (!more) return;
    put({ ...d, props: [...d.props, { name, type, ...more }] });
  }
  async function renameProp(p: PropDef) {
    const typed = await ui.prompt('Rename property', p.name);
    const name = typed ? propName(typed) : '';
    if (!name || name === p.name) return;
    if (!nameOk(name, p.name)) return void ui.tell(`“${name}” is taken: a property needs a name of its own.`);
    const ids = rows.map((r) => r.id), was = d, from = p.name;
    const re = (s?: string) => (s === from ? name : s);
    // a formula that reads it reads it by its new name (left as it was, it read nothing, and showed 0)
    const said = new RegExp(`prop\\(\\s*(["'])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*\\)`, 'g');
    const follow = (x: PropDef) => { const e = x.expr?.replace(said, `prop("${name.replace(/"/g, '\\"')}")`); return e && e !== x.expr ? { expr: e } : {}; };
    const next: DbSchema = {
      ...d, props: d.props.map((x) => (x === p ? { ...x, name } : { ...x, ...(x.relation === from ? { relation: name } : {}), ...follow(x) })), groupBy: re(d.groupBy), dateBy: re(d.dateBy),
      ...(d.sort ? { sort: { ...d.sort, by: re(d.sort.by)! } } : {}), ...(d.filter ? { filter: { ...d.filter, by: re(d.filter.by)! } } : {}),
    };
    step(() => { notes.renameProp(ids, from, name); apply(next); }, () => { notes.renameProp(ids, name, from); apply(was); });
  }
  async function dropProp(p: PropDef) {
    const had = rows.filter((r) => r.props?.[p.name] !== undefined).map((r) => [r.id, r.props![p.name]] as const);
    if (had.length && !(await ui.ask(`Delete the property “${p.name}”? ${had.length} row${had.length > 1 ? 's' : ''} lose${had.length > 1 ? '' : 's'} what it says.`))) return;
    const was = d;
    const next: DbSchema = {
      ...d, props: d.props.filter((x) => x !== p), ...(d.groupBy === p.name ? { groupBy: undefined } : {}), ...(d.dateBy === p.name ? { dateBy: undefined } : {}),
      ...(d.sort?.by === p.name ? { sort: undefined } : {}), ...(d.filter?.by === p.name ? { filter: undefined } : {}),
    };
    step(() => { for (const [id] of had) notes.setProp(id, p.name, null); apply(next); }, () => { for (const [id, v] of had) notes.setProp(id, p.name, v); apply(was); });
  }
  async function changeKind(p: PropDef, type: PropType, where: Where) {
    // made a choice, what its rows already say are its choices (they were chips no menu offered, and the board put
    // those rows under "No …")
    const said = type === 'select' || type === 'multi'
      ? [...new Set(rows.flatMap((r) => { const v = r.props?.[p.name]; return v == null || v === '' ? [] : Array.isArray(v) ? v.map(String) : type === 'multi' ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : [String(v)]; }))]
      : [];
    const more = await configure(type, where, said.length ? { ...p, options: [...(p.options ?? []), ...said.filter((x) => !(p.options ?? []).includes(x))] } : p);
    if (!more) return;
    put({ ...d, props: d.props.map((x) => (x === p ? { name: x.name, type, ...more } : x)) });
  }
  function headMenu(e: MouseEvent, p: PropDef | null) {
    const where = at(e.currentTarget as HTMLElement);
    const name = p?.name ?? NAME;
    const sortBy = (desc: boolean) => put({ ...d, sort: { by: name, ...(desc ? { desc: true } : {}) } });
    const items: MenuItem[] = [
      { label: 'Sort ascending', checked: d.sort?.by === name && !d.sort.desc, run: () => sortBy(false) },
      { label: 'Sort descending', checked: d.sort?.by === name && !!d.sort.desc, run: () => sortBy(true) },
      { label: 'No sort', hide: !d.sort, run: () => put({ ...d, sort: undefined }) },
    ];
    if (p) {
      const choices = p.type === 'checkbox' ? ['checked'] : p.type === 'select' || p.type === 'multi' ? p.options ?? [] : [];
      items.push(...choices.map((c, i) => ({ label: `Only “${c}”`, sep: i === 0, checked: d.filter?.by === p.name && d.filter.is === c, run: () => put({ ...d, filter: { by: p.name, is: c } }) })));
      items.push(
        { label: 'Show all rows', hide: !d.filter, run: () => put({ ...d, filter: undefined }) },
        { label: 'Edit formula…', sep: true, hide: p.type !== 'formula', run: () => void changeKind(p, 'formula', where) },
        { label: 'Rollup…', sep: true, hide: p.type !== 'rollup', run: () => void changeKind(p, 'rollup', where) },
        { label: 'Rename…', sep: p.type !== 'formula' && p.type !== 'rollup', run: () => void renameProp(p) },
        ...TYPES.map((t, i) => ({ label: `Kind: ${t.label}`, sep: i === 0, checked: p.type === t.type, run: () => void changeKind(p, t.type, where) })),
        { label: 'Delete property', sep: true, danger: true, run: () => void dropProp(p) },
      );
    }
    ui.openMenu(where, items);
  }

  // ---- choices, and a relation's pages ----
  async function newChoice(p: PropDef): Promise<string | null> {
    const typed = (await ui.prompt(`New choice for “${p.name}”`, ''))?.trim();
    if (!typed) return null;
    put(withChoice(d, p.name, typed));
    return typed;
  }
  function choiceMenu(e: MouseEvent, n: Note, p: PropDef) {
    const now = asList(n.props?.[p.name]);
    const multi = p.type === 'multi';
    const pick = (c: string) => setCell(n, p, multi ? (now.includes(c) ? now.filter((x) => x !== c) : [...now, c]) : now[0] === c ? null : c);
    ui.openMenu(at(e.currentTarget as HTMLElement), [
      ...(p.options ?? []).map((c) => ({ label: c, checked: now.includes(c), run: () => pick(c) })),
      { label: 'New choice…', sep: !!p.options?.length, run: async () => { const c = await newChoice(p); if (c) setCell(n, p, multi ? [...now, c] : c); } },
      { label: 'Clear', hide: !now.length, run: () => setCell(n, p, null) },
    ]);
  }
  /** a relation's pages: the linked database's rows (or every page), each toggled; many: search first */
  async function relationMenu(e: MouseEvent, n: Note, p: PropDef) {
    const where = at(e.currentTarget as HTMLElement);
    const now = linksIn(n.props?.[p.name]);
    let pool = (p.target ? notes.all.filter((x) => x.parent === p.target && !x.deleted) : notes.pages.filter((x) => x.id !== n.id)).map((x) => titleOf(x));
    if (pool.length > 30) {
      const q = (await ui.prompt(`Link which page? (${pool.length} to choose from)`, ''))?.trim().toLowerCase();
      if (q === undefined) return;
      pool = pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 30);
    }
    const all = [...new Set([...now, ...pool])];
    ui.openMenu(where, all.length
      ? all.map((t) => ({ label: t, checked: now.includes(t), run: () => setCell(n, p, (now.includes(t) ? now.filter((x) => x !== t) : [...now, t]).map(asLink)) }))
      : [{ label: p.target ? 'That database has no rows yet' : 'No pages to link', disabled: true }]);
  }

  // ---- views ----
  function setView(v: ViewKind) {
    put({ ...d, view: v, ...(v === 'board' ? { groupBy: d.groupBy ?? groupProp?.name } : {}), ...(v === 'calendar' ? { dateBy: d.dateBy ?? dateProp?.name } : {}) });
  }
  let dragging: string | null = null;
  function dropOn(p: PropDef | undefined, value: string) {
    const n = rows.find((r) => r.id === dragging);
    dragging = null;
    if (n && p) setCell(n, p, value || null);
  }
  let month = $state(isoDay(new Date()));
  const today = isoDay(new Date());
  const weekNames = weekdayNames();
  const days = $derived(byDay(shownRows, dateProp?.name));
</script>

<!-- the table's own ⌘Z, for what is done on it (a field's words keep the field's own undo) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="db" role="group" aria-label="Database" tabindex="-1" bind:this={root} onkeydown={undoKey}>
  <div class="db-top">
    <input class="db-title" value={d.title} placeholder="Untitled database" spellcheck="false" aria-label="Database title"
      onchange={(e) => put({ ...d, title: e.currentTarget.value })} onkeydown={enterKeeps} />
    <div class="views" role="tablist">
      {#each VIEWS as v (v.view)}
        <button role="tab" aria-selected={d.view === v.view} class:on={d.view === v.view} onclick={() => setView(v.view)}>{v.label}</button>
      {/each}
    </div>
  </div>
  {#if d.filter}<div class="note">Only rows whose {d.filter.by} is “{d.filter.is}” · <button class="link" onclick={() => put({ ...d, filter: undefined })}>show all</button></div>{/if}

  {#snippet value(n: Note, p: PropDef)}
    {@const v = n.props?.[p.name]}
    {#if p.type === 'checkbox'}
      <input type="checkbox" checked={v === 'true'} aria-label={p.name} onchange={(e) => setCell(n, p, e.currentTarget.checked ? 'true' : null)} />
    {:else if p.type === 'date'}
      <input type="date" class:blank={!v} value={typeof v === 'string' ? v : ''} aria-label={p.name} onchange={(e) => setCell(n, p, e.currentTarget.value || null)} />
    {:else if p.type === 'select' || p.type === 'multi'}
      <button class="chips" aria-label={p.name} onclick={(e) => choiceMenu(e, n, p)}>
        {#each asList(v) as c}<span class="chip" style:background="var(--tag-{tagColor(c)})">{c}</span>{:else}<span class="empty">&nbsp;</span>{/each}
      </button>
    {:else if p.type === 'relation'}
      <button class="chips" aria-label={p.name} onclick={(e) => void relationMenu(e, n, p)}>
        {#each linksIn(v) as t}<span class="chip link-chip">↗ {t}</span>{:else}<span class="empty">&nbsp;</span>{/each}
      </button>
    {:else if computed(p.type)}
      {@const err = p.type === 'formula' ? formulaError(p, n) : undefined}
      <span class="computed" class:err title={err ?? ''}>{err ? '⚠ ' + err : cell(n, p.name)}</span>
    {:else}
      <input type={p.type === 'number' ? 'number' : 'text'} value={shown(v, p.type)} aria-label={p.name} spellcheck="false"
        onchange={(e) => setCell(n, p, e.currentTarget.value.trim() || null)} onkeydown={enterKeeps} />
    {/if}
  {/snippet}

  {#snippet card(n: Note, skip: PropDef | undefined)}
    <button class="card" draggable="true" ondragstart={() => (dragging = n.id)} onclick={() => open(n)}>
      <span class="card-title">{titleOf(n)}</span>
      {#each d.props.filter((p) => p !== skip && cell(n, p.name)) as p (p.name)}
        <span class="card-prop">{p.name}: {cell(n, p.name)}</span>
      {/each}
    </button>
  {/snippet}

  {#if d.view === 'table'}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><button class="head" onclick={(e) => headMenu(e, null)}>{NAME}{#if d.sort?.by === NAME}<span class="arrow">{d.sort.desc ? '↓' : '↑'}</span>{/if}</button></th>
            {#each d.props as p (p.name)}
              <th><button class="head" onclick={(e) => headMenu(e, p)}>{p.name}{#if d.sort?.by === p.name}<span class="arrow">{d.sort.desc ? '↓' : '↑'}</span>{/if}</button></th>
            {/each}
            <th class="add-col"><button class="head plus" aria-label="Add a property" onclick={(e) => void addProp(e.currentTarget)}>+</button></th>
          </tr>
        </thead>
        <tbody>
          {#each shownRows as n (n.id)}
            <tr>
              <td class="name"><div class="name-row">
                <input value={titleOf(n)} spellcheck="false" aria-label="Title" {@attach (el) => focusFresh(el as HTMLInputElement, n.id)}
                  onchange={(e) => retitle(n, e.currentTarget.value)} onkeydown={enterKeeps} />
                <button class="open" aria-label="Open" title="Open" onclick={() => open(n)}>↗</button>
                <button class="more" aria-label="Row menu" onclick={(e) => ui.openMenu(at(e.currentTarget), [{ label: 'Open', run: () => open(n) }, { label: 'Delete row', danger: true, run: () => dropRow(n) }])}>⋯</button>
              </div></td>
              {#each d.props as p (p.name)}<td>{@render value(n, p)}</td>{/each}
              <td></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button class="new" onclick={() => addRow()}>+ New</button>
  {:else if d.view === 'board'}
    <div class="board">
      <!-- the rows with no value, only while there are some (Notion's "No Status" too) -->
      {#each columns.filter((c) => c.value || c.rows.length || !groupProp) as col (col.value)}
        <div class="col" role="group" aria-label={col.value || 'No value'} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); dropOn(groupProp, col.value); }}>
          <div class="col-head">{#if col.value}<span class="chip head-chip" style:background="var(--tag-{tagColor(col.value)})">{col.value}</span>{:else}No {groupProp?.name ?? 'value'}{/if} <span class="count">{col.rows.length}</span></div>
          {#each col.rows as n (n.id)}{@render card(n, groupProp)}{/each}
          <button class="new" onclick={() => addRow(groupProp && col.value ? { [groupProp.name]: col.value } : {})}>+ New</button>
        </div>
      {/each}
      {#if groupProp}
        <button class="col add-choice" onclick={() => void newChoice(groupProp)}>+ Column</button>
      {:else}
        <p class="note">A board groups its rows by a Select property: add one with + in the table.</p>
      {/if}
    </div>
  {:else if d.view === 'calendar'}
    {#if dateProp}
      <div class="cal-bar">
        <button onclick={() => (month = shiftMonths(month, -1))} aria-label="Previous month">‹</button>
        <span class="cal-month">{monthName(month)}</span>
        <button onclick={() => (month = shiftMonths(month, 1))} aria-label="Next month">›</button>
        <button onclick={() => (month = today)}>Today</button>
        <span class="note">by {dateProp.name}</span>
      </div>
      <div class="cal">
        {#each weekNames as w}<div class="wd">{w}</div>{/each}
        {#each monthGrid(month).flat() as iso (iso)}
          <div class="day" class:out={!sameMonth(iso, month)} class:today={iso === today} role="group" aria-label={iso}
            ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); dropOn(dateProp, iso); }}>
            <div class="day-head"><span>{+iso.slice(-2)}</span><button class="day-add" aria-label="New on {iso}" onclick={() => addRow({ [dateProp.name]: iso })}>+</button></div>
            {#each days.get(iso) ?? [] as n (n.id)}
              <button class="day-row" draggable="true" ondragstart={() => (dragging = n.id)} onclick={() => open(n)}>{titleOf(n)}</button>
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <p class="note">A calendar places its rows by a Date property: add one with + in the table.</p>
    {/if}
  {:else}
    <div class="gallery">
      {#each shownRows as n (n.id)}
        <button class="g-card" onclick={() => open(n)}>
          {#if previewOf(n.body, 140)}<span class="g-preview">{previewOf(n.body, 140)}</span>{/if}
          <span class="card-title">{titleOf(n)}</span>
          {#each d.props.filter((p) => cell(n, p.name)) as p (p.name)}<span class="card-prop">{p.name}: {cell(n, p.name)}</span>{/each}
        </button>
      {/each}
      <button class="g-card g-new" onclick={() => addRow()}>+ New</button>
    </div>
  {/if}
</div>

<style>
  .db { margin: 0.6em 0; font-size: 0.92em; outline: none; }
  /* an empty date shows nothing until it is being set: WebKit draws today in it, dimmed, read as a date that is there */
  .db input[type='date'].blank:not(:focus)::-webkit-datetime-edit { color: transparent; }
  .db-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .db-title { flex: 1; min-width: 120px; font: inherit; font-size: 1.15em; font-weight: 600; border: 0; background: none; color: var(--fg); outline: none; padding: 2px 0; }
  .views { display: flex; flex-wrap: wrap; gap: 2px; } /* a narrow column, a large text: onto a second line, not past the column */
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
  /* the row of the title and its buttons inside the cell: flex on the cell itself took it out of the table's row
     layout, and its borders stood a few px off the others' */
  .name-row { display: flex; align-items: center; }
  .name input { font-weight: 500; }
  .open, .more { flex: none; width: 24px; height: 24px; color: var(--fg-dim); opacity: 0; }
  tr:hover .open, tr:hover .more, .open:focus-visible, .more:focus-visible { opacity: 1; }
  .chips { width: 100%; min-height: 28px; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px; text-align: left; }
  .chip, .count { display: inline-block; padding: 0 6px; border-radius: 4px; background: var(--bg-input); color: var(--fg); }
  .link-chip { color: var(--accent-text); }
  .computed { display: block; padding: 5px 8px; color: var(--fg); }
  .computed.err { color: var(--fg-dim); font-size: 0.9em; }
  .new { display: block; padding: 5px 8px; color: var(--fg-dim); margin-top: 2px; }
  .board { display: flex; gap: 10px; overflow-x: auto; align-items: flex-start; padding-bottom: 4px; }
  .col { flex: none; width: 220px; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: 8px; background: var(--bg-input); }
  .col-head { font-weight: 500; padding: 2px 4px; display: flex; align-items: center; gap: 6px; min-width: 0; }
  /* a long choice: one line, cut short, its count still beside it */
  .head-chip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-head .count { flex: none; }
  .count { background: none; color: var(--fg-dim); }
  .card, .g-card { display: flex; flex-direction: column; gap: 2px; padding: 8px; text-align: left; background: var(--bg); box-shadow: 0 0 0 1px var(--line); }
  .card:hover, .g-card:hover { background: var(--bg-hover); }
  .card-title { font-weight: 500; }
  .card-prop { color: var(--fg-dim); font-size: 0.9em; }
  .add-choice { justify-content: center; color: var(--fg-dim); min-height: 36px; }
  .cal-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }
  .cal-bar button { padding: 2px 8px; color: var(--fg-dim); }
  :global(html.mobile) .cal-bar button { min-width: 40px; min-height: 40px; } /* a finger's size */
  .cal-bar button:hover { background: var(--bg-hover); color: var(--fg); }
  .cal-month { font-weight: 600; min-width: 9em; text-align: center; }
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .wd { padding: 3px 6px; color: var(--fg-dim); font-size: 0.85em; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .day { min-height: 78px; padding: 3px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); min-width: 0; }
  .day.out { color: var(--fg-dim); }
  .day.today .day-head span { background: var(--accent); color: var(--on-accent); border-radius: 10px; padding: 0 6px; }
  .day-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85em; }
  .day-add { width: 18px; height: 18px; line-height: 1; color: var(--fg-dim); opacity: 0; }
  .day:hover .day-add, .day-add:focus-visible { opacity: 1; }
  /* a phone has no hover: there they are always there, a finger's size (a row could not be opened or deleted) */
  :global(html.mobile) .db .open, :global(html.mobile) .db .more, :global(html.mobile) .db .day-add { opacity: 1; width: 36px; height: 36px; }
  .day-row { text-align: left; padding: 2px 5px; border-radius: 4px; background: var(--bg-input); color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88em; }
  .day-row:hover { background: var(--bg-active); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .g-preview { display: block; height: 72px; overflow: hidden; color: var(--fg-dim); font-size: 0.86em; line-height: 1.4; padding-bottom: 6px; margin-bottom: 4px; border-bottom: 1px solid var(--line); white-space: pre-line; }
  .g-new { justify-content: center; align-items: center; color: var(--fg-dim); min-height: 120px; }
</style>
