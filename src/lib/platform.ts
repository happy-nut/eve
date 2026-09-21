// Thin layer over Tauri; falls back to localStorage so `npm run dev` works in a plain browser.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const LS = 'eve.notes.';

let notesDir = '';

export const storage = {
  async list(): Promise<string[]> {
    if (isTauri) return invoke<string[]>('list_notes');
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(LS))
      .map((k) => localStorage.getItem(k)!);
  },
  async write(id: string, text: string): Promise<void> {
    if (isTauri) return invoke('write_note', { id, text });
    localStorage.setItem(LS + id, text);
  },
  /** Where the notes live. Resolves the asset mapper too, so `assetUrl` is ready before anything renders. */
  async path(): Promise<string> {
    if (notesDir) return notesDir;
    if (!isTauri) return (notesDir = 'localStorage');
    const { invoke: inv, convertFileSrc } = await import('@tauri-apps/api/core');
    convertFileSrcSync = convertFileSrc;
    return (notesDir = await inv<string>('notes_path'));
  },
};

/** Map a markdown image src to something the webview can load. Relative paths live under notes/. */
export function assetUrl(src: string | undefined): string | undefined {
  if (!src || !isTauri || /^(https?:|data:|asset:|file:)/.test(src)) return src;
  if (!notesDir) return src;
  // lazy import keeps the browser bundle Tauri-free
  return convertFileSrcSync(`${notesDir}/${src}`);
}
let convertFileSrcSync: (p: string) => string = (p) => p; // set by storage.path()

/** Save a pasted / dropped file (image, PDF) next to the notes and return its relative path. Browser fallback: data URL. */
export async function saveAsset(file: File | Blob): Promise<string> {
  if (!isTauri) {
    // a picture is stored inside the note, so it has to survive a reload; anything else only has to open
    // (markdown links reject data: anyway — markdown-it drops the whole link)
    if (!file.type.startsWith('image/')) return URL.createObjectURL(file);
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
  }
  // a file dragged in from Finder may arrive without a MIME type; its name still carries the extension
  const named = file instanceof File ? /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() : undefined;
  const ext = named ?? (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const { invoke: inv } = await import('@tauri-apps/api/core');
  await storage.path();
  return inv<string>('save_asset', new Uint8Array(await file.arrayBuffer()), { headers: { 'x-ext': ext } });
}

/** Open a native file picker, copy the image next to the notes, return its relative path. Null if cancelled. */
export async function pickImage(): Promise<string | null> {
  if (!isTauri) {
    return new Promise((res) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return res(null);
        const r = new FileReader();
        r.onload = () => res(String(r.result)); // browser fallback: data URL
        r.readAsDataURL(f);
      };
      inp.click();
    });
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'] }] });
  if (!path) return null;
  await storage.path();
  return invoke<string>('import_asset', { src: path });
}

/** First page of a stored PDF as a PNG object URL (Quick Look, cached on disk). Null when unavailable. */
export async function pdfThumb(src: string): Promise<string | null> {
  const name = /^assets\//.test(src) ? src.slice('assets/'.length) : null;
  if (!isTauri || !name) return null; // only a file of ours has a thumbnail to ask for
  try {
    const png = await invoke<ArrayBuffer>('pdf_thumb', { name });
    return URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  } catch {
    return null; // an encrypted or broken PDF: the card keeps its glyph
  }
}

/** Pick a video, copy it next to the notes, return its relative path. Null if cancelled. */
export async function pickVideo(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm'] }] });
  if (!path) return null;
  await storage.path();
  return invoke<string>('import_asset', { src: path });
}

/** Images in notes/assets, for sync. Browser mode has none (images are data URLs there). */
export const assets = {
  list: (): Promise<string[]> => (isTauri ? invoke<string[]>('list_assets') : Promise.resolve([])),
  read: async (name: string): Promise<Uint8Array> => new Uint8Array(await invoke<ArrayBuffer>('read_asset', { name })),
  async write(name: string, data: Uint8Array): Promise<void> {
    if (!isTauri) return;
    const { invoke: inv } = await import('@tauri-apps/api/core');
    await inv('write_asset', data, { headers: { 'x-name': name } });
  },
};

