/**
 * Mermaid diagrams (a ```mermaid code block drawn as its picture). The library is the biggest thing the app could
 * load, so it comes only with the first diagram shown, as the code grammars do (code.ts).
 */
import { chartHtml } from './charts';
import { isMobile } from './platform';

type Mermaid = typeof import('mermaid').default;
let lib: Promise<Mermaid> | null = null;
let theme = '';
let seq = 0;

const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
};

/**
 * The diagrams' look, in the manner of Toss: white cards on a soft grey canvas, one strong blue, quiet grey lines,
 * no frames around what needs none. Plain hex for mermaid; app.css .diagram-canvas holds the same colours as CSS
 * for what Eve draws itself (charts.ts).
 */
const PALETTE = {
  light: {
    fg: '#333d4b', strong: '#191f28', dim: '#8b95a1', canvas: '#f9fafb', node: '#ffffff', border: '#e5e8eb', line: '#c4cad1',
    accent: '#3182f6', head: '#f2f4f6', tint: '#e8f3ff', tintText: '#1b64da', note: '#fff8e6', noteLine: '#ffe2a6', shadow: 'rgba(0,23,51,0.06)',
    hues: ['#3182f6', '#15c39a', '#ff9f2e', '#8b5cf6', '#f04452', '#f5b800', '#4cc3ff', '#5fbf4a', '#ec5fa8', '#6366f1', '#c08457', '#14b8a6'],
  },
  dark: {
    fg: '#e5e8eb', strong: '#f9fafb', dim: '#8b95a1', canvas: '#17181d', node: '#23252b', border: '#2e3138', line: '#4e5560',
    accent: '#4593fc', head: '#2b2e35', tint: '#1c2c45', tintText: '#9cc6ff', note: '#2e2a1d', noteLine: '#5c4f2a', shadow: 'rgba(0,0,0,0.3)',
    hues: ['#4593fc', '#2bd4a9', '#ffae4d', '#a07bff', '#ff6673', '#ffcd3c', '#6cd1ff', '#7ed36a', '#f47dbb', '#8187ff', '#d39a6c', '#3cc9b8'],
  },
};
export const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif";

/** `hex` laid over `over` at `t` (0..1): the soft tints of a hue */
function mix(hex: string, over: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(over)];
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

