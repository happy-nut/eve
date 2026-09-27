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
  /** Settings' Check button: busy while asking, then what came of it */
  checking = $state(false);
  failed = $state(false);
  private checked = 0;

  async check(force = false) {
    if (!isMobile || !isTauri || this.checking || (!force && Date.now() - this.checked < EVERY)) return;
    this.checked = Date.now();
    this.checking = true;
    // long enough to be seen: an answer in 80 ms would look like the button did nothing
    const shown = new Promise((r) => setTimeout(r, 600));
    try {
      if (!this.current) this.current = await (await import('@tauri-apps/api/app')).getVersion();
      this.available = await findUpdate(this.current);
      this.failed = false;
    } catch { this.failed = true; /* offline: next time */ }
    await shown;
    this.checking = false;
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
