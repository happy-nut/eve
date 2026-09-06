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

export const win = {
  toggle: () => (isTauri ? invoke<void>('toggle_window') : Promise.resolve()),
  hide: () => (isTauri ? invoke<void>('hide_app') : Promise.resolve()),
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
