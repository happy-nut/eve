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
  async path(): Promise<string> {
    if (!notesDir) notesDir = isTauri ? await invoke<string>('notes_path') : 'localStorage';
    return notesDir;
  },
};

/** Map a markdown image src to something the webview can load. Relative paths live under notes/. */
export function assetUrl(src: string | undefined): string | undefined {
  if (!src || !isTauri || /^(https?:|data:|asset:|file:)/.test(src)) return src;
  if (!notesDir) return src;
  // lazy import keeps the browser bundle Tauri-free
  return convertFileSrcSync(`${notesDir}/${src}`);
}
let convertFileSrcSync: (p: string) => string = (p) => p;
if (isTauri) import('@tauri-apps/api/core').then((m) => (convertFileSrcSync = m.convertFileSrc));

/** Save an image blob (paste / drop) next to the notes and return its relative path. Browser fallback: data URL. */
export async function saveImage(file: Blob): Promise<string> {
  if (!isTauri) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
  }
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
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

/** Open a link in the default browser. */
export const openUrl = (url: string) => (isTauri ? invoke<void>('open_url', { url }) : Promise.resolve(void window.open(url, '_blank')));

/** Page HTML for link previews. Browser mode: plain fetch (works only for CORS-friendly sites). */
export const fetchUrl = (url: string) => (isTauri ? invoke<string>('fetch_url', { url }) : fetch(url).then((r) => r.text()));

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

/** Launch at login, so the global hotkey works even after the app was quit. */
export const autostart = {
  async get() { if (!isTauri) return false; return (await import('@tauri-apps/plugin-autostart')).isEnabled(); },
  async set(on: boolean) {
    if (!isTauri) return;
    const m = await import('@tauri-apps/plugin-autostart');
    await (on ? m.enable() : m.disable());
  },
};

/** Summon / dismiss with a short fade. The window is transparent, so fading <body> fades the whole thing. */
const FADE_MS = 140;
const html = () => document.documentElement;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fadeIn() {
  // A hidden webview doesn't paint, so we can't fade from 0 unless the page was left at opacity 0
  // when it was dismissed (fadeOut does that). Otherwise just show — no flash of a wrong frame.
  const canFade = html().classList.contains('fx-hidden');
  await invoke<void>('show_window');
  if (!canFade) return;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  html().classList.remove('fx-hidden');
}
async function fadeOut() {
  document.dispatchEvent(new Event('visibilitychange')); // closes tooltips/popovers before the fade
  html().classList.add('fx-hidden');
  await wait(FADE_MS);
  await invoke<void>('hide_app');
  // stays at opacity 0 while hidden, so the next summon fades in from nothing
}
export const win = {
  toggle: async () => { if (!isTauri) return; (await invoke<boolean>('is_front')) ? fadeOut() : fadeIn(); },
  hide: () => (isTauri ? fadeOut() : Promise.resolve()),
};

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
