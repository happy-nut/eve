// Thin layer over Tauri; falls back to localStorage so `npm run dev` works in a plain browser.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const LS = 'eve.notes.';

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
    return isTauri ? invoke<string>('notes_path') : 'localStorage';
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
