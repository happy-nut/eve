/** Theme + editor typography, applied on <html> (data-theme and CSS variables). Persisted locally. */
import { setWindowSize, isMobile, paintGround } from './platform';
import codeThemes from './codeThemes.json';
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

/** how a presentation turns its page (Settings → Appearance → Presenting) */
export const SLIDE_TURNS = [['push', 'Slide'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['none', 'None']] as const;
export type SlideTurn = (typeof SLIDE_TURNS)[number][0];
/** the colours code is written in (Settings → Appearance → Code): each a light and a dark set, all read on a code block
 *  at 4.5:1 (contrast.test.mjs); Eve's own is app.css's --hl-* */
export const CODE_THEMES = Object.entries(codeThemes).map(([id, t]) => [id, t.name] as const);
const HL = ['key', 'str', 'num', 'fn', 'var'] as const;
/** each --hl-* a theme sets on the page, both its sets so light and dark still follow; null: app.css's own (Eve's) */
export function codeColors(id: string): Record<string, string | null> {
  const t = (codeThemes as Record<string, { light: Record<string, string>; dark: Record<string, string> }>)[id];
  return Object.fromEntries(HL.map((k) => [`--hl-${k}`, t && id !== 'eve' ? `light-dark(${t.light[k]}, ${t.dark[k]})` : null]));
}

interface Appearance {
  theme: Theme; font: string; custom: string; size: number; lineHeight: number; width: number;
  /** close the sidebar as soon as you start writing (typing in the editor; the arrows only read). Off unless asked
   *  for: it replaces `hideSidebarOnEdit`, which was on by default and saved with every other setting,
   *  so a new name is what lets every device start from off */
  closeSidebarOnWrite: boolean;
  /** give a new or imported note an icon of its own, so the list reads at a glance */
  autoIcon: boolean;
  /** a note per day, opened from the calendar (lib/daily.ts); its template is a note (DAILY_TEMPLATE_ID) */
  dailyNotes: boolean;
  /** a nudge at `reminderAt` (HH:MM, local) when today's daily note is still unwritten */
  dailyReminder: boolean; reminderAt: string;
  /** the system's spelling help in the note: misspellings underlined, words corrected and a sentence's first letter
   *  capitalised as you type. Off unless asked for: a note is code, lists and half-sentences as often as prose, and
   *  "git" became "Git" at the start of every line */
  autoCorrect: boolean;
  /** chosen table cells that take in the header row copy as a markdown table (off: a tab between cells) */
  tableCopyMarkdown: boolean;
  /** the highlighter's pens, as #rrggbb (Settings → Highlighter): the first is the plain one, written ==text== and
   *  drawn in it; a word marked with another is written with its colour in the note (highlight.ts) */
  highlights: string[];
  /** a phone's widget lists the daily notes too (off: only notes) */
  dailyInWidget: boolean;
  /** ⌘+ / ⌘-: px on top of `size` for now, remembered apart from it, so ⌘0 goes back to what Settings says */
  zoom: number;
  /** the size the window opens at; changing it resizes the window there and then, as a preview of itself */
  winW: number; winH: number;
  /** a presentation's page turn, and whether a slide's lines come in one after another as it is put up */
  slideTurn: SlideTurn; slideBuild: boolean;
  /** a CODE_THEMES id */
  codeTheme: string;
}
// the window's own defaults match tauri.conf.json, so a fresh install never resizes on launch
// A phone starts from bigger type. Appearance lives in this device's localStorage and never syncs, so a
// phone and a Mac each keep their own.
/** soft pastel pens: butter, mint, sky, blush, lilac */
export const PASTELS = ['#fff1a8', '#c9f2d4', '#cfe3ff', '#ffd6e3', '#e5d8ff'];
/** the note's text size, px: the Size slider's range, and where ⌘+ / ⌘- stop */
export const SIZE_MIN = 12, SIZE_MAX = 28;
/** ⌘+ / ⌘-'s steps, a browser's */
const ZOOMS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const DEFAULTS: Appearance = { theme: 'system', font: 'system', custom: '', size: isMobile ? 17 : 15, lineHeight: isMobile ? 1.65 : 1.6, width: 900, zoom: 0, closeSidebarOnWrite: false, autoIcon: true, autoCorrect: false, tableCopyMarkdown: true, highlights: [...PASTELS], dailyNotes: false, dailyReminder: false, reminderAt: '21:00', dailyInWidget: false, winW: 1104, winH: 832, slideTurn: 'push', slideBuild: true, codeTheme: 'eve' };

function load(): Appearance {
  try {
    const { hideSidebarOnEdit: _, ...saved } = JSON.parse(localStorage.getItem(LS) ?? '{}'); // the old name, dropped
    // every setting is saved whenever one is, so 820 is mostly the old default carried along, not a width anyone chose:
    // it gives way to the new one (900, Notion's 708px of text)
    if (saved.width === 820) delete saved.width;
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

class AppearanceStore {
  s = $state<Appearance>(load());
  // Custom with no font named yet: the system font's stack. It fell back to the word "system", which is no font
  // at all, and the note came out in the webview's default serif.
  get stack() { return (this.s.font === 'custom' ? this.s.custom.trim() : FONTS.find((f) => f.id === this.s.font)?.stack) || FONTS[0].stack; }
  set(patch: Partial<Appearance>) { Object.assign(this.s, patch); localStorage.setItem(LS, JSON.stringify(this.s)); }
  /** the note's text size as shown: the Settings size and the ⌘+ / ⌘- steps on it */
  get textPx() { return Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.s.size + this.s.zoom)); }
  /** the page's width as shown: Settings' width, wider or narrower with the ⌘+ / ⌘- steps as a browser zooms (the text
   *  grew in a page that did not, and each step left fewer words a line) */
  get widthPx() { return Math.round((this.s.width * this.textPx) / Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.s.size))); }
  /**
   * ⌘+ / ⌘- / ⌘0: the note's text a step larger or smaller, or back to the size Settings has. A step is a browser's
   * (110%, 125%, 150%… of that size, within the Size slider's range): it was 1px, and 15 to 16 hardly showed. The steps
   * are the keys' own, on top of that size: ⌘0 set Settings' size to the default, and the size chosen there was lost to
   * a key pressed to read something small.
   */
  textSize(step: 1 | -1 | 0): number {
    const sizes = ZOOMS.map((f) => Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.s.size)) * f));
    const next = step > 0 ? sizes.find((p) => p > this.textPx) : sizes.reverse().find((p) => p < this.textPx);
    const px = step ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, next ?? this.textPx)) : this.s.size;
    this.set({ zoom: px - this.s.size });
    return this.textPx;
  }
  /** Appearance's own Reset: how notes look (theme, type, text), not what the app does (daily notes, window…) */
  reset() {
    const { theme, font, custom, size, lineHeight, width, zoom, codeTheme } = DEFAULTS;
    this.set({ theme, font, custom, size, lineHeight, width, zoom, codeTheme });
  }
  /** call once; keeps <html> in sync */
  apply() {
    $effect(() => {
      document.documentElement.dataset.theme = this.s.theme; // app.css pins color-scheme for light/dark
      const r = document.documentElement.style;
      r.setProperty('--font-editor', this.stack);
      r.setProperty('--font-size', `${this.textPx}px`);
      r.setProperty('--line-height', String(this.s.lineHeight));
      r.setProperty('--editor-width', `${this.widthPx}px`);
      r.setProperty('--hl-plain', this.s.highlights[0] ?? PASTELS[0]); // the ==plain== pen (app.css, .tiptap mark)
      // code's colours: another theme's over app.css's own (Eve's)
      for (const [k, v] of Object.entries(codeColors(this.s.codeTheme))) { if (v) r.setProperty(k, v); else r.removeProperty(k); }
      void paintGround();
    });
    // a theme that follows the system changes with it, and the window's ground with it
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void paintGround());
    // the remembered window size, on every launch and again whenever it is changed
    $effect(() => { void setWindowSize(this.s.winW, this.s.winH); });
  }
}

export const appearance = new AppearanceStore();
