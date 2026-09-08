/** Theme + editor typography, applied on <html> (data-theme and CSS variables). Persisted locally. */
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

interface Appearance { theme: Theme; font: string; custom: string; size: number; lineHeight: number; width: number }
const DEFAULTS: Appearance = { theme: 'system', font: 'system', custom: '', size: 15, lineHeight: 1.6, width: 820 };

function load(): Appearance {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}

class AppearanceStore {
  s = $state<Appearance>(load());
  get stack() { return this.s.font === 'custom' ? this.s.custom || DEFAULTS.font : FONTS.find((f) => f.id === this.s.font)?.stack ?? FONTS[0].stack; }
  set(patch: Partial<Appearance>) { Object.assign(this.s, patch); localStorage.setItem(LS, JSON.stringify(this.s)); }
  reset() { this.set({ ...DEFAULTS }); }
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
  }
}

export const appearance = new AppearanceStore();
