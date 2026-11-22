import { setWindowSize, isMobile, paintWindowBackground } from './platform';
import codeThemes from './codeThemes.json';
import tauriConf from '../../src-tauri/tauri.conf.json';
import { saved, save } from './stored';
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

export const CODE_SHADES = [['auto', 'Follow theme'], ['light', 'Light'], ['dark', 'Dark']] as const;
export type CodeShade = (typeof CODE_SHADES)[number][0];

export const SLIDE_TURNS = [['push', 'Slide'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['none', 'None']] as const;
export type SlideTurn = (typeof SLIDE_TURNS)[number][0];
export const CODE_THEMES = Object.entries(codeThemes).map(([id, t]) => [id, t.name] as const);
const HL = ['key', 'str', 'num', 'fn', 'var'] as const;
/** each --hl-* a theme sets on the page, both its sets so light and dark still follow; null: app.css's own (Eve's) */
export function codeColors(id: string): Record<string, string | null> {
  const t = (codeThemes as Record<string, { light: Record<string, string>; dark: Record<string, string> }>)[id];
  return Object.fromEntries(HL.map((k) => [`--hl-${k}`, t && id !== 'eve' ? `light-dark(${t.light[k]}, ${t.dark[k]})` : null]));
}

interface Appearance {
  theme: Theme; font: string; custom: string; size: number; lineHeight: number; width: number;
  weight: number;
  closeSidebarOnWrite: boolean;
  autoIcon: boolean;
  dailyNotes: boolean;
  dailyReminder: boolean; reminderAt: string;
  autoCorrect: boolean;
  tableCopyMarkdown: boolean;
  highlights: string[];
  dailyInWidget: boolean;
  zoom: number;
  winW: number; winH: number;
  summon: boolean;
  slideTurn: SlideTurn; slideBuild: boolean;
  codeTheme: string;
  codeShade: CodeShade;
}
export const PASTELS = ['#fff1a8', '#c9f2d4', '#cfe3ff', '#ffd6e3', '#e5d8ff'];
export const SIZE_MIN = 12, SIZE_MAX = 28;
export const WEIGHT_MIN = 300, WEIGHT_MAX = 600;
export const weightName = (w: number): string => ({ 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold' })[w] ?? String(w);
const ZOOMS = [0.5, 0.58, 0.67, 0.73, 0.8, 0.9, 1, 1.12, 1.25, 1.37, 1.5, 1.73, 2, 2.24, 2.5, 2.74, 3], ZOOM_MIN = 9, ZOOM_MAX = 48;
const [MAIN_WINDOW] = tauriConf.app.windows;
const OLD_DEFAULT_WIDTH = 820;
const DEFAULTS: Appearance = { theme: 'system', font: 'system', custom: '', size: isMobile ? 17 : 15, weight: 400, lineHeight: isMobile ? 1.65 : 1.6, width: 900, zoom: 0, closeSidebarOnWrite: false, autoIcon: true, autoCorrect: false, tableCopyMarkdown: true, highlights: [...PASTELS], dailyNotes: false, dailyReminder: false, reminderAt: '21:00', dailyInWidget: false, winW: MAIN_WINDOW.width, winH: MAIN_WINDOW.height, summon: true, slideTurn: 'push', slideBuild: true, codeTheme: 'eve', codeShade: 'auto' };

function load(): Appearance {
  const { hideSidebarOnEdit: _, ...kept } = saved<Partial<Appearance> & { hideSidebarOnEdit?: unknown }>(LS, {});
  if (kept.width === OLD_DEFAULT_WIDTH) delete kept.width;
  return { ...DEFAULTS, ...kept };
}

class AppearanceStore {
  s = $state<Appearance>(load());
  get stack() { return (this.s.font === 'custom' ? this.s.custom.trim() : FONTS.find((f) => f.id === this.s.font)?.stack) || FONTS[0].stack; }
  set(patch: Partial<Appearance>) { Object.assign(this.s, patch); save(LS, this.s); }
  get textPx() { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.s.size + this.s.zoom)); }
  get smallPx() { return Math.max(ZOOM_MIN, Math.round(this.textPx * 0.875)); }
  get widthPx() { return Math.round((this.s.width * this.textPx) / Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.s.size))); }
  textSize(step: 1 | -1 | 0): number {
    const sizes = ZOOMS.map((f) => Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.s.size)) * f));
    const next = step > 0 ? sizes.find((p) => p >= this.textPx * 1.05) : sizes.reverse().find((p) => p <= this.textPx / 1.05);
    const px = step ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next ?? this.textPx)) : this.s.size;
    this.set({ zoom: px - this.s.size });
    return this.textPx;
  }
  reset(): Partial<Appearance> {
    const keys = ['theme', 'font', 'custom', 'size', 'weight', 'lineHeight', 'width', 'zoom', 'codeTheme', 'codeShade'] as const;
    const was = Object.fromEntries(keys.map((k) => [k, this.s[k]])) as Partial<Appearance>;
    this.set(Object.fromEntries(keys.map((k) => [k, DEFAULTS[k]])) as Partial<Appearance>);
    return was;
  }
  apply() {
    $effect(() => {
      document.documentElement.dataset.theme = this.s.theme;
      document.documentElement.dataset.code = this.s.codeShade;
      const r = document.documentElement.style;
      r.setProperty('--font-editor', this.stack);
      r.setProperty('--font-size', `${this.textPx}px`);
      r.setProperty('--line-height', String(this.s.lineHeight));
      r.setProperty('--font-weight', String(this.s.weight));
      r.setProperty('--editor-width', `${this.widthPx}px`);
      r.setProperty('--hl-plain', this.s.highlights[0] ?? PASTELS[0]);
      for (const [k, v] of Object.entries(codeColors(this.s.codeTheme))) { if (v) r.setProperty(k, v); else r.removeProperty(k); }
      void paintWindowBackground();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void paintWindowBackground());
    $effect(() => { void setWindowSize(this.s.winW, this.s.winH); });
  }
}

export const appearance = new AppearanceStore();
