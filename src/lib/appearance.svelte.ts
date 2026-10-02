/** Theme + editor typography, applied on <html> (data-theme and CSS variables). Persisted locally. */
import { setWindowSize, isMobile } from './platform';
const LS = 'eve.appearance';

export const FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'system', label: 'System (SF Pro)', stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif" },
  { id: 'serif', label: 'Serif (New York)', stack: "ui-serif, 'New York', 'Iowan Old Style', Georgia, serif" },
  { id: 'rounded', label: 'Rounded (SF Rounded)', stack: "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif" },
  { id: 'mono', label: 'Monospace (SF Mono)', stack: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { id: 'custom', label: 'Custom…', stack: '' },
];

export const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const;
export type Theme = (typeof THEMES)[number][0];

interface Appearance {
  theme: Theme; font: string; custom: string; size: number; lineHeight: number; width: number;
  /** close the sidebar as soon as you start writing (typing or arrowing in the editor). Off unless asked
   *  for: it replaces `hideSidebarOnEdit`, which was on by default and saved with every other setting,
   *  so a new name is what lets every device start from off */
  closeSidebarOnWrite: boolean;
  /** give a new or imported note an icon of its own, so the list reads at a glance */
  autoIcon: boolean;
  /** a note per day, opened from the calendar (lib/daily.ts); its template is a note (DAILY_TEMPLATE_ID) */
  dailyNotes: boolean;
  /** a nudge at `reminderAt` (HH:MM, local) when today's daily note is still unwritten */
  dailyReminder: boolean; reminderAt: string;
  /** a phone's widget lists the daily notes too (off: only notes) */
  dailyInWidget: boolean;
  /** the size the window opens at; changing it resizes the window there and then, as a preview of itself */
  winW: number; winH: number;
}
// the window's own defaults match tauri.conf.json, so a fresh install never resizes on launch
// A phone starts from bigger type. Appearance lives in this device's localStorage and never syncs, so a
// phone and a Mac each keep their own.
const DEFAULTS: Appearance = { theme: 'system', font: 'system', custom: '', size: isMobile ? 17 : 15, lineHeight: isMobile ? 1.65 : 1.6, width: 820, closeSidebarOnWrite: false, autoIcon: true, dailyNotes: false, dailyReminder: false, reminderAt: '21:00', dailyInWidget: false, winW: 1104, winH: 832 };

function load(): Appearance {
  try {
    const { hideSidebarOnEdit: _, ...saved } = JSON.parse(localStorage.getItem(LS) ?? '{}'); // the old name, dropped
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

class AppearanceStore {
  s = $state<Appearance>(load());
  get stack() { return this.s.font === 'custom' ? this.s.custom || DEFAULTS.font : FONTS.find((f) => f.id === this.s.font)?.stack ?? FONTS[0].stack; }
  set(patch: Partial<Appearance>) { Object.assign(this.s, patch); localStorage.setItem(LS, JSON.stringify(this.s)); }
  /** Appearance's own Reset: how notes look (theme, type, text), not what the app does (daily notes, window…) */
  reset() {
    const { theme, font, custom, size, lineHeight, width } = DEFAULTS;
    this.set({ theme, font, custom, size, lineHeight, width });
  }
  /** call once; keeps <html> in sync */
  apply() {
    $effect(() => {
      document.documentElement.dataset.theme = this.s.theme; // app.css pins color-scheme for light/dark
      const r = document.documentElement.style;
      r.setProperty('--font-editor', this.stack);
      r.setProperty('--font-size', `${this.s.size}px`);
      r.setProperty('--line-height', String(this.s.lineHeight));
      r.setProperty('--editor-width', `${this.s.width}px`);
    });
    // the remembered window size, on every launch and again whenever it is changed
    $effect(() => { void setWindowSize(this.s.winW, this.s.winH); });
  }
}

export const appearance = new AppearanceStore();
