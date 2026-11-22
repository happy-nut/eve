export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/.test(navigator.userAgent);
const desktop = isTauri && !isMobile;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export function youtubePlayer(embed: string, put: (src: string) => void) {
  if (!desktop) return put(embed);
  const u = new URL(embed);
  void invoke<number>('youtube_port')
    .then((port) => put(`http://127.0.0.1:${port}${u.pathname.replace(/^\/embed\//, '/yt/')}${u.search}`))
    .catch(() => put(embed));
}
export const memMark = (what: string) => { if (desktop) void invoke('mem_mark', { what }).catch(() => {}); };

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
    if (isTauri) return invoke<void>('write_note', { id, text }).then(widget.changed);
    localStorage.setItem(LS + id, text);
  },
  async path(): Promise<string> {
    if (notesDir) return notesDir;
    if (!isTauri) return (notesDir = 'localStorage');
    const { invoke: inv, convertFileSrc } = await import('@tauri-apps/api/core');
    convertFileSrcSync = convertFileSrc;
    return (notesDir = await inv<string>('notes_path'));
  },
};

type Bridge = { takeIntent(): string; notesChanged(): void; showKeyboard(): void; account(repo: string, token: string, host: string): void; export(kind: string, title: string, body: string): void; pinWidget(noteId: string): boolean; widgetTop(): string; setReminder?(on: boolean, at: string, template: string): void; askNotify?(): void; widgetDaily?(on: boolean): void; installUpdate(url: string): void; immersive?(on: boolean): void };
const android = () => (globalThis as { EveAndroid?: Bridge }).EveAndroid;
let widgetTimer: ReturnType<typeof setTimeout> | undefined;
export const widget = {
  changed() {
    if (!android()) return;
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => android()?.notesChanged(), 800);
  },
  account(repo: string, token: string, host = '') { android()?.account(repo, token, host); },
  installUpdate: (url: string) => android()?.installUpdate(url),
  pin: (noteId: string): boolean => android()?.pinWidget(noteId) ?? false,
  reminder: (on: boolean, at: string, template: string) => android()?.setReminder?.(on, at, template),
  askNotify: () => android()?.askNotify?.(),
  daily: (on: boolean) => android()?.widgetDaily?.(on),
  top: (): string[] => (android()?.widgetTop?.() ?? '').split(',').filter(Boolean),
  export(kind: 'md' | 'pdf' | 'png', title: string, body: string): Promise<boolean> {
    const bridge = android();
    if (!bridge) return Promise.resolve(false);
    return new Promise((res) => {
      const on = (e: Event) => { window.removeEventListener('eve-exported', on); res((e as CustomEvent<boolean>).detail); };
      window.addEventListener('eve-exported', on);
      bridge.export(kind, title, kind === 'md' ? body : '');
    });
  },
  keyboard() { android()?.showKeyboard(); },
  onOpen(cb: (ask: string) => void) {
    if (!isMobile) return;
    const drain = () => { const ask = android()?.takeIntent(); if (ask) cb(ask); };
    drain();
    window.addEventListener('eve-intent', drain);
  },
};

/**
 * A src as the file is named on disk. Markdown hands a link over percent-encoded (`my%20pic.png`,
 * `%EC%82%AC%EC%A7%84.png` for 사진.png), and the webview's URL for it encodes it once more: a picture or a PDF
 * whose name had a space or Korean in it was looked for under a name no file has. A src that is not valid
 * percent-encoding is taken as it is.
 */