function config(mode: 'light' | 'dark') {
  const c = PALETTE[mode];
  // a mind map: its centre in solid blue, each branch a soft chip of its own hue with a line of it
  const scale: Record<string, string> = { cScale0: c.accent, cScaleLabel0: '#ffffff', cScaleInv0: c.line, cScalePeer0: c.accent };
  c.hues.slice(1).concat(c.hues[0]).forEach((h, i) => {
    scale[`cScale${i + 1}`] = mix(h, c.node, mode === 'dark' ? 0.24 : 0.14);
    scale[`cScaleLabel${i + 1}`] = mode === 'dark' ? mix(h, '#ffffff', 0.75) : mix(h, '#000000', 0.72);
    scale[`cScaleInv${i + 1}`] = c.line;
    scale[`cScalePeer${i + 1}`] = h;
  });
  c.hues.forEach((h, i) => (scale[`pie${i + 1}`] = h));
  // a git graph's branches and an XY chart's series in the same colours, their labels white on them
  c.hues.slice(0, 8).forEach((h, i) => { scale[`git${i}`] = h; scale[`gitBranchLabel${i}`] = '#ffffff'; scale[`gitInv${i}`] = h; });
  const branches = c.hues.slice(1).concat(c.hues[0]).map((h, i) => `.section-edge-${i} { stroke: ${mix(h, c.canvas, 0.55)}; }`).join(' ');
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    theme: 'base' as const,
    look: 'classic' as const,
    // shapes are drawn through rough.js even unrough, with random points along their straight lines: one seed, and
    // a diagram is drawn the same every time (the builder's preview and the note, to the byte)
    handDrawnSeed: 1,
    fontFamily: FONT,
    themeCSS: `
      /* a flowchart in the database table's calm: white cards on hairlines, the start and end (its pills, the only
         shapes drawn as an outer path with a plain label) a soft grey, a decision a plain white diamond, the lines
         quiet, their labels small chips */
      .node rect.basic, .node rect.label-container, rect.actor, .cluster rect { rx: 12px; ry: 12px; }
      .node .label-container, rect.actor { stroke: ${c.border} !important; stroke-width: 1px !important; filter: drop-shadow(0 1px 1.5px ${c.shadow}); }
      g.node:has(> g.outer-path):has(> g.label):not(:has(> g.label.name)) path { stroke: ${c.border} !important; stroke-width: 1px !important; }
      g.node:has(> g.outer-path):has(> g.label):not(:has(> g.label.name)) path:first-child { fill: ${c.head} !important; }
      g.node:has(> g.outer-path):has(> g.label):not(:has(> g.label.name)) .nodeLabel p { color: ${c.strong}; }
      g.node:has(> polygon) polygon { fill: ${c.node}; stroke: ${c.border}; stroke-width: 1px; }
      g.node:has(> circle) circle { fill: ${c.head}; stroke: ${c.border}; stroke-width: 1px; }
      .nodeLabel, .nodeLabel p { color: ${c.fg}; }
      .cluster rect { fill: ${c.canvas} !important; stroke: ${c.border} !important; stroke-dasharray: 0; }
      .cluster-label .nodeLabel, .cluster-label .nodeLabel p { color: ${c.dim}; font-size: 12px; }
      .flowchart-link { stroke-width: 1.4px; } .marker { fill: ${c.line}; stroke: ${c.line}; }
      .edgeLabel foreignObject { overflow: visible; }
      .edgeLabel, .edgeLabel p { font-size: 12px; color: ${c.dim}; }
      .edgeLabel .labelBkg { background: ${c.node}; border-radius: 6px; box-shadow: 0 0 0 4px ${c.node}, 0 0 0 5px ${c.border}; }
      .edgeLabel .labelBkg:has(.edgeLabel:empty) { box-shadow: none; background: none; }
      .edgeLabel .labelBkg span, .edgeLabel .labelBkg p { background: transparent !important; } /* mermaid's own label fill: only the chip shows */
      .lineWrapper line { stroke: ${c.line}; stroke-width: 2px; } [id$='arrowhead'] path { fill: ${c.line}; }
      .actor-line { stroke-dasharray: 3 4; }
      .mindmap-node .node-bkg { filter: none; } .mindmap-edges path { stroke-width: 2px !important; } ${branches}
      /* a database table (erDiagram): a soft grey header with its name; white rows split by hairlines, the type quiet,
         the keys (PK, FK, UK) small and blue */
      g.node:has(> g.label.name) { clip-path: inset(0 round 12px); }
      g.node:has(> g.label.name) > .outer-path path:first-child { fill: ${c.head}; }
      g.node:has(> g.label.name) > .outer-path path + path { stroke: ${c.border}; stroke-width: 2px; }
      .row-rect-odd path:first-child, .row-rect-even path:first-child { fill: ${c.node}; }
      .row-rect-odd path + path, .row-rect-even path + path { stroke: ${c.border}; stroke-width: 0.8px; }
      g.node:has(> g.label.name) > g.divider { display: none; } /* no column lines: a list, not a spreadsheet */
      g.label.name .nodeLabel p { color: ${c.strong}; font-weight: 600; }
      marker circle { fill: ${c.canvas} !important; stroke: ${c.line} !important; } marker path { stroke: ${c.line}; }
      g.label.attribute-name .nodeLabel p { color: ${c.fg}; }
      g.label.attribute-type .nodeLabel p, g.label.attribute-comment .nodeLabel p { color: ${c.dim}; font-size: 12.5px; }
      g.label.attribute-keys .nodeLabel p { color: ${c.tintText}; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }
      .grid .tick line { stroke: ${c.border}; } .grid path { stroke-width: 0; } .grid .tick text { fill: ${c.dim}; }`,
    themeVariables: {
      darkMode: mode === 'dark', fontFamily: FONT, fontSize: '14px', background: c.canvas,
      primaryColor: c.node, primaryTextColor: c.fg, primaryBorderColor: c.border,
      secondaryColor: c.tint, secondaryTextColor: c.fg, secondaryBorderColor: c.border,
      tertiaryColor: c.canvas, tertiaryTextColor: c.fg, tertiaryBorderColor: c.border,
      mainBkg: c.node, nodeBorder: c.border, nodeTextColor: c.fg, textColor: c.fg, titleColor: c.strong,
      lineColor: c.line, edgeLabelBackground: c.canvas, clusterBkg: mix(c.border, c.canvas, 0.35), clusterBorder: c.border,
      noteBkgColor: c.note, noteBorderColor: c.noteLine, noteTextColor: c.fg,
      actorBkg: c.node, actorBorder: c.border, actorTextColor: c.strong, actorLineColor: c.line,
      signalColor: c.line, signalTextColor: c.fg, labelBoxBkgColor: c.node, labelBoxBorderColor: c.border,
      labelTextColor: c.fg, loopTextColor: c.dim, activationBkgColor: c.tint, activationBorderColor: c.accent,
      sequenceNumberColor: '#ffffff',
      pieStrokeColor: c.canvas, pieStrokeWidth: '2px', pieOuterStrokeWidth: '0px', pieOpacity: '1',
      pieTitleTextColor: c.strong, pieSectionTextColor: '#ffffff', pieLegendTextColor: c.fg, pieTitleTextSize: '16px',
      sectionBkgColor: c.canvas, altSectionBkgColor: c.canvas, sectionBkgColor2: c.canvas, gridColor: c.border,
      taskBkgColor: c.accent, taskBorderColor: c.accent, taskTextColor: '#ffffff', taskTextOutsideColor: c.fg,
      taskTextLightColor: '#ffffff', taskTextDarkColor: c.fg, activeTaskBkgColor: c.hues[1], activeTaskBorderColor: c.hues[1],
      doneTaskBkgColor: c.line, doneTaskBorderColor: c.line, critBkgColor: c.hues[4], critBorderColor: c.hues[4],
      todayLineColor: c.hues[4], excludeBkgColor: c.canvas,
      ...scale,
      commitLabelColor: c.fg, commitLabelBackground: c.canvas, tagLabelBackground: c.tint, tagLabelColor: c.tintText, tagLabelBorder: c.tint,
      xyChart: { plotColorPalette: c.hues.join(', '), backgroundColor: c.canvas, titleColor: c.strong, xAxisLineColor: c.border, yAxisLineColor: c.border,
        xAxisTickColor: c.border, yAxisTickColor: c.border, xAxisLabelColor: c.dim, yAxisLabelColor: c.dim, xAxisTitleColor: c.dim, yAxisTitleColor: c.dim },
    },
    flowchart: { curve: 'basis' as const, padding: 16, nodeSpacing: 40, rankSpacing: 56 },
    sequence: { mirrorActors: false, actorMargin: 64, messageMargin: 44, boxMargin: 8, noteMargin: 12, boxTextMargin: 6 },
    gantt: { useWidth: 680, barHeight: 24, barGap: 8, topPadding: 44, leftPadding: 90, fontSize: 13, sectionFontSize: 13, axisFormat: '%m/%d' },
    pie: { textPosition: 0.72 },
    mindmap: { padding: 16 },
    er: { entityPadding: 16, fontSize: 13, minEntityWidth: 120, diagramPadding: 16 },
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
const MIN_SCALE = isMobile ? 0.6 : 0.8;

export function renderMermaid(code: string): Promise<{ svg: string } | { error: string }> {
  const next = queue.then(() => draw(code));
  queue = next.catch(() => {});
  return next;
}

/** The diagram's SVG, or the reason it could not be drawn. */
async function draw(code: string): Promise<{ svg: string } | { error: string }> {
  if (!code.trim()) return { error: 'An empty diagram' };
  const chart = chartHtml(code); // a pie, a timeline, a Gantt chart: drawn by Eve, without loading mermaid
  if (chart) return { svg: chart };
  try {
    const m = await load();
    const { svg } = await m.render(`eve-mermaid-${++seq}`, code);
    // shrunk to the note's width, but never past 80% of its size (60% on a phone, a third narrower: a two-part sequence
    // diagram was cut off at the card's edge), where its text stops being easy to read: wider
    // than that, it scrolls sideways in its card (and opens full size from its expand button)
    return { svg: svg.replace(/(<svg[^>]*?style="max-width: )([\d.]+)px;/, (_, head, w) => `${head}${w}px; min-width: ${Math.round(+w * MIN_SCALE)}px;`) };
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
export const sliceColor = (i: number) => PALETTE[themeKey()].hues[i % 12];
/** the colour a mind map's `i`th first-level branch is drawn in (the builder's bullets) */
export const branchColor = (i: number) => PALETTE[themeKey()].hues[(i + 1) % 12];
