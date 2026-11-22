<script lang="ts">
  import { isMobile } from './lib/platform';
  import { hints } from './lib/hints.svelte';
  import { updates } from './lib/updates.svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick, untrack } from 'svelte';
  import { notes, nested, titleOf, rankByTitle, CALENDAR, type Note } from './lib/notes.svelte';
  import { isDailyId, DAILY_TEMPLATE_ID, CALENDAR_NOTE_ID } from './lib/daily';
  import { tree } from './lib/tree.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { typedIn } from './lib/hangul';
  import { sync } from './lib/sync.svelte';
  import { ui, under, hooks, errorText, type MenuItem } from './lib/ui.svelte';
  import { composing } from './lib/keys';
  import { importFromFinder, importFromFolder } from './lib/transfer';
  import Icon from './Icon.svelte';
  import { appearance } from './lib/appearance.svelte';
  import * as moves from './lib/moves';
  import { focusNote } from './lib/popup';
  import { touchReorder, type Reorder } from './lib/touchReorder';
  import { swipeRow } from './lib/swipeRow';
  import { previewOf, rawQuery, searchText } from './lib/markdown';
  import { editedLabel } from './lib/date';
  import { tabs } from './lib/tabs.svelte';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), cmdHeld = false, onSettings, onNew }:
    { open: boolean; searchEl: HTMLInputElement | null; cmdHeld?: boolean; onSettings: () => void; onNew?: () => void } = $props();
  const jumpNumbers = $derived.by(() => {
    const m = new Map<string, number>();
    if (cmdHeld && !q) tree.visibleOrdered().slice(0, 9).forEach((n, i) => m.set(n.id, i + 1));
    return m;
  });

  const q = $derived(ui.search.trim().toLowerCase());
  const matchesSearch = (n: Note, q: string) => typedIn(shownText(n), q) || (rawQuery(q) && n.body.toLowerCase().includes(q));
  const hits = $derived(rankByTitle([...notes.visible, ...(appearance.s.dailyNotes ? notes.daily : [])].filter((n) => matchesSearch(n, q)), q));
  let searchHasKeyboard = $state(false);
  const shown = new Map<string, { body: string; text: string }>();
  function shownText(n: Note): string {
    const had = shown.get(n.id);
    if (had?.body === n.body) return had.text;
    const text = (titleOf(n) + '\n' + searchText(n.body)).toLowerCase();
    shown.set(n.id, { body: n.body, text });
    return text;
  }

  type Row =
    | { kind: 'note'; key: string; n: Note; depth: number; kids?: boolean }
    | { kind: 'empty'; key: string; text: string; depth: number };
  const rows = $derived.by((): Row[] => {
    if (q) return hits.length ? hits.map((n) => ({ kind: 'note', key: n.id, n, depth: 0 })) : [{ kind: 'empty', key: 'empty:search', text: 'No matches', depth: 0 }];
    return nested(notes.visible, (id) => tree.isFolded(id)).map(({ n, depth, kids }) => ({ kind: 'note', key: n.id, n, depth, kids }));
  });

  $effect(() => {
    const id = notes.currentId === CALENDAR ? CALENDAR_NOTE_ID : notes.currentId;
    if (!id) return;
    untrack(() => tree.reveal(id));
    void tick().then(() => document.querySelector(`aside [data-note="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  function showOpen(list: HTMLElement) {
    void tick().then(() => list.querySelector('[data-row].active')?.scrollIntoView({ block: isMobile ? 'center' : 'nearest' }));
  }

  let ctxNote = $state<Note | null>(null);
  hooks.openPlus = (anchor?: HTMLElement) => {
    if (ui.menu) { ui.closeMenu(); return; }
    const el = document.activeElement as HTMLElement | null;
    const row = el?.closest<HTMLElement>('[data-row]');
    const r = (anchor ?? row ?? searchEl)?.getBoundingClientRect();
    const n = row ? notes.all.find((x) => x.id === row.dataset.note) : notes.current;
    ctxNote = n && n.id !== CALENDAR_NOTE_ID && !n.deleted ? n : null;
    ui.openMenu(r ? { ...under(r), clientX: Math.round(r.left + (row && !anchor ? 8 : 0)) } : { clientX: 12, clientY: 40 }, plusItems);
  };
  async function transfer(run: () => Promise<unknown>) {
    try { await run(); } catch (err) { await ui.ask(`Could not import. ${errorText(err)}`, false); }
  }
  const opened = (first: Note | null) => { if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; } };
  const importFiles = () => transfer(async () => opened(await importFromFinder()));
  const importFolder = () => transfer(async () => opened(await importFromFolder()));

  const newNote = async () => { ui.focusOwner = 'editor'; ui.search = ''; notes.create(''); await tick(); focusNote(); };
  const newPageIn = (n: Note) => async () => {
    ui.focusOwner = 'editor'; ui.search = '';
    tree.unfold(n.id);
    notes.create('', n.id);
    await tick(); focusNote();
  };

  const plusItems = $derived.by(() => {
    const items: { label: string; run: () => void; sep?: boolean }[] = [
      ...(ctxNote ? [{ label: `New note in “${titleOf(ctxNote)}”`, run: newPageIn(ctxNote) }] : []),
      { label: 'New note', run: newNote },
    ];
    if (appearance.s.dailyNotes) items.push({ label: "Today's daily note", run: () => { ui.focusOwner = 'editor'; notes.caretEnd = true; notes.openDaily(); } });
    items.push(
      { label: 'Import files…', run: importFiles, sep: true },
      { label: 'Import folder…', run: importFolder },
    );
    return items;
  });
  let drag = $state<{ note: string } | null>(null);
  let dropAt = $state<{ parent: string; beforeNote?: string; afterNote?: string } | null>(null);

  function dragStartNote(e: DragEvent, n: Note) {
    if (q) { e.preventDefault(); return; }
    drag = { note: n.id };
    e.dataTransfer?.setData('text/plain', n.id);
    e.dataTransfer!.effectAllowed = 'move';
  }
  function allow(e: DragEvent) { e.preventDefault(); e.stopPropagation(); e.dataTransfer!.dropEffect = 'move'; }
  function overEnd(e: DragEvent) {
    if (!drag) return;
    allow(e);
    dropAt = { parent: '' };
  }
  function overNote(e: DragEvent, n: Note) {
    if (!drag) return;
    if (drag.note === n.id) { e.stopPropagation(); dropAt = null; return; }
    const parentOfNote = (x: Note) => (x.parent && notes.visible.some((m) => m.id === x.parent) ? x.parent : '');
    const pagesUnder = (p: string) => notes.visible.filter((x) => parentOfNote(x) === p && x.id !== drag?.note);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const below = e.clientY >= r.top + r.height / 2;
    const kids = below && !tree.isFolded(n.id) ? pagesUnder(n.id) : [];
    let at: { parent: string; before: string | null; after?: string };
    if (!below) at = { parent: parentOfNote(n), before: n.id };
    else if (kids.length) at = { parent: n.id, before: kids[0].id };
    else {
      const sibs = pagesUnder(parentOfNote(n));
      const next = sibs[sibs.indexOf(n) + 1];
      at = { parent: parentOfNote(n), before: next?.id ?? null, after: next ? undefined : n.id };
    }
    const mover = drag.note;
    if (at.parent && (mover === CALENDAR_NOTE_ID || at.parent === CALENDAR_NOTE_ID || at.parent === mover || notes.isAncestor(mover, at.parent))) return;
    allow(e);
    dropAt = { parent: at.parent, beforeNote: at.before ?? undefined, afterNote: at.after };
  }
  function drop(e: DragEvent) {
    if (!drag) return;
    e.preventDefault(); e.stopPropagation();
    const d = drag, at = dropAt;
    dragEnd();
    if (!at) return;
    if (!isMobile) hints.show('sidebarMove', 'Move notes from the keyboard: open the list, then ⌥↑↓', shortcuts.keysFor('focusSidebar'));
    if (at.parent) tree.unfold(at.parent);
    notes.place(d.note, at.parent, at.beforeNote ?? null);
  }
  function dragEnd() { drag = null; dropAt = null; }

  const reorder: Reorder = {
    lift(row) {
      const n = row.dataset.note;
      drag = n ? { note: n } : null;
    },
    over(x, y) {
      const as = (el: HTMLElement) => ({
        clientX: x, clientY: y, currentTarget: el, target: el,
        preventDefault() {}, stopPropagation() {}, dataTransfer: { dropEffect: '' },
      }) as unknown as DragEvent;
      dropAt = null;
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const noteRow = el?.closest<HTMLElement>('.note-row');
      const list = el?.closest<HTMLElement>('.tree');
      if (noteRow) {
        const id = noteRow.querySelector<HTMLElement>('[data-note]')?.dataset.note;
        const n = notes.all.find((m) => m.id === id);
        if (n) overNote(as(noteRow), n);
      } else if (list) overEnd(as(list));
    },
    drop() {
      if (!dropAt) return false;
      drop({ preventDefault() {}, stopPropagation() {} } as unknown as DragEvent);
      return true;
    },
    cancel: dragEnd,
  };

  function neighbourOf(sel: string): string {
    const rows = rowsNow(), i = rows.findIndex((r) => r.matches(sel));
    const nb = i < 0 ? undefined : rows[i + 1] ?? rows[i - 1];
    return nb?.dataset.note ? `[data-note="${nb.dataset.note}"]` : '[data-row]';
  }
  async function afterRemove(next: string, fromList: boolean) {
    if (isMobile) return;
    await tick();
    const a = document.activeElement;
    if (fromList || !a || a === document.body) void focusRow(next);
  }
  const inList = () => !!document.activeElement?.closest('aside');
  async function removeNote(n: Note) {
    if (n.id === CALENDAR_NOTE_ID) return;
    if (n.id === notes.currentId) hints.action('deleteNote', 'Delete the open note');
    const next = neighbourOf(`[data-note="${n.id}"]`), fromList = inList();
    if (!(await ui.ask(`Delete “${titleOf(n)}”?`))) return;
    notes.remove(n.id);
    void afterRemove(next, fromList);
  }
  const rowsNow = () => [...document.querySelectorAll<HTMLElement>('aside [data-row]')].filter((r) => !r.closest('[inert]'));
  async function focusRow(sel: string) {
    await tick();
    (document.querySelector<HTMLElement>(`aside ${sel}`) ?? rowsNow()[0])?.focus();
  }

  function nudgeNote(id: string, dir: 1 | -1) { if (moves.nudgeNote(id, dir)) focusRow(`[data-note="${id}"]`); }
  function rowAbove(id: string) {
    const rows = rowsNow();
    return rows[rows.findIndex((r) => r.dataset.note === id) - 1]?.dataset.note;
  }
  function nestNote(id: string, dir: 'in' | 'out') {
    if (moves.nestNote(id, dir, rowAbove(id))) focusRow(`[data-note="${id}"]`);
  }
  function treeKey(e: KeyboardEvent) {
    if (ui.pending) return;
    const rows = rowsNow();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!el || (e.target as HTMLElement).tagName === 'INPUT') return;
    const i = rows.indexOf(el);
    const noteId = el.dataset.note;
    if (e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault(); e.stopPropagation();
      if (q) return;
      if (noteId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) nudgeNote(noteId, e.key === 'ArrowUp' ? -1 : 1);
      else if (noteId) nestNote(noteId, e.key === 'ArrowRight' ? 'in' : 'out');
      return;
    }
    switch (e.key) {
      case ' ': if (noteId) tree.fold(noteId); else return; break;
      case 'ArrowDown': rows[i + 1]?.focus(); break;
      case 'ArrowUp': if (i === 0 && q) searchEl?.focus(); else rows[i - 1]?.focus(); break;
      case 'ArrowLeft': {
        const hasKids = !!el.closest('.note-row')?.querySelector('.fold');
        if (noteId && hasKids && !tree.isFolded(noteId)) tree.fold(noteId);
        else {
          const n = noteId ? notes.all.find((x) => x.id === noteId) : undefined;
          if (n?.parent && rows.some((r) => r.dataset.note === n.parent)) focusRow(`[data-note="${n.parent}"]`);
          else return;
        }
        break;
      }
      case 'ArrowRight': {
        const kids = noteId && el.closest('.note-row')?.querySelector('.fold');
        const first = rows[i + 1];
        if (kids && tree.isFolded(noteId)) tree.fold(noteId);
        else if (kids && first && notes.all.find((n) => n.id === first.dataset.note)?.parent === noteId) first.focus();
        else focusNote();
        break;
      }
      case 'Backspace': case 'Delete':
        if (noteId) void removeNote(notes.all.find((n) => n.id === noteId)!);
        break;
      case 'Enter':
        if (e.altKey) { rowMenu(e, el); return; }
        return;
      case 'i': { const n = notes.all.find((x) => x.id === noteId); if (n) pickIcon(n); break; }
      case 'Escape': if (ui.pdf || ui.find) return; focusNote(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function rowClick(e: MouseEvent, n: Note) {
    const icon = (e.target as Element).closest<HTMLElement>('.ico-slot');
    if (icon && !isMobile) {
      e.stopPropagation();
      void pickIcon(n, icon);
      return;
    }
    if (e.metaKey && !isMobile && n.id !== CALENDAR_NOTE_ID) tabs.open(n.id); else void openNote(n);
  }
  async function pickIcon(n: Note, anchor?: HTMLElement) {
    const el = anchor ?? document.querySelector<HTMLElement>(`aside [data-note="${n.id}"]`);
    const v = await ui.pickEmoji(el ?? new DOMRect(60, 60, 0, 0), n.icon ?? '');
    if (v !== null) notes.setIcon(n.id, v);
    if (!isMobile) void focusRow(`[data-note="${n.id}"]`);
  }

  function rowMenu(e: MouseEvent | KeyboardEvent, from?: HTMLElement) {
    const row = from ?? (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    row.focus();
    ui.focusOwner = 'sidebar';
    const n = row.dataset.note ? notes.all.find((x) => x.id === row.dataset.note) : undefined;
    if (n?.id === CALENDAR_NOTE_ID) return;
    const items: MenuItem[] = n
        ? [
            { label: 'Open', run: () => openNote(n) },
            { label: 'Open in new tab', run: () => tabs.open(n.id), hide: isMobile },
            { label: 'New note inside', run: newPageIn(n) },
            { label: 'Change icon…', run: () => pickIcon(n) },
            { label: 'Move up', sep: true, run: () => nudgeNote(n.id, -1), hide: !!q || !moves.canNudge(n.id, -1) },
            { label: 'Move down', run: () => nudgeNote(n.id, 1), hide: !!q || !moves.canNudge(n.id, 1) },
            { label: 'Nest under previous', run: () => nestNote(n.id, 'in'), hide: !!q || !moves.canNest(n.id, 'in', rowAbove(n.id)) },
            { label: 'Move out', run: () => nestNote(n.id, 'out'), hide: !!q || !moves.canNest(n.id, 'out') },
            { label: 'Delete note', sep: true, danger: true, run: () => removeNote(n) },
          ]
        : [];
    const box = row.getBoundingClientRect();
    const at = 'clientX' in e && e.clientX ? e : { clientX: Math.round(box.left + 12), clientY: Math.round(box.bottom) };
    if (items.length) ui.openMenu(at, items);
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { ui.search = ''; e.preventDefault(); focusNote(); }
    if (e.key === 'Enter' && hits[0] && !composing(e)) { e.preventDefault(); const n = hits[0]; ui.search = ''; void openNote(n); }
    if (e.key === 'ArrowDown' && !composing(e)) { rowsNow()[0]?.focus(); e.preventDefault(); }
  }
  let pullPx = $state(0);
  let swipedAway = $state(false);
  $effect.pre(() => { if (open) swipedAway = false; });
  let touch: { x: number; y: number; axis: '' | 'x' | 'y' } | null = null;
  function drawer(node: HTMLElement) {
    if (!isMobile) return slide(node, { axis: 'x', duration: 220, easing: cubicOut });
    if (swipedAway) return { duration: 0 };
    return { duration: 240, easing: cubicOut, css: (t: number) => `transform: translateX(${(t - 1) * 100}%)` };
  }
  function pullStart(e: TouchEvent) {
    if (!isMobile || !(notes.current || notes.currentId === CALENDAR) || e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest('input, .fab, .menu')) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: '' };
  }
  function pullMove(e: TouchEvent) {
    if (!touch) return;
    if (e.defaultPrevented) { touch = null; pullPx = 0; return; }
    const dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
    if (!touch.axis && Math.hypot(dx, dy) > 10) touch.axis = Math.abs(dx) > Math.abs(dy) * 1.4 && dx < 0 ? 'x' : 'y';
    if (touch.axis === 'x') pullPx = Math.min(0, dx);
  }
  function pullEnd(e: TouchEvent) {
    if (!touch) return;
    const far = pullPx < -Math.min(90, (e.currentTarget as HTMLElement).offsetWidth * 0.25);
    touch = null;
    if (far) { swipedAway = true; setTimeout(() => (open = false), 180); }
    pullPx = 0;
  }
  const drawerStyle = $derived(
    swipedAway ? 'transform: translateX(-100%); transition: transform 0.18s ease-out'
    : pullPx ? `transform: translateX(${pullPx}px); transition: none` : undefined);

  const syncLabel = $derived(sync.enabled ? (sync.status === 'error' ? 'sync error' : sync.status === 'syncing' ? 'syncing…' : sync.settings.lastSynced ? 'synced' : 'not synced yet') : 'local only');
  const GEAR = '<svg class="gear-i" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

  async function openCalendar() {
    notes.currentId = CALENDAR;
    if (isMobile) { open = false; return; }
    await tick();
    document.querySelector<HTMLElement>('.calendar .day.cursor')?.focus();
  }
  const onCalendar = $derived(notes.currentId === CALENDAR || !!(notes.current && (isDailyId(notes.current.id) || notes.current.id === DAILY_TEMPLATE_ID)));
  async function openNote(n: Note) {
    if (n.id === CALENDAR_NOTE_ID) return openCalendar();
    const list = tree.ordered(), from = list.findIndex((x) => x.id === notes.currentId), to = list.findIndex((x) => x.id === n.id);
    if (from >= 0 && to === from + 1) hints.action('nextNote', 'The next note is a key away');
    else if (from >= 0 && to === from - 1) hints.action('prevNote', 'The previous note is a key away');
    ui.focusOwner = 'editor';
    notes.currentId = n.id;
    moves.openedFromList.id = n.id;
    if (isMobile) { open = false; return; }
    await tick();
    focusNote();
  }
</script>

{#if open}
{#snippet updateButton()}
  <button class="icon tip-up gear upd" class:failed={updates.state === 'error'}
    aria-label={updates.doing || `Update to Eve ${updates.available?.version}`}
    data-tip={updates.doing || `Update to Eve ${updates.available?.version}`} disabled={updates.busy} onclick={() => updates.install()}>
    {#if updates.busy}<span class="uspin" aria-hidden="true"></span>
    {:else}<svg class="gear-i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5"/></svg>{/if}
  </button>
{/snippet}
  <aside transition:drawer style={drawerStyle}
    ontouchstart={pullStart} ontouchmove={pullMove} ontouchend={pullEnd} ontouchcancel={pullEnd}>
    {#if isMobile}
      <div class="mtop">
        <h1 class="mtitle">Eve</h1>
        <span class="sync {sync.status}">{syncLabel}</span>
        {#if updates.available}{@render updateButton()}{/if}
        <button class="icon gear" aria-label="Settings" onclick={onSettings}>{@html GEAR}</button>
      </div>
    {/if}
    <div class="top" data-tauri-drag-region>
      <span class="search">
        <input bind:this={searchEl} bind:value={ui.search} onkeydown={onSearchKey} onfocus={() => (searchHasKeyboard = true)} onblur={() => (searchHasKeyboard = false)}
          onmousedown={() => { if (document.activeElement !== searchEl) hints.action('search', 'Search from anywhere'); }}
          placeholder={isMobile ? 'Search' : `Search  ${prettyKeys(shortcuts.keysFor('search'))}`} spellcheck="false" />
        {#if ui.search}
          <button class="clear" tabindex="-1" aria-label="Clear search" onmousedown={(e) => e.preventDefault()}
            onclick={() => { ui.search = ''; if (!isMobile) searchEl?.focus(); }}>
            <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>
          </button>
        {/if}
      </span>
    </div>

    <ul class="tree" role="tree" use:showOpen onkeydown={treeKey} use:touchReorder={reorder}
      onmousedown={(e) => { if (!(e.target as Element).closest('button, input, a, [tabindex]')) e.preventDefault(); }}
      oncontextmenu={(e) => { if (isMobile) e.preventDefault(); else rowMenu(e); }}
      ondragover={overEnd} ondrop={drop}>
      {#each rows as r (r.key)}
        <li animate:flip={{ duration: 220, easing: cubicOut }} in:fade={{ duration: 140 }} out:slide={{ duration: 180, easing: cubicOut }}
          class="row {r.kind}" style="--d: {'depth' in r ? r.depth : 0}"
          class:drop-before={r.kind === 'note' && dropAt?.beforeNote === r.n.id}
          class:drop-after={r.kind === 'note' && dropAt?.afterNote === r.n.id}
          class:dragging={r.kind === 'note' && drag?.note === r.n.id}>

          {#if r.kind === 'note'}
            {@const n = r.n}
            {@const swipe = n.id === CALENDAR_NOTE_ID ? {} : { left: () => removeNote(n), enabled: () => !drag }}
            <div class="note-row" class:collapsed={tree.isFolded(n.id)} draggable={!isMobile && !q} ondragstart={(e) => dragStartNote(e, n)} ondragend={dragEnd}
              ondragover={(e) => overNote(e, n)} ondrop={drop} role="presentation" use:swipeRow={swipe}>
              <button data-row data-note={n.id} class:active={n.id === CALENDAR_NOTE_ID ? onCalendar : n.id === notes.currentId}
                class:enter={searchHasKeyboard && !!q && n.id === hits[0]?.id} onclick={(e) => rowClick(e, n)}>
                <span class="title">
                  <span class="ico-slot" tabindex="-1" data-tip="Change icon">
                    {#if jumpNumbers.has(n.id)}<span class="num">{jumpNumbers.get(n.id)}</span>
                    {:else if n.icon}<Icon icon={n.icon} />{:else}
                    <svg class="ico" viewBox="0 0 16 16"><path d="M4 1.5h5l3.5 3.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h5"/></svg>{/if}
                  </span>
                  <span class="t">{titleOf(n)}</span>
                  {#if isMobile && n.id !== CALENDAR_NOTE_ID}<span class="when">{editedLabel(n.updatedAt)}</span>{/if}
                </span>
                {#if isMobile && n.id !== CALENDAR_NOTE_ID}
                  {@const p = previewOf(n.body)}
                  {#if p}<span class="preview">{p}</span>{/if}
                {/if}
              </button>
              {#if n.id !== CALENDAR_NOTE_ID}
              <span class="tools">
                <button class="icon mini tip-right" aria-label="Delete note" data-tip="Delete note" onclick={() => removeNote(n)}>×</button>
              </span>
              {/if}
              {#if r.kids}
                <button class="icon mini fold tip-right" aria-label={tree.isFolded(n.id) ? 'Expand' : 'Collapse'}
                  data-tip={tree.isFolded(n.id) ? 'Expand' : 'Collapse'} onclick={() => tree.fold(n.id)}>
                  <svg class="chev" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              {/if}
              {#if isMobile && n.id !== CALENDAR_NOTE_ID}
                <span class="swipe-act del" aria-hidden="true">Delete</span>
              {/if}
            </div>

          {:else}
            <div class="empty" role="presentation">{r.text}</div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if isMobile && onNew}
      <button class="fab" aria-label="New note" onclick={onNew}><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg></button>
    {/if}
    {#if !isMobile}
    <footer>
      <span class="sync {sync.status}" title={sync.error || (sync.enabled ? 'Synced' : 'Sync off')}>
        {syncLabel}
      </span>
      {#if updates.available}{@render updateButton()}{/if}
      <button class="icon tip-up trash" aria-label="Trash" data-tip="Trash" onclick={() => ui.openTrash()}>
        <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9M6.6 6.8v4.4M9.4 6.8v4.4"/></svg>
      </button>
      <button class="icon tip-up gear" aria-label="Settings" data-tip="Settings" data-keys={shortcuts.keysFor('settings')} onclick={onSettings}>
        {@html GEAR}
      </button>
    </footer>
    {/if}
  </aside>
{/if}

<style>
  aside {
    position: relative;
    width: 260px; flex: none; display: flex; flex-direction: column;
    background: var(--bg-side); border-right: 1px solid var(--line); overflow: hidden;
  }
  .top { display: flex; gap: 4px; padding: 50px 16px 8px; }
  .search { flex: 1; min-width: 0; position: relative; display: flex; }
  .top input {
    flex: 1; min-width: 0; border: 0; border-radius: 6px; padding: 6px 8px;
    background: var(--bg-input); color: inherit; font: inherit; font-size: 13px; outline: none; transition: box-shadow 0.15s;
  }
  .top input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }
  .top input:has(+ .clear) { padding-right: 26px; }
  .clear {
    position: absolute; right: 2px; top: 50%; translate: 0 -50%; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px;
    display: inline-flex; align-items: center; justify-content: center; background: none; color: var(--fg-dim);
  }
  .clear:hover { background: var(--bg-hover); color: var(--fg); }
  .clear svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  :global(html.mobile) .clear { right: 0; width: 44px; height: 44px; }
  :global(html.mobile) .clear svg { width: 15px; height: 15px; }
  :global(html.mobile) .top input:has(+ .clear) { padding-right: 44px; }

  .tree { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 10px 8px; margin: 0; list-style: none; }
  .row { position: relative; padding-left: calc(var(--d) * 18px); border-radius: 6px; transition: opacity 0.15s, background 0.15s, box-shadow 0.15s; }
  .row.dragging { opacity: 0.4; }
  .ico { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.75; }
  .ico-slot { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: 4px; transition: background 0.12s; }
  .ico-slot:hover { background: var(--bg-active); }
  .num {
    width: 16px; height: 16px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-text);
    background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    animation: num-in 0.25s ease-out;
  }
  @keyframes num-in { from { opacity: 0; } }

  .tools { display: flex; gap: 2px; width: 0; opacity: 0; overflow: hidden; transform: translateX(6px);
    transition: width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.16s, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
  :global(html[data-hover]) .note-row:hover .tools, .note-row .tools:focus-within { width: 22px; opacity: 1; transform: none; }
  .tools .icon.mini, .fold { width: 22px; height: 22px; font-size: 14px; flex: none; }
  .fold { margin-left: 2px; }
  .fold { display: inline-flex; align-items: center; justify-content: center; }
  .chev { display: block; width: 14px; height: 14px; fill: none; stroke: var(--fg-dim); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1); transform: rotate(90deg); }
  .collapsed .chev { transform: rotate(0deg); }

  .empty { padding: 5px 10px; font-size: 11.5px; color: var(--fg-dim); opacity: 0.7; }

  .row.drop-before::before, .row.drop-after::after {
    content: ''; position: absolute; left: calc(var(--d) * 18px); right: 8px; top: -1px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none; z-index: var(--z-raised);
  }
  .row.drop-after::after { top: auto; bottom: -1px; }
  .note-row { display: flex; align-items: center; border-radius: 6px; transition: background 0.12s; }
  .note-row > button:first-child {
    flex: 1; min-width: 0; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 5px 6px; border-radius: 6px; display: flex; flex-direction: column;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  :global(html[data-hover]) .note-row:hover { background: var(--bg-hover); }
  .note-row > button:first-child:active { transform: scale(0.985); }
  .note-row:has(> button.active) { background: var(--bg-active); }
  .note-row > button.enter { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .note-row > button.active.enter { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .note-row > [data-row]:focus {
    outline: none; transition: none; background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .note-row > button.active:focus { transition: none; background: color-mix(in srgb, var(--accent) 24%, var(--bg-active)); }
  .title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
  .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .gear, .trash { width: 28px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .trash { margin-left: auto; }
  .trash svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .gear svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  .upd { margin-left: auto; color: var(--accent-text); }
  .upd.failed { color: #ff453a; }
  :global(.gear-i) { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px 8px 18px; font-size: 11.5px; color: var(--fg-dim); border-top: 1px solid var(--line);
  }
  .sync::before {
    content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px;
    background: var(--fg-dim); transition: background 0.3s;
  }
  .sync.ok::before { background: var(--accent); box-shadow: var(--glow); }
  .sync.error::before { background: #ff453a; }
  .sync.syncing::before { background: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .uspin {
    display: inline-block; width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid var(--accent-soft); border-top-color: var(--accent); animation: uspin 0.7s linear infinite;
  }
  @keyframes uspin { to { transform: rotate(360deg); } }
</style>