export function onDisk(src: string): string {
  try { return decodeURI(src); } catch { return src; }
}
export const assetName = (src: string): string | null => (/^assets\//.test(src) ? onDisk(src.slice('assets/'.length)) : null);

export function assetUrl(src: string | undefined): string | undefined {
  if (!src || !isTauri || /^(https?:|data:|asset:|file:)/.test(src)) return src;
  if (!notesDir) return src;
  return convertFileSrcSync(`${notesDir}/${onDisk(src)}`);
}
let convertFileSrcSync: (p: string) => string = (p) => p;

export async function saveAsset(file: File | Blob): Promise<string> {
  if (!isTauri) {
    // a picture is stored inside the note, so it has to survive a reload; anything else only has to open
    // (markdown links reject data: anyway — markdown-it drops the whole link)
    if (!file.type.startsWith('image/')) return URL.createObjectURL(file);
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
  }
  const named = file instanceof File ? /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() : undefined;
  const ext = named ?? (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const { invoke: inv } = await import('@tauri-apps/api/core');
  await storage.path();
  return inv<string>('save_asset', new Uint8Array(await file.arrayBuffer()), { headers: { 'x-ext': ext } });
}

export async function pickImage(): Promise<string | null> {
  if (!isTauri) {
    return new Promise((res) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return res(null);
        const r = new FileReader();
        r.onload = () => res(String(r.result));
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

export async function pdfThumb(src: string): Promise<string | null> {
  const name = assetName(src);
  if (!isTauri || !name) return null;
  try {
    const png = await invoke<ArrayBuffer>('pdf_thumb', { name });
    return URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  } catch {
    return null;
  }
}

export async function qlPreview(src: string): Promise<string | null> {
  const name = assetName(src);
  if (!isTauri || !name) return null;
  try {
    const path = await invoke<string>('ql_preview', { name });
    await storage.path();
    return convertFileSrcSync(path);
  } catch {
    return null;
  }
}

export async function pickVideo(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm'] }] });
  if (!path) return null;
  await storage.path();
  return invoke<string>('import_asset', { src: path });
}

export const assets = {
  list: (): Promise<string[]> => (isTauri ? invoke<string[]>('list_assets') : Promise.resolve([])),
  read: async (name: string): Promise<Uint8Array> => new Uint8Array(await invoke<ArrayBuffer>('read_asset', { name })),
  async write(name: string, data: Uint8Array): Promise<void> {
    if (!isTauri) return;
    const { invoke: inv } = await import('@tauri-apps/api/core');
    await inv('write_asset', data, { headers: { 'x-name': name } });
  },
};

export const share = {
  start: (path: string, body: string) => invoke<string>('share_start', { path, body }),
  stop: () => invoke<void>('share_stop').catch(() => {}),
  fetch: (host: string, path: string) => invoke<string>('lan_get', { host, path }),
  async onDone(cb: () => void) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen('share-done', cb);
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

/** Put text on the clipboard (the desktop side, so it works without a gesture the webview approves of). */
export const copyText = (text: string): Promise<void> =>
  (isTauri ? invoke<void>('plugin:clipboard-manager|write_text', { label: null, text }) : navigator.clipboard.writeText(text)).catch(() => {});

export async function copyImage(src: string): Promise<boolean> {
  try {
    const blob = await (await fetch(src)).blob();
    return await copyPng(blob.type === 'image/png' ? blob : await asPng(blob));
  } catch {
    return false;
  }
}
export async function copyPng(png: Blob): Promise<boolean> {
  try {
    if (isTauri && !isMobile) await invoke<void>('plugin:clipboard-manager|write_image', { image: [...new Uint8Array(await png.arrayBuffer())] });
    else await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}
async function asPng(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1024;
    canvas.height = img.naturalHeight || 1024;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no picture'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const openUrl = (url: string) => (isTauri ? invoke<void>('open_url', { url }) : Promise.resolve(void window.open(url, '_blank')));

export async function openAsset(src: string): Promise<void> {
  const name = assetName(src);
  if (isTauri && name) return invoke('open_asset', { name });
  await openUrl(src);
}

export const fetchUrl = (url: string) => (isTauri ? invoke<string>('fetch_url', { url }) : fetch(url).then((r) => r.text()));

export async function pickFiles(): Promise<string[] | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: true,
    filters: [{ name: 'Notes, attachments and Google Keep notes', extensions: ['md', 'markdown', 'mdx', 'txt', 'json', 'pdf', 'xlsx', 'xls', 'hwp', 'hwpx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'] }],
  });
  return picked === null ? null : (Array.isArray(picked) ? picked : [picked]);
}

export async function pickFolders(): Promise<string[] | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: true });
  return picked === null ? null : (Array.isArray(picked) ? picked : [picked]);
}

export const listFolder = (root: string) => invoke<string[]>('list_folder', { root });

export async function pickSavePath(name: string, ext: string): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({ defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
}

export const importAsset = (src: string) => invoke<string>('import_asset', { src });

export const savePdf = (out: string, margin = 24) => invoke<void>('save_pdf', { out, margin });

export const savePng = (out: string, margin = 24, width = 1600) => invoke<void>('save_image', { out, margin, width });

export const files = {
  read: (path: string) => invoke<string>('read_file', { path }),
  write: (path: string, text: string) => invoke<void>('write_file', { path, text }),
  async onOpen(cb: (paths: string[]) => void) {
    if (!isTauri) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string[]>('open-files', (e) => cb(e.payload));
    const pending = await invoke<string[]>('take_pending_files');
    if (pending.length) cb(pending);
  },
};

export const links = {
  async onOpen(cb: (url: string) => void) {
    if (!desktop) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('open-link', (e) => cb(e.payload));
    const pending = await invoke<string | null>('take_pending_link');
    if (pending) cb(pending);
  },
};

export const inbox = {
  async onAsk(cb: (texts: string[], answer: (ask: string, reply: { ok: boolean; text: string }) => void) => void | Promise<void>) {
    if (!desktop) return;
    const { listen } = await import('@tauri-apps/api/event');
    const answer = (ask: string, reply: { ok: boolean; text: string }) => void invoke('answer_inbox', { ask, reply: JSON.stringify(reply) });
    const take = async () => { const texts = await invoke<string[]>('take_inbox'); if (texts.length) cb(texts, answer); };
    await listen('inbox', () => void take());
    await take();
  },
};

export const defaultApp = {
  get: () => (desktop ? invoke<boolean>('is_default_for_markdown') : Promise.resolve(false)),
  set: (on: boolean) => (isTauri ? invoke<void>('set_default_for_markdown', { on }) : Promise.reject(new Error('desktop only'))),
};

export interface McpClient { id: string; name: string; installed: boolean; connected: boolean; stale: boolean }
export const mcp = {
  clients: () => (desktop ? invoke<McpClient[]>('mcp_clients') : Promise.resolve([] as McpClient[])),
  connect: (on: boolean) => (desktop ? invoke<McpClient[]>('mcp_connect', { on }) : Promise.reject(new Error('desktop only'))),
};

export const autostart = {
  async get() { if (!desktop) return false; return (await import('@tauri-apps/plugin-autostart')).isEnabled(); },
  async set(on: boolean, dev = import.meta.env.DEV) {
    if (!desktop || dev) return;
    const m = await import('@tauri-apps/plugin-autostart');
    await (on ? m.enable() : m.disable());
  },
  async keep(dev = import.meta.env.DEV) {
    if (!desktop || dev) return;
    if (!localStorage.getItem('eve.autostart.init')) {
      await autostart.set(true, dev).finally(() => localStorage.setItem('eve.autostart.init', '1'));
    } else if (await autostart.get()) await autostart.set(true, dev);
  },
};

export const dock = {
  get hidden() { return localStorage.getItem('eve.dock') !== 'shown'; },
  async set(hidden: boolean) {
    localStorage.setItem('eve.dock', hidden ? 'hidden' : 'shown');
    if (desktop) await invoke('set_dock_hidden', { hidden });
  },
};

async function show() {
  // shown but not yet seen: WebKit may have thrown away what the page drew while Eve was hidden, and the window
  // came up white until the page had drawn again. Rust asks for it (`eve-reveal`, onReveal below), as it does for
  // a window brought up by a link from another app
  await invoke<void>('summon_window');
  // the webview can come back with nothing focused; App puts the caret back (window 'focus' alone
  // is not dependable here — the webview may already hold focus while the app was hidden)
  window.dispatchEvent(new Event('eve-summon'));
}
/**
 * A note's page fading in, not when no one is looking: begun in a window hidden or behind another app (the page loaded
 * again while Eve was away, a note opened from elsewhere), WebKit kept it at its first frame, and the note stayed a
 * white page under the crumbs (a scroll or a click did not bring it) until another note was opened and this one again.
 */
export const seenFade = (duration: number) => ({ duration: document.hidden || !document.hasFocus() ? 0 : duration });
export function endFades() {
  for (const el of document.querySelectorAll<HTMLElement>('main .page, aside li')) {
    for (const a of el.getAnimations?.() ?? []) try { a.finish(); } catch { }
  }
}
/**
 * The note's pane drawn again as the window comes back. WebKit at times shows a window brought back from hidden with
 * what scrolls in it undrawn: the crumbs over it there, the note a white page under them, until it was scrolled. A
 * layer of its own for the page's text for a frame did not always do it; a scroll does, so each scroller is moved by a
 * pixel and, a frame later, back by as much (not to where it was: the caret brought into sight meanwhile stays there).
 * Not a page with a diagram on the whole screen, which a transform around it would shrink to the page's size.
 */
export function redrawPanes() {
  endFades();
  const panes = [...document.querySelectorAll<HTMLElement>('main .tiptap, .card-page .tiptap, aside')].filter((el) => !el.querySelector('.dblock.full'));
  for (const el of panes) el.style.transform = 'translateZ(0)';
  const moved = [...document.querySelectorAll<HTMLElement>('.scroll, .card-scroll, aside .tree')]
    .filter((el) => el.scrollHeight > el.clientHeight)
    .map((el) => { const d = el.scrollTop > 0 ? -1 : 1; el.scrollTop += d; return [el, d] as const; });
  requestAnimationFrame(() => {
    for (const [el, d] of moved) el.scrollTop -= d;
    requestAnimationFrame(() => { for (const el of panes) el.style.transform = ''; });
  });
}
export async function revealWhenDrawn(n: number) {
  await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
  await invoke<void>('reveal_window', { n });
  requestAnimationFrame(redrawPanes);
}
if (desktop) void import('@tauri-apps/api/event').then(({ listen }) => listen<number>('eve-reveal', (e) => void revealWhenDrawn(e.payload)));
let ground = '';
export async function paintGround() {
  if (!desktop) return;
  const m = getComputedStyle(document.documentElement).backgroundColor.match(/\d+/g);
  if (!m || m.join() === ground) return;
  ground = m.join();
  const [r, g, b] = m.map(Number);
  await invoke<void>('set_ground', { r, g, b });
}
async function dismiss() {
  document.dispatchEvent(new Event('visibilitychange'));
  // a half-typed 한글 syllable would otherwise still be composing when the window comes back, and a
  // composing view reads no keystroke at all (App ends it on the way in too, for the paths with no blur)
  for (const pm of document.querySelectorAll('.tiptap')) pm.dispatchEvent(new CompositionEvent('compositionend', { data: '' }));
  await invoke<void>('hide_app');
}
export const win = {
  toggle: async () => { if (!desktop) return; (await invoke<boolean>('is_front')) ? dismiss() : show(); },
  hide: () => (desktop ? dismiss() : Promise.resolve()),
};

export async function setWindowSize(width: number, height: number): Promise<void> {
  if (!desktop) return;
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}

let immersed = false;
export const ownWholeScreen = () => desktop || !!android()?.immersive;
export async function wholeScreen(on: boolean): Promise<boolean> {
  // a phone: its status and navigation bars hidden (its webview has no fullscreen of its own: the page's was refused)
  const a = android();
  if (a?.immersive) { if (immersed === on) return false; a.immersive(on); immersed = on; return true; }
  if (!desktop) return false;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const w = getCurrentWindow();
  if ((await w.isFullscreen()) === on) return false;
  await w.setFullscreen(on);
  return true;
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

/** Android's back button. Only while `cb` is registered does back stay in the app; unregistered, it leaves. */
export async function onBack(cb: () => void): Promise<() => void> {
  const { onBackButtonPress } = await import('@tauri-apps/api/app');
  const l = await onBackButtonPress(cb);
  return () => void l.unregister();
}

export async function setGlobalHotkey(keys: string, dev = import.meta.env.DEV): Promise<string | null> {
  if (!desktop || dev) return null;
  const gs = await import('@tauri-apps/plugin-global-shortcut');
  await gs.unregisterAll();
  if (!keys) return null;
  try {
    await gs.register(toTauriAccelerator(keys), (e) => {
      if (e.state === 'Pressed') win.toggle();
    });
    return null;
  } catch (e) {
    return String(e);
  }
}

export function toTauriAccelerator(keys: string): string {
  return keys
    .split('-')
    .map((p) => (p === 'Mod' ? 'CmdOrCtrl' : p.length === 1 ? p.toUpperCase() : p))
    .join('+');
}
