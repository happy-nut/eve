import { findUpdate, type Update } from './update';
import { isMobile, isTauri, widget } from './platform';

/**
 * Eve's own updates, on the phone and the Mac: looked for at launch and when the app comes back (at most
 * every few hours), offered in the list, installed with one tap. The phone hands the APK to Android's
 * installer (plus the system's own "Update"); the Mac downloads its zip, checks it and swaps itself for
 * the new app, then starts again (src-tauri/src/update.rs).
 */
const EVERY = 3 * 60 * 60 * 1000;
const target = isMobile ? 'android' : 'mac';

class Updates {
  available = $state<Update | null>(null);
  state = $state<'' | 'permission' | 'downloading' | 'installing' | 'restarting' | 'error'>('');
  /** how much of the download is done while downloading (-1 until the first report) */
  progress = $state(-1);
  /** what went wrong, when the Mac says (the phone only reports that it failed) */
  message = $state('');
  current = $state('');
  /** Settings' Check button: busy while asking, then what came of it */
  checking = $state(false);
  failed = $state(false);
  private checked = 0;

  async check(force = false) {
    if (!isTauri || this.checking || (!force && Date.now() - this.checked < EVERY)) return;
    this.checked = Date.now();
    this.checking = true;
    // long enough to be seen: an answer in 80 ms would look like the button did nothing
    const shown = new Promise((r) => setTimeout(r, 600));
    try {
      if (!this.current) this.current = await (await import('@tauri-apps/api/app')).getVersion();
      this.available = await findUpdate(this.current, undefined, target);
      this.failed = false;
    } catch { this.failed = true; /* offline: next time */ }
    await shown;
    this.checking = false;
  }
  async install() {
    const u = this.available;
    if (!u || this.busy) return;
    this.state = 'downloading';
    this.progress = -1;
    this.message = '';
    if (isMobile) return widget.installUpdate(u.url);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // on success the app quits and the new one starts: nothing comes back
      await invoke('install_update', { url: u.url, sha256: u.sha256 ?? '', version: u.version });
    } catch (err) {
      this.state = 'error';
      this.message = String(err);
    }
  }
  /** what an update under way is doing, for the list and Settings ('' when none is) */
  get doing(): string {
    switch (this.state) {
      case 'downloading': return `Downloading${this.available ? ` ${this.available.version}` : ''}…${this.progress >= 0 ? ` ${this.progress}%` : ''}`;
      case 'installing': return isMobile ? 'Tap Update on the next screen' : 'Installing…';
      case 'restarting': return 'Restarting…';
      case 'permission': return 'Allow Eve to install apps, then tap Update again';
      case 'error': return this.message || 'Download failed — try again';
      default: return '';
    }
  }
  /** the Update button waits while the update is under way (on the phone only while downloading: a
   *  cancelled installer screen needs the button again) */
  get busy() { return this.state === 'downloading' || (!isMobile && (this.state === 'installing' || this.state === 'restarting')); }
  private report(detail: string) {
    const [state, pct] = detail.split(':');
    this.state = state as Updates['state'];
    this.progress = pct === undefined ? -1 : Number(pct);
  }
  start() {
    if (!isTauri) return;
    if (isMobile) window.addEventListener('eve-update', (e) => this.report(String((e as CustomEvent<string>).detail)));
    else void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('eve-update', (e) => this.report(e.payload)));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(); });
    // the Mac stays open for days, hidden rather than quit
    if (!isMobile) setInterval(() => void this.check(), EVERY);
    void this.check(true);
  }
}

export const updates = new Updates();
