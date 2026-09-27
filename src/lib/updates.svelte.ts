import { findUpdate } from './update';
import { isMobile, isTauri, widget } from './platform';

/**
 * The phone's own updates: looked for at launch and when the app comes back (at most every few hours),
 * offered in the list, installed with one tap (plus the system's own "Update").
 */
const EVERY = 3 * 60 * 60 * 1000;

class Updates {
  available = $state<{ version: string; url: string } | null>(null);
  state = $state<'' | 'permission' | 'downloading' | 'installing' | 'error'>('');
  current = $state('');
  private checked = 0;

  async check(force = false) {
    if (!isMobile || !isTauri || (!force && Date.now() - this.checked < EVERY)) return;
    this.checked = Date.now();
    try {
      if (!this.current) this.current = await (await import('@tauri-apps/api/app')).getVersion();
      this.available = await findUpdate(this.current);
    } catch { /* offline: next time */ }
  }
  install() {
    if (!this.available) return;
    this.state = 'downloading';
    widget.installUpdate(this.available.url);
  }
  start() {
    if (!isMobile) return;
    window.addEventListener('eve-update', (e) => { this.state = (e as CustomEvent<Updates['state']>).detail; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(); });
    void this.check(true);
  }
}

export const updates = new Updates();