/** GitHub sign-in: github.com/login has no CORS, so the desktop side runs the two POSTs. */
export const github = {
  post: (url: string, form: Record<string, string>) => invoke<string>('github_post', { url, form: Object.entries(form) }),
};

/**
 * The clipboard as text, for the note's own Paste. WebKit blocks `execCommand('paste')` and the async
 * clipboard API needs a gesture it will not always grant in a webview, so the desktop side reads it.
 * Invoked by command name: the plugin's npm package would only wrap this one call.
 */
export const clipboardText = (): Promise<string> =>
  (isTauri ? invoke<string>('plugin:clipboard-manager|read_text') : navigator.clipboard.readText()).catch(() => '');

/** Open a link in the default browser. */
export const openUrl = (url: string) => (isTauri ? invoke<void>('open_url', { url }) : Promise.resolve(void window.open(url, '_blank')));

/** Open a stored asset (a PDF, say) in the app that owns it; a web URL goes to the browser. */
export async function openAsset(src: string): Promise<void> {
  const name = /^assets\//.test(src) ? src.slice('assets/'.length) : null;
  if (isTauri && name) return invoke('open_asset', { name });
  await openUrl(src);
}

/** Page HTML for link previews. Browser mode: plain fetch (works only for CORS-friendly sites). */
export const fetchUrl = (url: string) => (isTauri ? invoke<string>('fetch_url', { url }) : fetch(url).then((r) => r.text()));

/** Pick files to import (Finder, multi-select). Null when cancelled. */
export async function pickFiles(): Promise<string[] | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: true,
    filters: [{ name: 'Notes and attachments', extensions: ['md', 'markdown', 'mdx', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'] }],
  });
  return picked === null ? null : (Array.isArray(picked) ? picked : [picked]);
}

/** Pick folders to import whole. Null when cancelled. */
export async function pickFolders(): Promise<string[] | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: true });
  return picked === null ? null : (Array.isArray(picked) ? picked : [picked]);
}

/** Every file under a folder, as paths relative to it. */
export const listFolder = (root: string) => invoke<string[]>('list_folder', { root });

