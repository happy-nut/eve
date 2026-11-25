<script lang="ts">
  import { untrack } from 'svelte';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes, CALENDAR, stepFrom } from './lib/notes.svelte';
  import { isDailyId, DAILY_TEMPLATE_ID } from './lib/daily';
  import { startReminder, syncPhoneReminder } from './lib/reminder';
  import CalendarPage from './CalendarPage.svelte';
  import { shortcuts, eventToKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { tree } from './lib/tree.svelte';
  import { appearance } from './lib/appearance.svelte';
  appearance.apply();
  import { setGlobalHotkey, win, files, autostart, dock, isTauri, isMobile, onWindowFocus, onWindowHide, onBack, seenFade, redrawPanes, widget, links, inbox, saveAsset, storage, copyText } from './lib/platform';
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
  import { assetIfTaken, droppedFiles, isAsset, type Dropped } from './lib/drop';
  import { importTree } from './lib/importTree';
  import { importPaths, exportCurrent } from './lib/transfer';
  import { exportMenu } from './lib/noteMenu';
  import { titleOf } from './lib/notes.svelte';
  import { tabs } from './lib/tabs.svelte';
  import TabBar from './TabBar.svelte';
  import { parseTicket } from './lib/handoff';
  import { parseEveLink } from './lib/evelink';
  import { applyAll } from './lib/inbox';
  import { focusNote } from './lib/popup';
  import { cameBack } from './lib/comeBack';
  import { flushPendingEdits } from './lib/pending';
  import { claimKeys, handledBy, PRIORITY } from './lib/keys';

  let sidebarOpen = $state(true);
  $effect(() => { document.documentElement.style.setProperty('--pane-left', !isMobile && sidebarOpen ? '260px' : '0px'); });
  let settingsOpen = $state(false);
  $effect(() => { if (settingsOpen) return ui.openedSettings(() => (settingsOpen = false)); });
  let searchEl = $state<HTMLInputElement | null>(null);
  let hotkeyError = $state<string | null>(null);
  let cmdHeld = $state(false);
  let cmdTimer: ReturnType<typeof setTimeout> | undefined;
  function cmdDown() { clearTimeout(cmdTimer); cmdTimer = setTimeout(() => (cmdHeld = true), 550); }
  function cmdUp() { clearTimeout(cmdTimer); cmdHeld = false; }
  function jumpTo(n: number) {
    const note = tree.visibleOrdered()[n - 1];
    if (!note) return;
    ui.focusOwner = 'editor';
    ui.search = '';
    notes.currentId = note.id;
    queueMicrotask(focusNote);
  }

  $effect(() => {
    const keys = appearance.s.summon ? shortcuts.keysFor('toggleWindow') : '';
    setGlobalHotkey(keys).then((err) => (hotkeyError = err));
  });

  $effect(() => {
    if (!isMobile || !isTauri || (sidebarOpen && !ui.layers.count && !ui.search)) return;
    let off: (() => void) | undefined, gone = false;
    onBack(phoneBack)
      .then((u) => (gone ? u() : (off = u)));
    return () => { gone = true; off?.(); };
  });

  if (import.meta.env.DEV) Object.assign(window as any, { __notes: notes, __sync: sync, __appearance: appearance });
  onMount(() => {
    void autostart.keep().catch(() => {});
    void dock.set(dock.hidden);
    notes.load().then(() => {
      if (isMobile && notes.resumed) sidebarOpen = false;
      void files.onOpen(async (paths) => {
        const first = await importPaths(paths);
        if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; }
      });
      void links.onOpen((url) => {
        const link = parseEveLink(url);
        if (!link || !notes.exists(link.id)) return;
        putAway();
        ui.focusOwner = 'editor';
        if (notes.currentId === link.id) {
          if (link.section) hooks.section?.(link.section);
          return;
        }
        notes.section = link.section;
        notes.currentId = link.id;
      });
      void inbox.onAsk(applyAll);
      widget.onOpen((ask) => {
        const ticket = parseTicket(ask);
        if (ticket) { settingsOpen = true; void sync.claim(ticket).then(offerUpdate); return; }
        if (ask === 'daily') { writeToday(); return; }
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
        const id = ask.startsWith('note:') ? ask.slice(5) : null;
        if (ask !== 'new' && !id) return;
        putAway();
        if (id && !notes.exists(id)) { sidebarOpen = true; return; }
        ui.focusOwner = 'editor';
        if (id) notes.currentId = id; else newNote();
        sidebarOpen = false;
        widget.keyboard();
      });
    });
    window.addEventListener('eve-summon', onSummon);
    // coming back by click, ⌘Tab or the Dock fires no DOM 'focus' when the webview never let go of it
    let unfocus: (() => void) | undefined;
    onWindowFocus(() => { redrawPanes(); cameBack(restoreFocus); }).then((u) => (unfocus = u));
    const unhide = onWindowHide(leaveWindow);
    const stopSync = sync.start();
    const stopReminder = startReminder();
    updates.start();
    return () => { window.removeEventListener('eve-summon', onSummon); unfocus?.(); unhide(); clearTimeout(hintTimer); stopSync(); stopReminder?.(); };
  });

  /**
   * Leaving the window mid-syllable (⌘Tab, a click in another app, Eve's own hotkey): take the focus out of the note, so
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
    view.docView.markDirty(at.before(), at.after());
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
    if (ui.layers.modal) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a.isConnected && a !== document.body) return;
    const el = back?.isConnected ? back : document.querySelector<HTMLElement>(ui.card ? '.card-page .tiptap' : '.tiptap');
    // the view's own focus puts its selection back in the same step, not 20 ms later under a keystroke
    const view = (el as { editor?: { view: View } } | null)?.editor?.view;
    if (view && back) redrawCaretLine(view);
    if (view) view.focus(); else el?.focus();
  }

  function onSummon() {
    redrawPanes();
    restoreFocus();
    hooks.caretIntoView?.();
  }
  function step(delta: number) {
    const next = stepFrom(tree.ordered(), notes.currentId, delta);
    if (next) notes.currentId = next.id;
  }

  let swipe: { x: number; y: number; at: number } | null = null;
  function noteIsCovered() {
    return sidebarOpen || settingsOpen || !!ui.card || ui.diagramView !== null || !!ui.find || ui.layers.count > 0 || !!hooks.diagramBack;
  }
  const LONG_PRESS_MS = 600;
  function choosingText(held: number) {
    return held > LONG_PRESS_MS || !!getSelection()?.toString();
  }
  function swipeStart(e: TouchEvent) {
    swipe = null;
    if (!isMobile || noteIsCovered() || e.touches.length !== 1) return;
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
    if (choosingText(held)) return;
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) toList();
  }
  function toList() {
    // the native back key leaves the focus where it was: the note kept its caret behind the list, and with it the
    // "/" menu and a table's tools, drawn over the list. They go when the note lets go of the keyboard
    (document.activeElement as HTMLElement | null)?.blur();
    notes.letGo();
    sidebarOpen = true;
  }

  function moreMenu(from: HTMLElement) {
    const r = from.getBoundingClientRect();
    ui.openMenu({ clientX: r.right, clientY: r.bottom }, [
      { label: 'Full width', checked: !!notes.current?.wide, hide: isMobile, run: () => { const n = notes.current; if (n) notes.setWide(n.id, !n.wide); } },
      { label: 'Small text', checked: !!notes.current?.small, run: () => { const n = notes.current; if (n) notes.setLook(n.id, { small: !n.small || undefined }); } },
      { label: 'Present', keys: shortcuts.keysFor('present'), sep: !isMobile, hide: !notes.current, run: () => present() },
      { label: 'Find & replace…', hide: !isMobile, run: () => ui.openFind() },
      { label: 'Select all', hide: !isMobile, run: () => hooks.command?.('selectAll') },
      { label: 'Export…', sep: true, run: () => exportMenu({ clientX: r.right, clientY: r.bottom }) },
      { label: 'Copy file path', sep: true, hide: !isTauri || isMobile || !notes.current, run: () => void copyPath() },
      { label: 'Version history…', sep: !isTauri || isMobile, hide: !notes.current, run: () => { const n = notes.current; if (n) { notes.flush(n.id); ui.openHistory(n.id); } } },
      { label: 'Trash…', hide: !isMobile, run: () => ui.openTrash() },
    ]);
  }
  function present(here = false) {
    const page = hooks.page?.();
    if (!page) return;
    let at = here ? getSelection()?.anchorNode ?? null : null;
    while (at && at.parentNode !== page) at = at.parentNode;
    ui.openPresent(page, at as Element | null);
  }
  async function copyPath() {
    const n = notes.current;
    if (!n) return;
    notes.flush(n.id);
    await copyText(`${await storage.path()}/${n.id}.md`);
    ui.toast(`Path to “${titleOf(n)}” copied`);
  }
  async function offerUpdate() {
    await updates.check(true);
    const v = updates.available?.version;
    if (v && (await ui.ask(`Eve ${v} is ready. Update now?`, false, 'Update'))) updates.install();
  }

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
    sidebarOpen = true;
  }

  function newNote() {
    ui.search = '';
    notes.create();
  }
  function newOnPhone() {
    const write = (open: () => void) => () => { ui.focusOwner = 'editor'; open(); sidebarOpen = false; widget.keyboard(); };
    ui.openMenu({ clientX: 0, clientY: 0 }, [
      { label: 'New note', run: write(newNote) },
      { label: "Today's daily note", run: writeToday, hide: !appearance.s.dailyNotes },
    ]);
  }
  function putAway() {
    ui.layers.closeAll('putAway');
  }
  function writeToday() {
    putAway();
    ui.focusOwner = 'editor';
    notes.caretEnd = true;
    notes.openDaily();
    sidebarOpen = false;
    widget.keyboard();
  }
  function openTemplate() {
    const n = notes.templateNote();
    void ui.openPage(n.body, (md) => notes.update(n.id, md),
      'Template — every new day starts like this. {{date}} and {{weekday}} are filled in.', () => n.id).then(() => notes.flush(n.id));
  }
  function openDay(key: string) {
    const day = notes.dayDraft(key);
    void ui.openPage(day.body, (md) => day.write(md), undefined, () => day.note?.id ?? null).then(() => { if (day.note) notes.flush(day.note.id); });
  }
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

  function phoneBack() {
    if (ui.layers.closeTop('back')) return;
    else if (hooks.diagramBack) hooks.diagramBack();
    else if (sidebarOpen && ui.search) ui.search = '';
    else if (notes.current && (isDailyId(notes.current.id) || notes.current.id === DAILY_TEMPLATE_ID) && appearance.s.dailyNotes) notes.currentId = CALENDAR;
    else toList();
  }
  $effect(() => { if (notes.loaded && tree.groups.length) untrack(() => tree.toPages()); });
  let lastOpen: string | null = null;
  $effect(() => {
    const cur = notes.currentId;
    void notes.visible;
    if (isMobile || !notes.loaded) return;
    untrack(() => tabs.follow(lastOpen));
    lastOpen = cur;
  });
  $effect(() => { if (appearance.s.dailyNotes && notes.loaded) notes.ensureCalendar(); });
  $effect(() => { if (isMobile) syncPhoneReminder(); });
  $effect(() => { if (isMobile) widget.daily(appearance.s.dailyNotes && appearance.s.dailyInWidget); });
  $effect(() => { if (!appearance.s.dailyNotes && notes.currentId === CALENDAR) notes.currentId = notes.firstPage()?.id ?? null; });

  function focusSidebar() {
    if (sidebarOpen && document.activeElement?.closest('aside')) {
      sidebarOpen = false;
      queueMicrotask(focusNote);
      return;
    }
    sidebarOpen = true;
    queueMicrotask(() => (document.querySelector<HTMLElement>('aside [data-row].active') ?? foldedOver() ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus());
  }
  function foldedOver() {
    const row = (sel: string) => document.querySelector<HTMLElement>(`aside ${sel}`);
    for (let n = notes.current; n?.parent; n = notes.all.find((m) => m.id === n!.parent) ?? null) {
      const up = row(`[data-note="${CSS.escape(n.parent)}"]`);
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
  const EDIT_KEYS = /^(Backspace|Delete|Enter|Tab)/;
  function isWriting(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!(document.activeElement as HTMLElement | null)?.closest('.tiptap')) return false;
    return e.key.length === 1 || EDIT_KEYS.test(e.key);
  }

  let sizeShown = $state<number | null>(null);
  let sizeTimer: ReturnType<typeof setTimeout> | undefined;
  function showSize(px: number) {
    sizeShown = px;
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => (sizeShown = null), 900);
  }
  let dropHint = $state<string | null>(null);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let dropRow: HTMLElement | null = null;
  function markRow(el: HTMLElement | null) {
    if (el === dropRow) return;
    dropRow?.classList.remove('file-over');
    el?.classList.add('file-over');
    dropRow = el;
  }
  function listTarget(target: EventTarget | null): { into: string; row: HTMLElement | null } | null {
    const el = target as HTMLElement | null;
    if (!el?.closest?.('aside')) return null;
    const n = el.closest('.note-row')?.querySelector<HTMLElement>('[data-note]');
    const note = n && notes.all.find((x) => x.id === n.dataset.note);
    if (note) return { into: note.parent ?? '', row: n };
    return { into: '', row: null };
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
    const host = on?.into ? notes.all.find((x) => x.id === on.into) : undefined;
    dropHint = on ? (host ? `Import into “${titleOf(host)}”` : 'Import into the list')
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
    const editorTookDrop = e.defaultPrevented;
    e.preventDefault();
    const on = listTarget(e.target);
    const notYetEmbedded = ({ file, dir }: Dropped) => !editorTookDrop || !!dir || !isAsset(file);
    const dropped = (await droppedFiles(e.dataTransfer)).filter(notYetEmbedded);
    const made = await importTree(dropped.map(({ file, dir }) => ({
      path: dir ? `${dir}/${file.name}` : file.name,
      text: () => file.text(),
      asset: () => assetIfTaken(file.name, () => saveAsset(file)),
    })), on?.into ?? '', on?.into ?? notes.current?.parent ?? '');
    if (made.length) ui.focusOwner = 'editor';
    if (on) return;
    for (const { note, source, embed } of made) {
      if (source.path.includes('/')) continue;
      if (!embed) hooks.attach?.(`[[${titleOf(note)}]]`);
      else if (!editorTookDrop) hooks.attach?.(embed);
    }
  }

  function escapePutsAway(e: KeyboardEvent) {
    return e.key === 'Escape' && handledBy(e) !== 'taken' && ui.layers.escape();
  }
  function matchAppAction(e: KeyboardEvent) {
    const action = (id: string) => shortcuts.actions.find((x) => x.id === id);
    const plusIsBigger = e.key === '+' && (e.metaKey || e.ctrlKey) && !e.altKey;
    const linkKeys = shortcuts.keysFor('link');
    const emptyLinkIsSearch = !!linkKeys && eventToKeys(e) === linkKeys;
    return shortcuts.match(e, ['app']) ?? (plusIsBigger ? action('textBigger') : undefined) ?? (emptyLinkIsSearch ? action('search') : undefined);
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Meta' && !e.shiftKey && !e.altKey && !e.ctrlKey) cmdDown();
    else cmdUp();
    if (sidebarOpen && appearance.s.closeSidebarOnWrite && !ui.card && isWriting(e)) sidebarOpen = false;
    if (ui.layers.grabbing) {
      if (e.key === 'Escape' && ui.layers.escape()) e.preventDefault();
      else if (ui.layers.trapTab(e)) { }
      else if (settingsOpen && ui.layers.top?.id === 'settings' && shortcuts.match(e, ['app'])?.id === 'settings') { e.preventDefault(); settingsOpen = false; }
      return;
    }
    if (escapePutsAway(e)) {
      e.preventDefault();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      jumpTo(Number(e.code[5]));
      return;
    }
    if (handledBy(e) === 'taken') return;
    if (ui.undoKey(e)) { e.preventDefault(); return; }
    const a = matchAppAction(e);
    if (!a) return;
    e.preventDefault();
    if (ui.card && (a.id === 'search' || a.id === 'focusSidebar')) { flushPendingEdits(); ui.closeCard(); }
    if (a.id === 'settings' && !settingsOpen && ui.card) { flushPendingEdits(); while (ui.card) ui.closeCard(); }
    switch (a.id) {
      case 'newNote':
        if (document.activeElement?.closest('aside')) hooks.openPlus?.();
        else { ui.focusOwner = 'editor'; newNote(); }
        break;
      case 'search': sidebarOpen = true; queueMicrotask(() => searchEl?.focus()); break;
      case 'find':
        if (ui.find) ui.closeFind(); else ui.openFind();
        break;
      case 'focusSidebar': focusSidebar(); break;
      case 'back': notes.back(); break;
      case 'forward': notes.forward(); break;
      case 'parentPage': {
        const up = notes.current?.parent;
        if (up && notes.exists(up)) notes.currentId = up;
        break;
      }
      case 'copyLink': {
        const n = notes.current;
        if (n) void navigator.clipboard?.writeText(`eve://open?id=${encodeURIComponent(n.id)}`).then(() => ui.toast(`Link to “${titleOf(n)}” copied`));
        break;
      }
      case 'theme': {
        const dark = appearance.s.theme === 'dark' || (appearance.s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
        appearance.set({ theme: dark ? 'light' : 'dark' });
        break;
      }
      case 'newTab': if (!isMobile) { ui.search = ''; const n = notes.create('', notes.current?.parent); tabs.open(n.id); ui.focusOwner = 'editor'; } break;
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
      case 'present': if (!ui.present) present(); break;
      case 'presentHere': if (!ui.present) present(true); break;
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
      claimKeys('global', { 'Mod-z': (e) => ui.toastUndoKey(e) }, { capture: true }),
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
  <Sidebar bind:open={sidebarOpen} bind:searchEl cmdHeld={cmdHeld && !ui.layers.count} onSettings={() => (settingsOpen = true)} onNew={newOnPhone} />
  <main class:tabbed={!isMobile && tabs.list.length > 1}>
    {#if !isMobile && tabs.list.length > 1}<TabBar />{/if}
    {#if notes.loaded && notes.current}
      {#key notes.currentId}
        <div class="page" in:fade={seenFade(160)}>
          <Editor note={notes.current} />
        </div>
      {/key}
      {#if !isMobile}
        <button class="icon note-more" aria-label="More" data-tip="More" onclick={(e) => moreMenu(e.currentTarget)}>
          <svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/></svg>
        </button>
      {/if}
    {:else if notes.loaded && notes.currentId === CALENDAR}
      <div class="page" in:fade={seenFade(160)}><CalendarPage onpick={openDay} ontemplate={openTemplate} /></div>
    {/if}
  </main>
</div>

{#if isMobile && !sidebarOpen}
  <MobileBar />
{/if}
<Hint />
{#if settingsOpen}
  {#await import('./Settings.svelte') then { default: Settings }}<Settings onClose={() => (settingsOpen = false)} {hotkeyError} />{/await}
{/if}
{#each ui.cards as req (req)}
  {#await import('./CardPage.svelte') then { default: CardPage }}<CardPage {req} />{/await}
{/each}
{#if ui.photo}<ImageViewer />{/if}
{#if ui.present}
  {#await import('./Present.svelte') then { default: Present }}<Present />{/await}
{/if}
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
