import { findUpdate, type Update } from './update';
import { isMobile, isTauri, onWindowFocus, widget } from './platform';
import { ui, errorText } from './ui.svelte';

const EVERY = 3 * 60 * 60 * 1000;
export const FRESH = 10 * 60 * 1000;
const target = isMobile ? 'android' : 'mac';
export const BY_HAND = 'brew reinstall --cask happy-nut/tap/eve';

class Updates {
  available = $state<Update | null>(null);
  state = $state<'' | 'permission' | 'downloading' | 'installing' | 'brew' | 'restarting' | 'error'>('');
  progress = $state(-1);
  message = $state('');
  current = $state('');
  checking = $state(false);
  failed = $state(false);
  reason = $state('');
  checked = $state(0);

  async check(force = false, maxAge = EVERY) {
    if (!isTauri || this.checking || (!force && Date.now() - this.checked < maxAge)) return;
    this.checked = Date.now();
    this.checking = true;
    const shown = new Promise((r) => setTimeout(r, 600));
    try {
      if (!this.current) this.current = await (await import('@tauri-apps/api/app')).getVersion();
      // the sync's token, when it is github.com's: a signed-in question is not held to 60 an hour
      const { sync } = await import('./sync.svelte');
      const token = sync.settings.host ? '' : sync.settings.token;
      this.available = await findUpdate(this.current, undefined, target, token);
      this.failed = false;
      this.reason = '';
    } catch (err) { this.failed = true; this.reason = err instanceof Error ? err.message : ''; }
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
      await invoke('install_update', { url: u.url, sha256: u.sha256 ?? '', version: u.version });
    } catch (err) {
      this.state = 'error';
      this.message = errorText(err);
      void ui.tell(`Eve ${u.version} could not be installed.\n${this.message}\n\nIn Terminal, this installs it instead:`, BY_HAND);
    }
  }
  get doing(): string {
    switch (this.state) {
      case 'downloading': return `Downloading${this.available ? ` ${this.available.version}` : ''}…${this.progress >= 0 ? ` ${this.progress}%` : ''}`;
      case 'installing': return isMobile ? 'Tap Update on the next screen' : 'Installing…';
      case 'brew': return 'Installing with Homebrew…';
      case 'restarting': return 'Restarting…';
      case 'permission': return 'Allow Eve to install apps, then tap Update again';
      case 'error': return this.message || 'Download failed — try again';
      default: return '';
    }
  }
  get busy() { return this.state === 'downloading' || (!isMobile && (this.state === 'installing' || this.state === 'brew' || this.state === 'restarting')); }
  private report(detail: string) {
    const [state, pct] = detail.split(':');
    this.state = state as Updates['state'];
    this.progress = pct === undefined ? -1 : Number(pct);
  }
  start() {
    if (!isTauri) return;
    if (isMobile) window.addEventListener('eve-update', (e) => this.report(String((e as CustomEvent<string>).detail)));
    else void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('eve-update', (e) => this.report(e.payload)));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(false, FRESH); });
    // the Mac stays open for days, hidden rather than quit: asked again each time it is summoned (the page's
    // visibility does not change for a hidden app), and every few hours besides
    if (!isMobile) {
      onWindowFocus(() => void this.check(false, FRESH));
      setInterval(() => void this.check(), EVERY);
    }
    void this.check(true);
  }
}

export const updates = new Updates();
