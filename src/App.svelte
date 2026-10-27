<script lang="ts">
  import { untrack } from 'svelte';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes, CALENDAR, stepFrom } from './lib/notes.svelte';
  import { isDailyId, DAILY_TEMPLATE_ID } from './lib/daily';
  import { startReminder, syncPhoneReminder } from './lib/reminder';
  import CalendarPage from './CalendarPage.svelte';
  import { shortcuts, prettyKeys, eventToKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { groups, leafOf, parentOf } from './lib/groups.svelte';
  import { appearance } from './lib/appearance.svelte';
  appearance.apply();
  import { setGlobalHotkey, win, files, autostart, dock, isTauri, isMobile, onWindowFocus, onBack, widget, links, inbox, saveAsset } from './lib/platform';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Confirm from './Confirm.svelte';
  import MobileBar from './MobileBar.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import Hint from './Hint.svelte';
  import { hints } from './lib/hints.svelte';
  import { updates } from './lib/updates.svelte';
  import Tooltip from './Tooltip.svelte';
  import Menu from './Menu.svelte';
  import Toast from './Toast.svelte';
  import { ui, hooks } from './lib/ui.svelte';
  import { droppedFiles, isAsset } from './lib/drop';
  import { importTree } from './lib/importTree';
  import { importPaths, exportCurrent } from './lib/transfer';
  import { titleOf } from './lib/notes.svelte';
  import { tabs } from './lib/tabs.svelte';
  import TabBar from './TabBar.svelte';
  import { parseTicket } from './lib/handoff';
  import { parseEveLink } from './lib/evelink';
  import { applyAll } from './lib/inbox';
  import { focusNote } from './lib/popup';
  import { cameBack } from './lib/comeBack';
  import { flushEdits } from './lib/pending';
  import { claimKeys, handledBy, PRIORITY } from './lib/keys';

  let sidebarOpen = $state(true);
  // where the note's pane starts across the window, for what sits in its middle (a toast, a hint)
  $effect(() => { document.documentElement.style.setProperty('--pane-left', !isMobile && sidebarOpen ? '260px' : '0px'); });
  let settingsOpen = $state(false);
  // a layer like any other while it is open (ui.layers): back and Esc reach it in its turn, and it puts the keyboard back
  $effect(() => { if (settingsOpen) return ui.openedSettings(() => (settingsOpen = false)); });
  let searchEl = $state<HTMLInputElement | null>(null);
  let hotkeyError = $state<string | null>(null);
  // hold ⌘: sidebar notes show 1…9, ⌘<digit> opens that note
  let cmdHeld = $state(false);
  let cmdTimer: ReturnType<typeof setTimeout> | undefined;
  function cmdDown() { clearTimeout(cmdTimer); cmdTimer = setTimeout(() => (cmdHeld = true), 550); }
  function cmdUp() { clearTimeout(cmdTimer); cmdHeld = false; }
  function jumpTo(n: number) {
    const note = groups.visibleOrdered()[n - 1];
    if (!note) return;
    ui.focusOwner = 'editor';
    ui.search = ''; // the numbers are the whole list's (they are not shown on matches): the search is left behind
    notes.currentId = note.id;
    queueMicrotask(focusNote);
  }

  // global hotkey follows the shortcut store live
  $effect(() => {
    const keys = shortcuts.keysFor('toggleWindow');
    setGlobalHotkey(keys).then((err) => (hotkeyError = err));
  });

  // Android back: a popup or a dialog closes, a note goes back to the list, and only the list leaves the app
  $effect(() => {
    if (!isMobile || !isTauri || (sidebarOpen && !ui.layers.count && !ui.search)) return; // a filtered list: back clears it
    let off: (() => void) | undefined, gone = false;
    onBack(phoneBack)
      .then((u) => (gone ? u() : (off = u)));
    return () => { gone = true; off?.(); };
  });

  if (import.meta.env.DEV) Object.assign(window as any, { __notes: notes, __sync: sync });
  onMount(() => {
    // first run: launch at login so the summon hotkey is always available (toggle in Settings)
    if (isTauri && !localStorage.getItem('eve.autostart.init')) {
      autostart.set(true).finally(() => localStorage.setItem('eve.autostart.init', '1'));
    }
    if (dock.hidden) dock.set(true);
    // a file opened from Finder joins the notes like any import — it is a note from then on, movable
    // in the sidebar and synced (the file on disk is left as it was)
    notes.load().then(() => {
      // a phone opens where it was left: the note, not the list over it (the list is a swipe or Back away)
      if (isMobile && notes.resumed) sidebarOpen = false;
      void files.onOpen(async (paths) => {
        const first = await importPaths(paths);
        if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; }
      });
      // eve://open?id=… (`eve open`, Claude's open_note): that note, at its heading when one is named.
      // Showing is all a link may do: an unknown id is ignored, nothing is made
      void links.onOpen((url) => {
        const link = parseEveLink(url);
        if (!link || !notes.all.some((n) => n.id === link.id && !n.deleted)) return;
        putAway(); // whatever was open over the app (a full-screen diagram, a card) would sit over the note
        ui.focusOwner = 'editor';
        if (notes.currentId === link.id) {
          if (link.section) hooks.section?.(link.section);
          return;
        }
        notes.section = link.section;
        notes.currentId = link.id;
      });
      // what Claude writes through the MCP server: done through the store, as typed (inbox.ts)
      void inbox.onAsk(applyAll);
      widget.onOpen((ask) => {
        // the phone-setup page: take the sign-in the Mac's QR points at
        const ticket = parseTicket(ask);
        if (ticket) { settingsOpen = true; void sync.claim(ticket).then(offerUpdate); return; }
        // the reminder's notification: today's note
        if (ask === 'daily') { writeToday(); return; }
        // a Markdown file opened with Eve or shared to it: MainActivity copied it (Opened.kt), and it joins the
        // notes as a file from Finder does on the Mac
        if (ask.startsWith('open:')) {
          void importPaths(ask.slice(5).split('\n')).then((first) => {
            if (!first) return;
            putAway();
            ui.focusOwner = 'editor';
            notes.currentId = first.id;
            sidebarOpen = false;
          });
          return;
        }
        // the home-screen widget: straight into that note (or a new one), keyboard up
        const id = ask.startsWith('note:') ? ask.slice(5) : null;
        if (ask !== 'new' && !id) return;
        putAway();
        // a widget may still show a note deleted since (on the Mac, then synced): opened, it took what was
        // typed into a note no list shows. The list instead.
        if (id && !notes.all.some((n) => n.id === id && !n.deleted)) { sidebarOpen = true; return; }
        ui.focusOwner = 'editor';
        if (id) notes.currentId = id; else newNote();
        sidebarOpen = false;
        widget.keyboard();
      });
    });
    window.addEventListener('eve-summon', onSummon);
    // coming back by click, ⌘Tab or the Dock fires no DOM 'focus' when the webview never let go of it
    let unfocus: (() => void) | undefined;
    // (not over a click that brought it back: that click puts the caret, cameBack)
    onWindowFocus(() => { redrawPanes(); cameBack(restoreFocus); }).then((u) => (unfocus = u));
    const stopSync = sync.start();
    const stopReminder = startReminder();
    updates.start();
    return () => { window.removeEventListener('eve-summon', onSummon); unfocus?.(); clearTimeout(hintTimer); stopSync?.(); stopReminder?.(); };
  });

  /**
   * Leaving the window mid-syllable (⌘Tab, a click in another app): take the focus out of the note, so
   * WebKit itself confirms the Hangul syllable and ProseMirror hears a real compositionend. A faked
   * compositionend (what this used to do) told ProseMirror the syllable was done while the input method
   * still had it open; ProseMirror then redrew the text under it, and the first syllable typed after
   * coming back fell apart into jamo (ㅈㅣ정가).
   */
  let away: HTMLElement | null = null;
  function leaveWindow() {
    const a = document.activeElement as HTMLElement | null;
    if (!a?.closest('.tiptap')) return;
    away = a.closest<HTMLElement>('.tiptap');
    away?.blur();
  }

  /**
   * The syllable is confirmed, but WebKit can leave its marked-text underline painted under it. Drawing
   * the line that had the caret afresh (new text nodes) takes the stale underline with the old ones.
   * Only while nothing is being composed: the caret has not come back yet.
   */
  type View = { focus(): void; state: any; updateState(s: any): void; docView: { markDirty(from: number, to: number): void } };
  function redrawCaretLine(view: View) {
    const at = view.state.selection.$from;
    if (!at.parent.isTextblock || at.depth < 1) return;
    view.docView.markDirty(at.before(), at.after()); // the whole line, so it is built anew
    view.updateState(view.state);
  }

  /**
   * Summoned back (⌘⇧E, Dock, ⌘Tab): the note that had the caret gets it back, where it was; with
   * nothing to go back to, the caret goes to the note. Anything already holding focus is left strictly
   * alone — this runs again on the window's own focus event, which can land a beat *after* the first
   * keystroke, and re-focusing an element mid-composition is what splits a syllable into jamo.
   */
  function restoreFocus() {
    const back = away;
    away = null;
    if (ui.layers.modal) return; // a dialog owns focus
    const a = document.activeElement as HTMLElement | null;
    if (a && a.isConnected && a !== document.body) return;
    const el = back?.isConnected ? back : document.querySelector<HTMLElement>(ui.card ? '.card-page .tiptap' : '.tiptap');
    // the view's own focus puts its selection back in the same step, not 20 ms later under a keystroke
    const view = (el as { editor?: { view: View } } | null)?.editor?.view;
    if (view && back) redrawCaretLine(view);
    if (view) view.focus(); else el?.focus();
  }

  /** The window called up by the hotkey: the caret back, and in sight, ready to write. */
  function onSummon() {
    redrawPanes();
    restoreFocus();
    hooks.caretIntoView?.();
  }
  /**
   * The note's pane drawn again as the window comes back. WebKit at times shows a window brought back from hidden with
   * what scrolls in it undrawn: the crumbs over it there, the note a white page under them, until something made it
   * draw (a scroll, a click). The note's page (and the list) is given a layer of its own for a frame, and drawn anew;
   * not a page with a diagram on the whole screen, which a transform around it would shrink to the page's size.
   */
  function redrawPanes() {
    const panes = [...document.querySelectorAll<HTMLElement>('main .tiptap, .card-page .tiptap, aside')].filter((el) => !el.querySelector('.dblock.full'));
    for (const el of panes) el.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const el of panes) el.style.transform = ''; }));
  }

  function step(delta: number) {
    const next = stepFrom(groups.ordered(), notes.currentId, delta);
    if (next) notes.currentId = next.id;
  }

  /**
   * A phone: a swipe to the right on a note brings the list back in. Not when the finger is choosing
   * text: a long press that starts a selection, a drag of its handles, or any gesture that leaves text
   * selected is the system's, and the list stays away.
   */
  let swipe: { x: number; y: number; at: number } | null = null;
  function swipeStart(e: TouchEvent) {
    swipe = null;
    // a diagram on the whole screen pans with the finger, and Find's bar would stay over the list
    // nor while something is up over the note (a formula being typed: swiped, it stayed open, hidden, taking keys)
    if (!isMobile || sidebarOpen || settingsOpen || ui.card || ui.diagramView !== null || ui.find || ui.layers.count || hooks.diagramBack || e.touches.length !== 1) return;
    // things that scroll sideways themselves keep the gesture: a wide diagram or equation scrolled back to its start
    // brought the list in instead
    const t = e.target as HTMLElement;
    if (t.closest('pre, table, .kanban, .mbar, .mhead, input, textarea, .menu, .suggest, .cal, .dblock, .diagram-canvas, .math-block')) return;
    for (let el: HTMLElement | null = t; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return;
    }
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
  }
  function swipeEnd(e: TouchEvent) {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    const held = Date.now() - swipe.at;
    swipe = null;
    // a swipe is quick: a finger held first is a long press choosing text, and text selected when it
    // lifts means the drag was choosing it (or pulling a handle)
    if (held > 600 || !getSelection()?.isCollapsed) return;
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) toList();
  }
  /** A phone's way back to the list (a swipe, back): the keyboard goes with the note, and a new note left unwritten
   *  goes too (+, then a swipe left an "Untitled" row behind; back did not) */
  function toList() {
    // the native back key leaves the focus where it was: the note kept its caret behind the list, and with it the
    // "/" menu and a table's tools, drawn over the list. They go when the note lets go of the keyboard
    (document.activeElement as HTMLElement | null)?.blur();
    notes.letGo(); // a new note left unwritten is no row in the list to come back to
    sidebarOpen = true;
  }

  /** A phone's note bar: ⋯ (find & replace, select all, export to the share sheet), a widget of this note on the home screen, delete. */
  function moreMenu(from: HTMLElement) {
    const r = from.getBoundingClientRect();
    ui.openMenu({ clientX: r.right, clientY: r.bottom }, [
      { label: 'Full width', checked: !!notes.current?.wide, hide: isMobile, run: () => { const n = notes.current; if (n) notes.setWide(n.id, !n.wide); } },
      { label: 'Small text', checked: !!notes.current?.small, run: () => { const n = notes.current; if (n) notes.setLook(n.id, { small: !n.small || undefined }); } },
      { label: 'Find & replace', sep: !isMobile, run: () => ui.openFind() },
      { label: 'Select all', run: () => hooks.command?.('selectAll') },
      { label: 'Export as Markdown (.md)', sep: true, run: () => void exportCurrent('md') },
      { label: 'Export as PDF', run: () => void exportCurrent('pdf') },
      { label: 'Export as image (.png)', run: () => void exportCurrent('png') },
      { label: 'Version history…', sep: true, hide: !notes.current, run: () => { const n = notes.current; if (n) { notes.flush(n.id); ui.openHistory(n.id); } } },
      { label: 'Trash…', run: () => ui.openTrash() },
    ]);
  }
  /** Opened from the Mac's QR: a newer Eve is asked about there and then, not left to a banner. */
  async function offerUpdate() {
    await updates.check(true);
    const v = updates.available?.version;
    if (v && (await ui.ask(`Eve ${v} is ready. Update now?`, false, 'Update'))) updates.install();
  }

  /** notes pinned to the top of the home-screen widget (the pin in the note's bar shows it) */
  let widgetTop = $state(widget.top());
  function pinToHome() {
    const n = notes.current;
    if (n && !widget.pin(n.id)) void ui.tell('This home screen can\u2019t add a widget from an app. Long-press the home screen → Widgets → Eve; pinned notes sit at the top of its list.');
    widgetTop = widget.top();
  }
  async function deleteOnPhone() {
    const n = notes.current;
    if (!n || !(await ui.ask(`Delete “${titleOf(n)}”?`))) return;
    notes.remove(n.id);
    sidebarOpen = true; // back to the list, not into whichever note came next
  }

  /** A new note: a search still narrowing the list would leave its row out of it, so the search goes. */
  function newNote() {
    ui.search = '';
    notes.create();
  }
  /** A phone's +: a new note, open, keyboard up — or, with daily notes on, the choice of that or today's. */
  function newOnPhone() {
    const write = (open: () => void) => () => { ui.focusOwner = 'editor'; open(); sidebarOpen = false; widget.keyboard(); };
    // a group too: a phone has no row menu or "+" beside a group to make one with, so it could not make any
    ui.openMenu({ clientX: 0, clientY: 0 }, [
      { label: 'New note', run: write(newNote) },
      { label: 'New group', run: () => groups.create('') },
      { label: "Today's daily note", run: writeToday, hide: !appearance.s.dailyNotes },
    ]);
  }
  /** Whatever was left open over the app (a picture, a picker, a menu, a dialog, a card, a PDF, Find, Settings),
   *  put away before a note is brought to the front from outside (the reminder, the widget), or it sat over it. */
  function putAway() {
    ui.layers.closeAll('putAway'); // a formula being typed too, and a phone's math keyboard with it
  }
  /** Today's note, to write in: caret under the template, keyboard up on a phone. */
  function writeToday() {
    putAway();
    ui.focusOwner = 'editor';
    notes.caretEnd = true;
    notes.openDaily();
    sidebarOpen = false;
    widget.keyboard();
  }
  /** The daily template, from the calendar: a floating page over it, like a board's card template. */
  function openTemplate() {
    const n = notes.templateNote();
    void ui.openPage(n.body, (md) => notes.update(n.id, md),
      'Template — every new day starts like this. {{date}} and {{weekday}} are filled in.', () => n.id).then(() => notes.flush(n.id));
  }
  /** A day picked in the calendar: its note, floating over the calendar like a board's card. */
  function openDay(key: string) {
    const day = notes.dayDraft(key); // made only once something is written in it
    void ui.openPage(day.body, (md) => day.write(md), undefined, () => day.note?.id ?? null).then(() => { if (day.note) notes.flush(day.note.id); });
  }
  /**
   * Where is the keyboard? The pane it just moved to (the list ↔ the note) flashes blue once. Only on a
   * move between panes made from the keyboard: typing in a note, or its caret coming back to the same
   * pane, tells the user nothing they don't know. Never on a phone (its on-screen keys count as keys).
   * Nor into a text box (⌘K's search, a group being renamed): its own focus ring already says where the keys go.
   */
  let lastPane: Element | null = null;
  function flashPane(e: FocusEvent) {
    const pane = (e.target as HTMLElement | null)?.closest?.('aside, main');
    if (!pane || pane === lastPane) return;
    const moved = lastPane !== null;
    lastPane = pane;
    if (!moved || isMobile || document.documentElement.dataset.input !== 'keyboard') return;
    if ((e.target as HTMLElement).matches('input, textarea')) return;
    pane.classList.remove('focus-flash');
    void (pane as HTMLElement).offsetWidth; // restart the animation
    pane.classList.add('focus-flash');
    setTimeout(() => pane.classList.remove('focus-flash'), 300);
  }

  /** A phone's back (the bar's chevron, or Android's): a day goes back to its calendar, anything else to the list. */
  function phoneBack() {
    // what is on top closes first, one at a time: whatever opened last (a picture over a card, a setting's choices over
    // Settings, a dialog over a sheet). A formula being typed is one too: back finishes it, and its keyboard goes with it
    if (ui.layers.closeTop('back')) return;
    else if (hooks.diagramBack) hooks.diagramBack(); // a diagram being edited: a step out of it, not out of the note
    else if (sidebarOpen && ui.search) ui.search = ''; // the list cut down to a search: back shows all of it, before leaving
    else if (notes.current && (isDailyId(notes.current.id) || notes.current.id === DAILY_TEMPLATE_ID) && appearance.s.dailyNotes) notes.currentId = CALENDAR;
    else toList();
  }
  // another note brought up (a link, the widget, a reminder, ⌘1–9, ⌘N, back/forward): a diagram shown full
  // screen was the last one's, and so was a board's card or a day floating over it. A card left up wrote into
  // a board no longer on screen: what was typed in it was lost, with an error at every key. Its last keys
  // were handed over before the switch (notes.currentId flushes them), so closing it loses nothing.
  $effect(() => { void notes.currentId; untrack(() => { ui.closeDiagramView(); ui.closeCard(); }); });
  // the front tab shows whatever note is opened, however it was; a tab whose note went (deleted, or a blank one left)
  // closes (tabs.svelte.ts). The list read too, so a deletion is seen when the open note stays the same.
  let lastOpen: string | null = null;
  $effect(() => {
    const cur = notes.currentId;
    void notes.visible;
    if (isMobile || !notes.loaded) return;
    untrack(() => tabs.follow(lastOpen));
    lastOpen = cur;
  });
  // daily notes on: the calendar's row exists (opening it shows the calendar: notes.currentId)
  $effect(() => { if (appearance.s.dailyNotes && notes.loaded) notes.ensureCalendar(); });
  // the phone's reminder alarm follows the settings
  $effect(() => { if (isMobile) syncPhoneReminder(); });
  $effect(() => { if (isMobile) widget.daily(appearance.s.dailyNotes && appearance.s.dailyInWidget); });
  // daily notes switched off while the calendar was up: back to a note
  $effect(() => { if (!appearance.s.dailyNotes && notes.currentId === CALENDAR) notes.currentId = notes.firstPage()?.id ?? null; });

  /** ⌘\\: closed -> open + focus list; focus already in list -> close + back to editor; else focus list. */
  function focusSidebar() {
    if (sidebarOpen && document.activeElement?.closest('aside')) {
      sidebarOpen = false;
      queueMicrotask(focusNote);
      return;
    }
    sidebarOpen = true;
    queueMicrotask(() => (document.querySelector<HTMLElement>('aside [data-row].active') ?? foldedOver() ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus());
  }
  /** the open note's row is folded away: the row it is folded under (a parent page, else its innermost group showing) */
  function foldedOver() {
    const row = (sel: string) => document.querySelector<HTMLElement>(`aside ${sel}`);
    for (let n = notes.current; n?.parent; n = notes.all.find((m) => m.id === n!.parent) ?? null) {
      const up = row(`[data-note="${CSS.escape(n.parent)}"]`);
      if (up) return up;
    }
    for (let g = notes.current?.group ?? ''; g; g = parentOf(g)) {
      const up = row(`[data-group="${CSS.escape(g)}"]`);
      if (up) return up;
    }
    return null;
  }
  async function deleteCurrent() {
    const n = notes.current;
    if (!n) return;
    if (!(await ui.ask(`Delete “${titleOf(n)}”?`))) return;
    notes.remove(n.id);
  }
  // Arrows are not on this list: moving the caret is reading, not writing, and folding the list away
  // under an arrow key takes the highlighted row off the screen just when it is being used to navigate.
  const EDIT_KEYS = /^(Backspace|Delete|Enter|Tab)/;
  /** a keystroke that writes in the editor (not a shortcut, not the sidebar's own keys) */
  function isWriting(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!(document.activeElement as HTMLElement | null)?.closest('.tiptap')) return false;
    return e.key.length === 1 || EDIT_KEYS.test(e.key);
  }

  /**
   * A file dragged in from Finder. Every file becomes a note of its own, at the end of the group, and
   * leaves a mark in the note that was open: a text file links to the note it made, an attachment
   * (picture, PDF) shows up as itself. A whole folder can be dropped too — it comes in with its shape
   * (importTree.ts: folders as groups, a page's folder as its sub-pages, its pictures in its notes, a Keep
   * export as Keep notes) and keeps to itself instead of writing into the open note. Dropped on the list,
   * it goes where it was let go: on a group, into it; on a note, beside it; elsewhere on the list, at the top.
   * Either way the webview never gets the drop: its own pastes DOM into the editor, which then takes no
   * keystroke at all.
   */
  /** the note's text size, said for a moment after ⌘+ / ⌘- / ⌘0 */
  let sizeShown = $state<number | null>(null);
  let sizeTimer: ReturnType<typeof setTimeout> | undefined;
  function showSize(px: number) {
    sizeShown = px;
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => (sizeShown = null), 900);
  }
  let dropHint = $state<string | null>(null);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let dropRow: HTMLElement | null = null; // the list's row a drop would go into, marked while it is over it
  function markRow(el: HTMLElement | null) {
    if (el === dropRow) return;
    dropRow?.classList.remove('file-over');
    el?.classList.add('file-over');
    dropRow = el;
  }
  /** where on the list a drop is: a group ('' = the top), or null when it is not over the list */
  function listTarget(target: EventTarget | null): { group: string; row: HTMLElement | null } | null {
    const el = target as HTMLElement | null;
    if (!el?.closest?.('aside')) return null;
    const g = el.closest<HTMLElement>('[data-group]');
    if (g) return { group: g.dataset.group!, row: g.closest('.ghead') };
    const n = el.closest<HTMLElement>('[data-note]');
    const note = n && notes.all.find((x) => x.id === n.dataset.note);
    if (note) return { group: note.group, row: n };
    return { group: '', row: null };
  }
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); // otherwise no drop event follows
    // an attachment joins the note, a text file becomes one — and only the type is knowable in flight
    // (a folder shows as a file of no type)
    const items = [...e.dataTransfer.items];
    const asset = items.length > 0 && items.every((i) => i.kind === 'file' && (i.type.startsWith('image/') || i.type === 'application/pdf'));
    const folder = items.some((i) => i.kind === 'file' && !i.type);
    const on = listTarget(e.target);
    markRow(on?.row ?? null);
    dropHint = on ? (on.group ? `Import into “${leafOf(on.group)}”` : 'Import into the list')
      : folder ? 'Import the folder' : asset ? 'Attach to this note' : 'Open as a new note';
    // a drag leaving the window fires nothing dependable, so the hint simply stops being refreshed
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { dropHint = null; markRow(null); }, 160);
  }
  async function onDrop(e: DragEvent) {
    clearTimeout(hintTimer);
    dropHint = null;
    markRow(null);
    if (!e.dataTransfer?.types.includes('Files')) return;
    const taken = e.defaultPrevented; // dropped into a note: the editor has that attachment already
    e.preventDefault();
    const on = listTarget(e.target);
    // a picture or a PDF the editor took is in the note already; made a note of its own as well, every
    // file came back as an extra note in the list and was saved twice. A text file still becomes a note.
    const dropped = (await droppedFiles(e.dataTransfer)).filter(({ file, dir }) => !taken || dir || !isAsset(file));
    const made = await importTree(dropped.map(({ file, dir }) => ({
      path: dir ? `${dir}/${file.name}` : file.name,
      text: () => file.text(),
      asset: () => saveAsset(file),
    })), on?.group ?? '', on?.group ?? notes.current?.group ?? '');
    if (made.length) ui.focusOwner = 'editor';
    if (on) return; // put on the list: nothing written into the open note
    for (const { note, source, embed } of made) {
      if (source.path.includes('/')) continue; // a folder brings its own tree; it does not write into the open note
      if (!embed) hooks.attach?.(`[[${titleOf(note)}]]`);
      else if (!taken) hooks.attach?.(embed);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // ⌘ alone peeks at the numbers; ⌘ with anything else is a shortcut, so the icons come straight back
    // (including a modifier already held when ⌘ goes down — ⇧⌘ waiting for its third key is not a peek)
    if (e.key === 'Meta' && !e.shiftKey && !e.altKey && !e.ctrlKey) cmdDown();
    else cmdUp();
    // writing takes the window: the list folds away the moment you type inside the editor. Not in a floating page
    // (a card, a day): it is over the note, and the list behind it stays as it was
    if (sidebarOpen && appearance.s.closeSidebarOnWrite && !ui.card && isWriting(e)) sidebarOpen = false;
    // the right-click menu takes the keyboard while it is up, wherever the focus actually sits; so do a dialog, the
    // emoji picker and a diagram on the whole screen (they take their own Esc)
    if (ui.layers.grabbing) {
      if (e.key === 'Escape' && ui.layers.escape()) e.preventDefault();
      else if (ui.layers.trapTab(e)) { /* round its own controls */ }
      // Settings' own key closes it again, the one shortcut that reaches past it
      else if (settingsOpen && ui.layers.top?.id === 'settings' && shortcuts.match(e, ['app'])?.id === 'settings') { e.preventDefault(); settingsOpen = false; }
      return;
    }
    // Escape puts away what is open over the note, the newest first — the find bar, the PDF panel, a floating page (a
    // board's card, a day from the calendar) — and only a bare note lets it through to hide the window. Tied to the
    // key, not to the rebindable action: closing the thing on top is what Escape means everywhere in the app. A page
    // closes on its own Esc; one that gets here had the focus outside it (on the day behind it, say), and must still
    // close the page rather than hide the window. Not an Esc the note took (closing its / menu), nor one a popup
    // inside the page took: that keeps the page open.
    if (e.key === 'Escape' && handledBy(e) !== 'taken' && ui.layers.escape()) {
      e.preventDefault();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      jumpTo(Number(e.code[5]));
      return;
    }
    if (handledBy(e) === 'taken') return;
    // ⌘Z outside the note's text (the list): the last thing done to the notes or the groups taken back
    if (ui.undoKey(e)) { e.preventDefault(); return; }
    // ⌘+ is ⌘⇧= on most keyboards (and the keypad's +): the same as ⌘= unless it is bound to something itself
    // and ⌘K that linked nothing (no words chosen, or the list has the keys) is search, as in Notion
    const a = shortcuts.match(e, ['app']) ?? (e.key === '+' && (e.metaKey || e.ctrlKey) && !e.altKey ? shortcuts.actions.find((x) => x.id === 'textBigger') : undefined)
      ?? (shortcuts.keysFor('link') && eventToKeys(e) === shortcuts.keysFor('link') ? shortcuts.actions.find((x) => x.id === 'search') : undefined);
    if (!a) return;
    // Escape belongs to whatever is open on top of the note (the PDF panel closes on it, and lets the
    // window hide once it is gone)
    if (a.id === 'hide' && (settingsOpen || document.activeElement === searchEl)) return; // handled locally
    e.preventDefault();
    // the list behind a floating page: the page is put away first (as ⌘⇧↓ puts it away, opening another note), so
    // the list is not opened, folded or focused unseen behind it. Its last keys are handed over before it goes.
    if (ui.card && (a.id === 'search' || a.id === 'focusSidebar')) { flushEdits(); ui.closeCard(); }
    switch (a.id) {
      case 'newNote':
        // from the sidebar, ask what to create (note or group) via the + menu
        if (document.activeElement?.closest('aside')) hooks.openPlus?.();
        else { ui.focusOwner = 'editor'; newNote(); }
        break;
      case 'search': sidebarOpen = true; queueMicrotask(() => searchEl?.focus()); break;
      case 'find': // pressing it again puts the bar away and hands the note back the caret
        if (ui.find) ui.closeFind(); else ui.openFind();
        break;
      case 'focusSidebar': focusSidebar(); break;
      case 'back': notes.back(); break;
      case 'forward': notes.forward(); break;
      case 'parentPage': { // the page this one is under, as Notion's ⌘⇧U goes up one level
        const up = notes.current?.parent;
        if (up && notes.all.some((n) => n.id === up && !n.deleted)) notes.currentId = up;
        break;
      }
      case 'copyLink': { // a link that shows this note in Eve, from any app (eve open's, and the MCP server's)
        const n = notes.current;
        if (n) void navigator.clipboard?.writeText(`eve://open?id=${encodeURIComponent(n.id)}`).then(() => ui.toast(`Link to “${titleOf(n)}” copied`));
        break;
      }
      case 'theme': { // the other of what is shown now: a system theme becomes the one it is not
        const dark = appearance.s.theme === 'dark' || (appearance.s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
        appearance.set({ theme: dark ? 'light' : 'dark' });
        break;
      }
      case 'newTab': if (!isMobile) { ui.search = ''; const n = notes.create('', notes.current?.group ?? ''); tabs.open(n.id); ui.focusOwner = 'editor'; } break;
      // the last tab: put Eve away, as Esc does (not a pinned one among others: it stays, and so does the window)
      case 'closeTab': if (!isMobile && !tabs.close() && tabs.list.length <= 1) win.hide(); break;
      case 'reopenTab': if (!isMobile) tabs.reopen(); break;
      case 'nextTab': if (!isMobile) tabs.step(1); break;
      case 'prevTab': if (!isMobile) tabs.step(-1); break;
      case 'nextNote': step(1); break;
      case 'prevNote': step(-1); break;
      case 'deleteNote': deleteCurrent(); break;
      case 'exportMd': void exportCurrent('md'); break;
      case 'exportPdf': void exportCurrent('pdf'); break;
      case 'exportPng': void exportCurrent('png'); break;
      case 'settings': settingsOpen = !settingsOpen; break;
      case 'textBigger': showSize(appearance.textSize(1)); break;
      case 'textSmaller': showSize(appearance.textSize(-1)); break;
      case 'textReset': showSize(appearance.textSize(0)); break;
      case 'hide': win.hide(); break;
    }
  }
  onMount(() => {
    const off = [
      // the app's shortcuts hear a key last, once whatever is open over the app has had it. Keys typed into an IME
      // too: a Korean word's last syllable is still being put together when ⌘N or ⌘1 comes straight after it
      claimKeys('global', { '*': onKeydown }, { priority: PRIORITY.app, composing: true }),
      claimKeys('global', { Meta: () => cmdUp() }, { keyup: true, priority: PRIORITY.app, composing: true }),
      // the last thing used was the keyboard (any key, before anything takes it): hover-only buttons wait for the mouse
      claimKeys('global', { '*': () => { document.documentElement.dataset.input = 'keyboard'; delete document.documentElement.dataset.hover; } },
        { capture: true, priority: PRIORITY.watch, composing: true }),
    ];
    return () => off.forEach((f) => f());
  });
</script>

<!-- the webview's own menu is Reload / AutoFill / Speech — nothing a note can act on. The places worth
     right-clicking open one of ours instead (a sidebar row, the note). A plain text box keeps the
     system menu: cut/copy/paste there is exactly what it offers, and the app has nothing better. -->
<!-- data-hover: the mouse has moved since the last key or since the window came back. WebKit keeps :hover on
     whatever was under a still pointer (the window hidden and summoned again, the list walked with the arrows),
     so a row's hover-only buttons showed with no mouse near them; those wait for this instead. -->
<svelte:window oncontextmenu={(e) => { if (!(e.target as HTMLElement).closest(isMobile ? 'input, textarea, .tiptap' : 'input, textarea')) e.preventDefault(); }} ondragover={onDragOver} ondrop={onDrop} onblur={() => { cmdUp(); leaveWindow(); delete document.documentElement.dataset.hover; }} onfocus={restoreFocus}
  onmousedowncapture={() => (document.documentElement.dataset.input = 'mouse')}
  onclickcapture={(e) => {
    // a button clicked with the mouse that a key also does: say which key
    if (e.detail === 0) return; // Enter / Space on a focused button is already the keyboard
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-keys]');
    if (b?.dataset.keys) hints.show('btn:' + (b.dataset.tip ?? b.dataset.keys), `${b.dataset.tip ?? 'This'} has a shortcut`, b.dataset.keys);
  }}
  onmousemove={() => { document.documentElement.dataset.hover ??= '1'; }}
  onfocusin={flashPane} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shell" ontouchstart={swipeStart} ontouchend={swipeEnd} onfocusin={(e) => (ui.focusOwner = (e.target as HTMLElement).closest('aside') ? 'sidebar' : 'editor')}>
  <div class="dragbar" data-tauri-drag-region></div>
  <!-- window toolbar, right of the traffic lights -->
  <div class="toolbar">
    <button class="icon" aria-label="Sidebar" data-tip="Sidebar" data-keys={shortcuts.keysFor('focusSidebar')} onclick={() => (sidebarOpen = !sidebarOpen)}>
      <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.5 3v10"/></svg>
    </button>
    <button class="icon" aria-label="Back" data-tip="Back" data-keys={shortcuts.keysFor('back')} disabled={!notes.canBack} onclick={() => notes.back()}>
      <svg viewBox="0 0 16 16"><path d="M13 8H3M7 4L3 8l4 4"/></svg>
    </button>
    <button class="icon" aria-label="Forward" data-tip="Forward" data-keys={shortcuts.keysFor('forward')} disabled={!notes.canForward} onclick={() => notes.forward()}>
      <svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
    </button>
    <button class="icon" aria-label="New" data-tip="New" data-keys={shortcuts.keysFor('newNote')} onclick={(e) => { if (hooks.openPlus) hooks.openPlus(e.currentTarget); else { ui.focusOwner = 'editor'; newNote(); } }}>
      <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>
    </button>
  </div>
  {#if isMobile && !sidebarOpen}
    <!-- a phone: the note's own bar, back to the list on the left, a new note on the right -->
    <header class="mhead">
      <button class="micon mback" aria-label="Back" onclick={phoneBack}>
        <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg>
      </button>
      <span class="mgap"></span>
      {#if notes.current}
      <button class="micon" aria-label="More" onclick={(e) => moreMenu(e.currentTarget)}>
        <svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/></svg>
      </button>
      <button class="micon" class:on={!!notes.current && widgetTop.includes(notes.current.id)} aria-label="Pin to the top of the widget" onclick={pinToHome}>
        <svg viewBox="0 0 16 16"><path d="M6 1.8h4l-.6 3.4 2.2 2.2v1.2H4.4V7.4l2.2-2.2z"/><path d="M8 8.6V14"/></svg>
      </button>
      <button class="micon danger" aria-label="Delete note" onclick={deleteOnPhone}>
        <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9M6.8 7v4.2M9.2 7v4.2"/></svg>
      </button>
      {/if}
    </header>
  {/if}
  <Sidebar bind:open={sidebarOpen} bind:searchEl {cmdHeld} onSettings={() => (settingsOpen = true)} onNew={newOnPhone} />
  <main class:tabbed={!isMobile && tabs.list.length > 1}>
    {#if !isMobile && tabs.list.length > 1}<TabBar />{/if}
    {#if notes.loaded && notes.current}
      {#key notes.currentId}
        <div class="page" in:fade={{ duration: 160 }}>
          <Editor note={notes.current} />
        </div>
      {/key}
      {#if !isMobile}
        <!-- the note's own menu, at the right end of the window's top row (a phone has it in its bar) -->
        <button class="icon note-more" aria-label="More" data-tip="More" onclick={(e) => moreMenu(e.currentTarget)}>
          <svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/></svg>
        </button>
      {/if}
    {:else if notes.loaded && notes.currentId === CALENDAR}
      <div class="page" in:fade={{ duration: 160 }}><CalendarPage onpick={openDay} ontemplate={openTemplate} /></div>
    {/if}
  </main>
</div>

{#if isMobile && !sidebarOpen}
  <MobileBar />
{/if}
<Hint />
<!-- rarely opened: each arrives as its own chunk the first time, not with the app's start -->
{#if settingsOpen}
  {#await import('./Settings.svelte') then { default: Settings }}<Settings onClose={() => (settingsOpen = false)} {hotkeyError} />{/await}
{/if}
{#each ui.cards as req (req)}
  {#await import('./CardPage.svelte') then { default: CardPage }}<CardPage {req} />{/await}
{/each}
{#if ui.photo}<ImageViewer />{/if}
{#if ui.pdf}
  {#await import('./PdfViewer.svelte') then { default: PdfViewer }}<PdfViewer />{/await}
{/if}
{#if sizeShown !== null}
  <div class="size-pill" transition:fade={{ duration: 120 }} role="status">Text {sizeShown}px</div>
{/if}
{#if dropHint}
  <div class="drop-hint" transition:fade={{ duration: 90 }}>
    <span class="drop-pill">{dropHint}</span>
  </div>
{/if}
{#if ui.trash}
  {#await import('./TrashPanel.svelte') then { default: TrashPanel }}<TrashPanel />{/await}
{/if}
{#key ui.historyOf}
  {#if ui.historyOf}
    {#await import('./HistoryPanel.svelte') then { default: HistoryPanel }}<HistoryPanel />{/await}
  {/if}
{/key}
{#if ui.pending}
  <Confirm />
{/if}
{#if ui.emoji}
  {#await import('./EmojiPicker.svelte') then { default: EmojiPicker }}<EmojiPicker />{/await}
{/if}
{#if ui.menu}
  <Menu />
{/if}
<Toast />
<Tooltip />
