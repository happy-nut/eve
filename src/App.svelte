<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { notes } from './lib/notes.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { groups, MAX_DEPTH } from './lib/groups.svelte';
  import { appearance } from './lib/appearance.svelte';
  appearance.apply();
  import { setGlobalHotkey, win, files, autostart, dock, pin, isTauri, isMobile, onWindowFocus, onBack, widget } from './lib/platform';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Confirm from './Confirm.svelte';
  import MobileBar from './MobileBar.svelte';
  import Hint from './Hint.svelte';
  import { hints } from './lib/hints.svelte';
  import { updates } from './lib/updates.svelte';
  import LinkChoice from './LinkChoice.svelte';
  import Tooltip from './Tooltip.svelte';
  import Menu from './Menu.svelte';
  import { ui, hooks } from './lib/ui.svelte';
  import { fileMarkdown, droppedFiles, stem, TEXT_FILE } from './lib/drop';
  import { importPaths, exportCurrent } from './lib/transfer';
  import { titleOf } from './lib/notes.svelte';
  import { parseTicket } from './lib/handoff';

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let pinned = $state(pin.on);
  function togglePin() { pinned = !pinned; void pin.set(pinned); }
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
    notes.currentId = note.id;
    queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus());
  }

  // global hotkey follows the shortcut store live
  $effect(() => {
    const keys = shortcuts.keysFor('toggleWindow');
    setGlobalHotkey(keys).then((err) => (hotkeyError = err));
  });

  // Android back: a dialog closes, a note goes back to the list, and only the list leaves the app
  $effect(() => {
    if (!isMobile || !isTauri || (sidebarOpen && !settingsOpen)) return;
    let off: (() => void) | undefined, gone = false;
    onBack(() => { if (settingsOpen) settingsOpen = false; else sidebarOpen = true; })
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
    if (pinned) void pin.set(true); // the window forgets it across restarts; the setting does not
    // a file opened from Finder joins the notes like any import — it is a note from then on, movable
    // in the sidebar and synced (the file on disk is left as it was)
    notes.load().then(() => {
      void files.onOpen(async (paths) => {
        const first = await importPaths(paths);
        if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; }
      });
      widget.onOpen((ask) => {
        // the phone-setup page: take the sign-in the Mac's QR points at
        const ticket = parseTicket(ask);
        if (ticket) { settingsOpen = true; void sync.claim(ticket); return; }
        // the home-screen widget: straight into that note (or a new one), keyboard up
        const id = ask.startsWith('note:') ? ask.slice(5) : null;
        if (ask !== 'new' && !id) return;
        settingsOpen = false;
        ui.focusOwner = 'editor';
        if (id && notes.all.some((n) => n.id === id)) notes.currentId = id; else notes.create();
        sidebarOpen = false;
        widget.keyboard();
      });
    });
    window.addEventListener('eve-summon', onSummon);
    // coming back by click, ⌘Tab or the Dock fires no DOM 'focus' when the webview never let go of it
    let unfocus: (() => void) | undefined;
    onWindowFocus(restoreFocus).then((u) => (unfocus = u));
    const stopSync = sync.start();
    updates.start();
    return () => { window.removeEventListener('eve-summon', onSummon); unfocus?.(); clearTimeout(hintTimer); stopSync?.(); };
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
   * Summoned back (⌘⇧Space, Dock, ⌘Tab): the note that had the caret gets it back, where it was; with
   * nothing to go back to, the caret goes to the note. Anything already holding focus is left strictly
   * alone — this runs again on the window's own focus event, which can land a beat *after* the first
   * keystroke, and re-focusing an element mid-composition is what splits a syllable into jamo.
   */
  function restoreFocus() {
    const back = away;
    away = null;
    if (ui.pending || ui.emoji || ui.menu || settingsOpen) return; // a dialog owns focus
    const a = document.activeElement as HTMLElement | null;
    if (a && a.isConnected && a !== document.body) return;
    const el = back?.isConnected ? back : document.querySelector<HTMLElement>(ui.card ? '.card .tiptap' : '.tiptap');
    // the view's own focus puts its selection back in the same step, not 20 ms later under a keystroke
    const view = (el as { editor?: { view: View } } | null)?.editor?.view;
    if (view && back) redrawCaretLine(view);
    if (view) view.focus(); else el?.focus();
  }

  /** The window called up by the hotkey: the caret belongs in the middle of the page, ready to write. */
  function onSummon() {
    restoreFocus();
    hooks.centerCaret?.();
  }

  function step(delta: number) {
    const list = groups.ordered();
    const i = list.findIndex((n) => n.id === notes.currentId);
    const next = list[(i + delta + list.length) % list.length];
    if (next) notes.currentId = next.id;
  }

  /** A phone: a swipe to the right on a note brings the list back in. */
  let swipe: { x: number; y: number } | null = null;
  function swipeStart(e: TouchEvent) {
    swipe = null;
    if (!isMobile || sidebarOpen || settingsOpen || ui.card || e.touches.length !== 1) return;
    // things that scroll sideways themselves keep the gesture
    if ((e.target as HTMLElement).closest('pre, table, .kanban, .mbar, .mhead, input, textarea, .menu, .suggest')) return;
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function swipeEnd(e: TouchEvent) {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    swipe = null;
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      (document.activeElement as HTMLElement | null)?.blur(); // the keyboard goes with the note
      sidebarOpen = true;
    }
  }

  /** A phone's note bar: export to the share sheet, a widget of this note on the home screen, delete. */
  function exportMenu(from: HTMLElement) {
    const r = from.getBoundingClientRect();
    ui.openMenu({ clientX: r.right, clientY: r.bottom }, [
      { label: 'Markdown (.md)', run: () => void exportCurrent('md') },
      { label: 'PDF', run: () => void exportCurrent('pdf') },
      { label: 'Image (.png)', run: () => void exportCurrent('png') },
    ]);
  }
  function pinToHome() {
    const n = notes.current;
    if (n && !widget.pin(n.id)) void ui.ask('This home screen can\u2019t add a widget from an app. Long-press the home screen → Widgets → Eve, then pick this note from the widget\u2019s settings.', false);
  }
  async function deleteOnPhone() {
    const n = notes.current;
    if (!n || !(await ui.ask(`Delete “${titleOf(n)}”?`))) return;
    notes.remove(n.id);
    sidebarOpen = true; // back to the list, not into whichever note came next
  }

  /** A phone's +: a new note, open, keyboard up. */
  function newOnPhone() {
    ui.focusOwner = 'editor';
    notes.create();
    sidebarOpen = false;
    widget.keyboard();
  }

  /** ⌘\\: closed -> open + focus list; focus already in list -> close + back to editor; else focus list. */
  function focusSidebar() {
    if (sidebarOpen && document.activeElement?.closest('aside')) {
      sidebarOpen = false;
      queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus());
      return;
    }
    sidebarOpen = true;
    queueMicrotask(() => (document.querySelector<HTMLElement>('aside [data-row].active') ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus());
  }
  async function deleteCurrent() {
    const n = notes.current;
    if (!n) return;
    if (await ui.ask(`Delete “${titleOf(n)}”?`)) notes.remove(n.id);
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
   * (picture, PDF) shows up as itself. A whole folder can be dropped too — its shape becomes groups,
   * and it keeps to itself instead of writing into the open note. Either way the webview never gets
   * the drop: its own pastes DOM into the editor, which then takes no keystroke at all.
   */
  let dropHint = $state<'attach' | 'new' | null>(null);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); // otherwise no drop event follows
    // an attachment joins the note, a text file becomes one — and only the type is knowable in flight
    const items = [...e.dataTransfer.items];
    const asset = items.length > 0 && items.every((i) => i.kind === 'file' && (i.type.startsWith('image/') || i.type === 'application/pdf'));
    dropHint = asset ? 'attach' : 'new';
    // a drag leaving the window fires nothing dependable, so the hint simply stops being refreshed
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (dropHint = null), 160);
  }
  async function onDrop(e: DragEvent) {
    clearTimeout(hintTimer);
    dropHint = null;
    if (!e.dataTransfer?.types.includes('Files')) return;
    const taken = e.defaultPrevented; // dropped into a note: the editor has that attachment already
    e.preventDefault();
    for (const { file, dir } of await droppedFiles(e.dataTransfer)) {
      const md = await fileMarkdown(file);
      if (md === null) continue;
      const text = TEXT_FILE.test(file.name);
      const title = stem(file.name);
      const group = dir ? dir.split('/').slice(0, MAX_DEPTH).join('/') : undefined;
      if (group) groups.remember(group);
      const note = notes.addImported(text && /^\s*#\s/.test(md) ? md : `# ${title}\n\n${md}\n`, group);
      ui.focusOwner = 'editor';
      if (dir) continue; // a folder brings its own tree; it does not write into the open note
      if (text) hooks.attach?.(`[[${titleOf(note)}]]`);
      else if (!taken) hooks.attach?.(md);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // ⌘ alone peeks at the numbers; ⌘ with anything else is a shortcut, so the icons come straight back
    // (including a modifier already held when ⌘ goes down — ⇧⌘ waiting for its third key is not a peek)
    if (e.key === 'Meta' && !e.shiftKey && !e.altKey && !e.ctrlKey) cmdDown();
    else cmdUp();
    // writing takes the window: the list folds away the moment you type inside the editor
    if (sidebarOpen && appearance.s.hideSidebarOnEdit && isWriting(e)) sidebarOpen = false;
    // the right-click menu takes the keyboard while it is up, wherever the focus actually sits
    if (ui.menu) { if (e.key === 'Escape') { e.preventDefault(); ui.closeMenu(); } return; }
    if (ui.pending || ui.emoji) return;
    // Escape puts away whatever is open over the note — the find bar, then the PDF panel — and only a
    // bare note lets it through to hide the window. Tied to the key, not to the rebindable action:
    // closing the thing on top is what Escape means everywhere in the app.
    if (e.key === 'Escape' && (ui.find || ui.pdf)) {
      e.preventDefault();
      if (ui.find) { ui.find = false; queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus()); }
      else ui.closePdf();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      jumpTo(Number(e.code[5]));
      return;
    }
    if (e.defaultPrevented && !(e as any).eveApp) return;
    const a = shortcuts.match(e, ['app']);
    if (!a) return;
    // Escape belongs to whatever is open on top of the note (the PDF panel closes on it, and lets the
    // window hide once it is gone)
    if (a.id === 'hide' && (settingsOpen || document.activeElement === searchEl)) return; // handled locally
    e.preventDefault();
    switch (a.id) {
      case 'newNote':
        // from the sidebar, ask what to create (note or group) via the + menu
        if (document.activeElement?.closest('aside')) hooks.openPlus?.();
        else { ui.focusOwner = 'editor'; notes.create(); }
        break;
      case 'search': sidebarOpen = true; queueMicrotask(() => searchEl?.focus()); break;
      case 'find': // pressing it again puts the bar away and hands the note back the caret
        ui.find = !ui.find;
        if (!ui.find) queueMicrotask(() => document.querySelector<HTMLElement>('.tiptap')?.focus());
        break;
      case 'focusSidebar': focusSidebar(); break;
      case 'back': notes.back(); break;
      case 'forward': notes.forward(); break;
      case 'nextNote': step(1); break;
      case 'prevNote': step(-1); break;
      case 'deleteNote': deleteCurrent(); break;
      case 'exportMd': void exportCurrent('md'); break;
      case 'exportPdf': void exportCurrent('pdf'); break;
      case 'exportPng': void exportCurrent('png'); break;
      case 'settings': settingsOpen = !settingsOpen; break;
      case 'hide': win.hide(); break;
      case 'pin': togglePin(); break;
    }
  }
</script>

<!-- the webview's own menu is Reload / AutoFill / Speech — nothing a note can act on. The places worth
     right-clicking open one of ours instead (a sidebar row, the note). A plain text box keeps the
     system menu: cut/copy/paste there is exactly what it offers, and the app has nothing better. -->
<svelte:window oncontextmenu={(e) => { if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault(); }} ondragover={onDragOver} ondrop={onDrop} onkeydown={onKeydown} onkeyup={(e) => e.key === 'Meta' && cmdUp()} onblur={() => { cmdUp(); leaveWindow(); }} onfocus={restoreFocus}
  onmousedowncapture={() => (document.documentElement.dataset.input = 'mouse')}
  onclickcapture={(e) => {
    // a button clicked with the mouse that a key also does: say which key
    if (e.detail === 0) return; // Enter / Space on a focused button is already the keyboard
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-keys]');
    if (b?.dataset.keys) hints.show('btn:' + (b.dataset.tip ?? b.dataset.keys), `${b.dataset.tip ?? 'This'} has a shortcut`, b.dataset.keys);
  }}
  onkeydowncapture={() => (document.documentElement.dataset.input = 'keyboard')} />

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
    <button class="icon pin" class:on={pinned} aria-label="Keep on top" data-tip={pinned ? 'On top' : 'Keep on top'} data-keys={shortcuts.keysFor('pin')} onclick={togglePin}>
      <!-- a pushpin: head, shaft, point -->
      <svg viewBox="0 0 16 16"><path d="M6 1.8h4l-.6 3.4 2.2 2.2v1.2H4.4V7.4l2.2-2.2z"/><path d="M8 8.6V14"/></svg>
    </button>
    <button class="icon" aria-label="New" data-tip="New" data-keys={shortcuts.keysFor('newNote')} onclick={(e) => { if (sidebarOpen && hooks.openPlus) hooks.openPlus(e.currentTarget); else { ui.focusOwner = 'editor'; notes.create(); } }}>
      <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>
    </button>
  </div>
  {#if isMobile && !sidebarOpen}
    <!-- a phone: the note's own bar, back to the list on the left, a new note on the right -->
    <header class="mhead">
      <button class="mback" aria-label="Notes" onclick={() => (sidebarOpen = true)}>
        <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg><span>Notes</span>
      </button>
      <span class="mgap"></span>
      <button class="micon" aria-label="Export" onclick={(e) => exportMenu(e.currentTarget)}>
        <svg viewBox="0 0 16 16"><path d="M8 10V2.5M5 5.5l3-3 3 3"/><path d="M4.5 8H4a1.5 1.5 0 00-1.5 1.5v3A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5v-3A1.5 1.5 0 0012 8h-.5"/></svg>
      </button>
      <button class="micon" aria-label="Pin to home screen" onclick={pinToHome}>
        <svg viewBox="0 0 16 16"><path d="M6 1.8h4l-.6 3.4 2.2 2.2v1.2H4.4V7.4l2.2-2.2z"/><path d="M8 8.6V14"/></svg>
      </button>
      <button class="micon danger" aria-label="Delete note" onclick={deleteOnPhone}>
        <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9M6.8 7v4.2M9.2 7v4.2"/></svg>
      </button>
    </header>
  {/if}
  <Sidebar bind:open={sidebarOpen} bind:searchEl {cmdHeld} onSettings={() => (settingsOpen = true)} onNew={newOnPhone} />
  <main>
    {#if notes.loaded && notes.current}
      {#key notes.currentId}
        <div class="page" in:fade={{ duration: 160 }}>
          <Editor note={notes.current} />
        </div>
      {/key}
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
{#if ui.card}
  {#await import('./CardPage.svelte') then { default: CardPage }}<CardPage />{/await}
{/if}
{#if ui.pdf}
  {#await import('./PdfViewer.svelte') then { default: PdfViewer }}<PdfViewer />{/await}
{/if}
{#if dropHint}
  <div class="drop-hint" transition:fade={{ duration: 90 }}>
    <span class="drop-pill">{dropHint === 'attach' ? 'Attach to this note' : 'Open as a new note'}</span>
  </div>
{/if}
{#if ui.pending}
  <Confirm />
{/if}
{#if ui.emoji}
  {#await import('./EmojiPicker.svelte') then { default: EmojiPicker }}<EmojiPicker />{/await}
{/if}
{#if ui.menu}
  <Menu />
{/if}
{#if ui.link}
  <LinkChoice />
{/if}
<Tooltip />
