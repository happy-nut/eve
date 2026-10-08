/**
 * Mermaid diagrams (a ```mermaid code block drawn as its picture). The library is the biggest thing the app could
 * load, so it comes only with the first diagram shown, as the code grammars do (code.ts).
 */
type Mermaid = typeof import('mermaid').default;
let lib: Promise<Mermaid> | null = null;
let theme = '';
let seq = 0;

const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
};

/** The note's own colours (app.css :root), as mermaid needs them: plain hex, light or dark. */
const PALETTE = {
  light: {
    fg: '#33363d', dim: '#7c8089', bg: '#ffffff', node: '#eef6ff', border: '#9fd0ff', line: '#a3a8b0', soft: '#f5f6f8',
    second: '#f3efff', third: '#ecf8f4', note: '#fff8e0', noteLine: '#f0d68a', accent: '#1e9bff',
    scale: ['#1e9bff', '#2fb8a4', '#8b6ee8', '#f29b45', '#ef6b73', '#e3b92e', '#4cc2e8', '#7cbf5a', '#d86fb5', '#6a83f0', '#c88a5c', '#59a9a0'],
  },
  dark: {
    fg: '#d3d6dc', dim: '#8b909a', bg: '#0b0c10', node: '#12263a', border: '#2f6f9f', line: '#5d636d', soft: '#15171c',
    second: '#211c38', third: '#11291f', note: '#2a2512', noteLine: '#6b5a24', accent: '#3fc1ff',
    scale: ['#3fc1ff', '#3fd1b8', '#a08bff', '#ffab5e', '#ff7a82', '#f0cd4a', '#6cd6f5', '#8fd16b', '#ec86c8', '#8399ff', '#dba070', '#6cc4ba'],
  },
};
export const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif";

function config(mode: 'light' | 'dark') {
  const c = PALETTE[mode];
  const scale = Object.fromEntries(c.scale.flatMap((v, i) => [[`cScale${i}`, v], [`cScaleLabel${i}`, '#ffffff'], [`cScaleInv${i}`, c.line], [`cScalePeer${i}`, v], [`pie${i + 1}`, v]]));
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    theme: 'base' as const,
    look: 'classic' as const,
    // shapes are drawn through rough.js even unrough, with random points along their straight lines: one seed, and
    // a diagram is drawn the same every time (the builder's preview and the note, to the byte)
    handDrawnSeed: 1,
    fontFamily: FONT,
    // softer corners than mermaid draws: a box of the note's, not a form's
    themeCSS: `.node rect.basic, .node rect.label-container, rect.actor { rx: 8px; ry: 8px; } .edgeLabel, .edgeLabel p { font-size: 13px; }
      .labelBkg { background: transparent; } .lineWrapper line { stroke: ${c.line}; stroke-width: 2px; } [id$='arrowhead'] path { fill: ${c.line}; }
      .grid .tick line { stroke: ${c.line}; opacity: 0.3; } .grid path { stroke-width: 0; } .grid .tick text { fill: ${c.dim}; }`,
    themeVariables: {
      darkMode: mode === 'dark', fontFamily: FONT, fontSize: '14px', background: c.bg,
      primaryColor: c.node, primaryTextColor: c.fg, primaryBorderColor: c.border,
      secondaryColor: c.second, secondaryTextColor: c.fg, secondaryBorderColor: c.border,
      tertiaryColor: c.third, tertiaryTextColor: c.fg, tertiaryBorderColor: c.border,
      mainBkg: c.node, nodeBorder: c.border, nodeTextColor: c.fg, textColor: c.fg, titleColor: c.fg,
      lineColor: c.line, edgeLabelBackground: c.bg, clusterBkg: c.soft, clusterBorder: c.border,
      noteBkgColor: c.note, noteBorderColor: c.noteLine, noteTextColor: c.fg,
      actorBkg: c.node, actorBorder: c.border, actorTextColor: c.fg, actorLineColor: c.line,
      signalColor: c.dim, signalTextColor: c.fg, labelBoxBkgColor: c.node, labelBoxBorderColor: c.border,
      labelTextColor: c.fg, loopTextColor: c.fg, activationBkgColor: c.second, activationBorderColor: c.border,
      sequenceNumberColor: '#ffffff',
      pieStrokeColor: c.bg, pieStrokeWidth: '2px', pieOuterStrokeWidth: '0px', pieOpacity: '1',
      pieTitleTextColor: c.fg, pieSectionTextColor: '#ffffff', pieLegendTextColor: c.fg, pieTitleTextSize: '16px',
      sectionBkgColor: c.soft, altSectionBkgColor: c.bg, sectionBkgColor2: c.soft, gridColor: c.soft,
      taskBkgColor: c.accent, taskBorderColor: c.accent, taskTextColor: '#ffffff', taskTextOutsideColor: c.fg,
      taskTextLightColor: '#ffffff', taskTextDarkColor: c.fg, activeTaskBkgColor: c.scale[1], activeTaskBorderColor: c.scale[1],
      doneTaskBkgColor: c.line, doneTaskBorderColor: c.line, critBkgColor: c.scale[4], critBorderColor: c.scale[4],
      todayLineColor: c.scale[4], excludeBkgColor: c.soft,
      ...scale,
    },
    flowchart: { curve: 'basis' as const, padding: 14, nodeSpacing: 44, rankSpacing: 52 },
    sequence: { mirrorActors: false, actorMargin: 60, messageMargin: 40, boxMargin: 8, noteMargin: 12 },
    gantt: { useWidth: 680, barHeight: 24, barGap: 6, topPadding: 44, leftPadding: 90, fontSize: 13, sectionFontSize: 13, axisFormat: '%m/%d' },
    pie: { textPosition: 0.72 },
    mindmap: { padding: 14 },
  };
}

function load(): Promise<Mermaid> {
  lib ??= import('mermaid').then((m) => m.default, (e) => { lib = null; throw e; }); // failed: the next diagram tries again
  return lib.then((m) => {
    // in the note's colours, light or dark; strict: a diagram's labels are text, never script or a link that runs
    const want = dark() ? 'dark' : 'light';
    if (want !== theme) {
      theme = want;
      m.initialize(config(want));
    }
    return m;
  });
}

/** One drawing at a time: mermaid's render is not made to run beside another (a note with three diagrams left the
 *  third undrawn). */
let queue: Promise<unknown> = Promise.resolve();
export function renderMermaid(code: string): Promise<{ svg: string } | { error: string }> {
  const next = queue.then(() => draw(code));
  queue = next.catch(() => {});
  return next;
}

/** The diagram's SVG, or the reason it could not be drawn. */
async function draw(code: string): Promise<{ svg: string } | { error: string }> {
  if (!code.trim()) return { error: 'An empty diagram' };
  try {
    const m = await load();
    const { svg } = await m.render(`eve-mermaid-${++seq}`, code);
    return { svg };
  } catch (e) {
    // mermaid leaves its error drawing in the page when a render fails
    document.querySelectorAll(`#deve-mermaid-${seq}, #eve-mermaid-${seq}`).forEach((el) => el.remove());
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.split('\n').slice(0, 3).join('\n') };
  }
}

/** the theme to draw in changed (Settings, or the system's dark mode): diagrams drawn again */
export const themeKey = () => (dark() ? 'dark' : 'light');

/** the colour mermaid gives a pie's `i`th slice (the builder's swatches) */
export const sliceColor = (i: number) => PALETTE[themeKey()].scale[i % 12];