/** Ask where to save an export. Null when cancelled. */
export async function pickSavePath(name: string, ext: string): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({ defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
}

/** Copy a file into notes/assets (an import that keeps the original where it is). */
export const importAsset = (src: string) => invoke<string>('import_asset', { src });

/**
 * Print the window to a PDF file. A print job that saves needs no printer and shows no panel, and the
 * pages keep their text (a picture of the note is what "Export as image" is for). `margin` is in points.
 */
export const savePdf = (out: string, margin = 48) => invoke<void>('save_pdf', { out, margin });

/** The same printed page, rasterised — how a note leaves as a picture. */
export const savePng = (out: string, margin = 48, width = 1600) => invoke<void>('save_image', { out, margin, width });

/** External files opened through macOS (Open With / double-click). */
export const files = {
  read: (path: string) => invoke<string>('read_file', { path }),
  write: (path: string, text: string) => invoke<void>('write_file', { path, text }),
  /** Subscribe to open requests; also drains files opened before the UI was ready. */
  async onOpen(cb: (paths: string[]) => void) {
    if (!isTauri) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string[]>('open-files', (e) => cb(e.payload));
    const pending = await invoke<string[]>('take_pending_files');
    if (pending.length) cb(pending);
  },
};

/** Which app macOS opens a .md with. macOS only; a browser reports false and refuses to change it. */
export const defaultApp = {
  get: () => (isTauri ? invoke<boolean>('is_default_for_markdown') : Promise.resolve(false)),
  set: (on: boolean) => (isTauri ? invoke<void>('set_default_for_markdown', { on }) : Promise.reject(new Error('desktop only'))),
};

/** Launch at login, so the global hotkey works even after the app was quit. */
export const autostart = {
  async get() { if (!isTauri) return false; return (await import('@tauri-apps/plugin-autostart')).isEnabled(); },
  async set(on: boolean) {
    if (!isTauri) return;
    const m = await import('@tauri-apps/plugin-autostart');
    await (on ? m.enable() : m.disable());
  },
};

/** Hide from the Dock and ⌘Tab (macOS accessory app, like Raycast). Default on; remembered locally. */
// ponytail: applied by the frontend after launch, so a Dock icon can flash for a moment at login; a Rust-side
// marker file would avoid that if it ever bothers anyone
export const dock = {
  get hidden() { return localStorage.getItem('eve.dock') !== 'shown'; },
  async set(hidden: boolean) {
    localStorage.setItem('eve.dock', hidden ? 'hidden' : 'shown');
    if (isTauri) await invoke('set_dock_hidden', { hidden });
  },
};

/** Keep the window above every other app (⌘⇧P). Remembered across restarts, like the Dock setting. */
export const pin = {
  get on() { return localStorage.getItem('eve.pin') === '1'; },
  async set(on: boolean) {
    localStorage.setItem('eve.pin', on ? '1' : '0');
    if (isTauri) await invoke('set_always_on_top', { on });
  },
};

/**
 * Summon / dismiss. No fade: the page keeps its pixels while hidden, so the window comes back whole —
 * the traffic lights and the note appearing together instead of the chrome arriving a few frames early.
 */
async function show() {
  await invoke<void>('show_window');
  // the webview can come back with nothing focused; App puts the caret back (window 'focus' alone
  // is not dependable here — the webview may already hold focus while the app was hidden)
  window.dispatchEvent(new Event('eve-summon'));
}
async function dismiss() {
  document.dispatchEvent(new Event('visibilitychange')); // closes tooltips/popovers on the way out
  // a half-typed 한글 syllable would otherwise still be composing when the window comes back, and a
  // composing view reads no keystroke at all (App ends it on the way in too, for the paths with no blur)
  for (const pm of document.querySelectorAll('.tiptap')) pm.dispatchEvent(new CompositionEvent('compositionend', { data: '' }));
  await invoke<void>('hide_app');
}
export const win = {
  toggle: async () => { if (!isTauri) return; (await invoke<boolean>('is_front')) ? dismiss() : show(); },
  hide: () => (isTauri ? dismiss() : Promise.resolve()),
};

/** The size the window opens at (Settings → Appearance). A browser window is the user's own business. */
export async function setWindowSize(width: number, height: number): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}

/**
 * The window became frontmost again (hotkey, a click, ⌘Tab, the Dock). Separate from the DOM 'focus'
 * event, which stays silent when the webview held focus the whole time the app was in the background.
 */
export async function onWindowFocus(cb: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow().onFocusChanged(({ payload }) => { if (payload) cb(); });
}

/** Register the global "summon" hotkey. Re-callable: unregisters everything first. */
export async function setGlobalHotkey(keys: string): Promise<string | null> {
  if (!isTauri) return null;
  const gs = await import('@tauri-apps/plugin-global-shortcut');
  await gs.unregisterAll();
  try {
    await gs.register(toTauriAccelerator(keys), (e) => {
      if (e.state === 'Pressed') win.toggle();
    });
    return null;
  } catch (e) {
    return String(e);
  }
}

/** "Mod-Shift-Space" -> "CmdOrCtrl+Shift+Space" */
export function toTauriAccelerator(keys: string): string {
  return keys
    .split('-')
    .map((p) => (p === 'Mod' ? 'CmdOrCtrl' : p.length === 1 ? p.toUpperCase() : p))
    .join('+');
}
