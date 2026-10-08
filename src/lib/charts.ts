import { fromCode, type Gantt, type Pie, type Timeline } from './diagram';

/**
 * The charts Eve draws itself, from the same mermaid code: a pie as a donut with its parts listed beside it, a
 * timeline as a column of dates, a Gantt chart as a tidy schedule. Mermaid's own drawings of these three stretched
 * and crowded (a timeline's dashed drops and arrows, a Gantt's labels between its rows). The note still keeps
 * mermaid's code, so other apps draw it their way; code these cannot read (a Gantt with `after`, a timeline with
 * sections) is left to mermaid. HTML for the diagram canvas, styled by app.css (.chart-*), colours by CSS
 * variables, so the light and dark themes need no drawing again.
 */
export function chartHtml(code: string): string | null {
  const d = fromCode(code);
  if (!d) return null;
  if (d.kind === 'pie') return pie(d);
  if (d.kind === 'timeline') return timeline(d);
  if (d.kind === 'gantt') return gantt(d);
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const title = (t: string) => (t.trim() ? `<div class="chart-title">${esc(t.trim())}</div>` : '');
const fmt = (v: number) => (Math.round(v * 100) / 100).toLocaleString('en-US');

function pie(d: Pie) {
  const parts = d.slices.filter((s) => s.value > 0);
  const total = parts.reduce((a, s) => a + s.value, 0);
  if (!total) return `<div class="chart chart-empty">${title(d.title)}<p>Nothing to show yet</p></div>`;
  // a ring of strokes on one circle: each part a dash of its share, a hair of gap between them
  const R = 70, C = 2 * Math.PI * R, gap = parts.length > 1 ? 2.2 : 0;
  let at = 0;
  const arcs = parts.map((s) => {
    const len = (s.value / total) * C;
    const arc = `<circle class="c${d.slices.indexOf(s) % 12}" r="${R}" cx="90" cy="90" stroke-dasharray="${Math.max(0.01, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"/>`;
    at += len;
    return arc;
  }).join('');
  const top = parts.reduce((a, s) => (s.value > a.value ? s : a), parts[0]);
  const rows = d.slices.map((s, i) => {
    const pct = total && s.value > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
    return `<div class="row"><span class="dot c${i % 12}"></span><span class="lbl">${esc(s.label)}</span>`
      + `${d.showData ? `<span class="val">${fmt(s.value)}</span>` : ''}<span class="pct">${pct}%</span></div>`;
  }).join('');
  return `<div class="chart chart-pie">${title(d.title)}<div class="pie-body">`
    + `<div class="donut"><svg viewBox="0 0 180 180" aria-hidden="true"><g transform="rotate(-90 90 90)">${arcs}</g></svg>`
    + `<div class="donut-mid"><b>${Math.round((top.value / total) * 100)}%</b><span>${esc(top.label)}</span></div></div>`
    + `<div class="pie-legend">${rows}</div></div></div>`;
}

function timeline(d: Timeline) {
  const rows = d.periods.map((p, i) => {
    const events = p.events.filter((e) => e.trim());
    return `<div class="tl-row c${i % 12}"><div class="tl-when">${esc(p.label)}</div><div class="tl-dot"></div>`
      + `<div class="tl-what">${events.length ? events.map((e) => `<div>${esc(e)}</div>`).join('') : '<div class="tl-none">—</div>'}</div></div>`;
  }).join('');
  return `<div class="chart chart-timeline">${title(d.title)}<div class="tl">${rows}</div></div>`;
}

const DAY = 864e5;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const md = (n: number) => { const d = new Date(n * DAY); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

function gantt(d: Gantt) {
  const tasks = d.sections.flatMap((s) => s.tasks);
  if (!tasks.length) return `<div class="chart chart-empty">${title(d.title)}<p>Nothing to show yet</p></div>`;
  const from = Math.min(...tasks.map((t) => dayNum(t.start)));
  const to = Math.max(...tasks.map((t) => dayNum(t.start) + Math.max(1, t.days)));
  const span = Math.max(1, to - from);
  const pct = (n: number) => `${(((n - from) / span) * 100).toFixed(3)}%`;
  // ticks: each day for a fortnight, each week for a season, else each month's first
  const ticks: number[] = [];
  if (span <= 16) for (let n = from; n <= to; n++) ticks.push(n);
  else if (span <= 120) for (let n = from; n <= to; n += 7) ticks.push(n);
  else {
    // each month's first (each year's past a decade), stepped a month at a time, not a day: a span of centuries drew for seconds
    const d0 = new Date(from * DAY), years = span > 3660;
    for (let y = d0.getUTCFullYear(), m = years ? 0 : d0.getUTCMonth() + 1; ; years ? y++ : m++) {
      const n = Math.round(Date.UTC(y, m, 1) / DAY);
      if (n > to) break;
      if (n >= from) ticks.push(n);
    }
  }
  const label = span > 3660 ? (n: number) => String(new Date(n * DAY).getUTCFullYear()) : md;
  const axis = ticks.map((n) => `<span style="left:${pct(n)}">${label(n)}</span>`).join('');
  const grid = ticks.map((n) => `<i style="left:${pct(n)}"></i>`).join('');
  const rows = d.sections.map((s, si) => {
    const head = `<div class="g-sec">${esc(s.name)}</div><div class="g-track g-sec-track">${grid}</div>`;
    const bars = s.tasks.map((t) => {
      const a = dayNum(t.start), days = Math.max(1, t.days);
      return `<div class="g-name"><span>${esc(t.name)}</span><small>${md(a)} – ${md(a + days - 1)} · ${days}d</small></div>`
        + `<div class="g-track">${grid}<div class="g-bar c${si % 12}" style="left:${pct(a)};width:${((days / span) * 100).toFixed(3)}%"></div></div>`;
    }).join('');
    return head + bars;
  }).join('');
  return `<div class="chart chart-gantt">${title(d.title)}<div class="g-grid"><div></div><div class="g-axis">${axis}</div>${rows}</div></div>`;
}
