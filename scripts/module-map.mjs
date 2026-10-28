// Which of Eve's modules uses which, read from their imports, as a mermaid flowchart in docs/modules.md: the modules in
// lanes by what they are for, each line labelled with what it takes. It is drawn in Eve (lanes.ts) and on GitHub.
// Run: npm run map            (all of it)
//      npm run map -- "노트 저장소,동기화와 가져오기"   (only these lanes, and the lines between them)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANES = {
  '창과 화면': 'App main Sidebar Editor CardPage CalendarPage TabBar MobileBar BottomSheet Settings TrashPanel HistoryPanel Outline Find',
  '노트 저장소': 'notes groups daily history tabs pending moves takeBody snapshot comeBack reminder inbox handoff paths',
  '동기화와 가져오기': 'sync github merge3 update updates transfer importTree keep hwp html pdf notionPaste evelink platform',
  '편집기': 'editor blocks blockHandle keys shortcuts slash suggest markdown wikilink hangul highlight textColor footnote find selectionLayer clickTarget date emoji focusWatch drop bookmark image video divider cover icons',
  '블록 엔진': 'code grammars mermaid diagram diagramBlock edgeLabels lanes seqFold charts math mathEdit mathParts mathRender table tableHandles toggle callout calloutKind database databaseNode formula kanban board',
  '블록 화면': 'DiagramBlock DiagramForm FlowEditor MathEdit Kanban Database TableTools PdfViewer ImageViewer',
  'UI 기반': 'ui popup motion appearance hints scrollHint resize swipeRow touchReorder noteMenu Icon Menu Confirm Select Slider Toast Tooltip Hint Keys Suggest DateMenu EmojiPicker EmojiRow',
};

const only = process.argv[2]?.split(',');
const files = [
  ...readdirSync(join(ROOT, 'src')).filter((f) => /\.(svelte|ts)$/.test(f)).map((f) => join(ROOT, 'src', f)),
  ...readdirSync(join(ROOT, 'src/lib')).filter((f) => /\.(svelte|ts)$/.test(f) && !/\.test\.|testSetup|testEditor|fake|harness|schemaSamples/.test(f)).map((f) => join(ROOT, 'src/lib', f)),
];
const name = (p) => basename(p).replace(/(\.svelte)?\.ts$|\.svelte$|\.js$/, '');
const laneOf = {};
for (const [lane, mods] of Object.entries(LANES)) if (!only || only.includes(lane)) for (const m of mods.split(' ')) laneOf[m] = lane;
const unplaced = files.map(name).filter((n) => !(n in laneOf));
if (!only && unplaced.length) throw new Error(`modules in no lane (add them to LANES): ${unplaced.join(' ')}`);

// one line per pair of modules, with every name the one takes from the other (a type alone is no use of it)
const pairs = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8'), from = name(f);
  const add = (to, names) => {
    if (from === to || !laneOf[from] || !laneOf[to]) return;
    const p = pairs.get(`${from}>${to}`) ?? pairs.set(`${from}>${to}`, { from, to, names: new Set() }).get(`${from}>${to}`);
    names.forEach((n) => p.names.add(n));
  };
  for (const m of src.matchAll(/import\s+(type\s+)?([^'";]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (m[1]) continue;
    const names = (m[2].match(/\{([^}]*)\}/)?.[1] ?? m[2]).split(',').map((s) => s.trim()).filter((s) => s && !/^type\s/.test(s)).map((s) => s.split(/\s+as\s+/)[0]);
    if (names.length) add(name(resolve(dirname(f), m[3])), names);
  }
  for (const m of src.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) add(name(resolve(dirname(f), m[1])), ['(lazy)']);
}

const used = new Set([...pairs.values()].flatMap((p) => [p.from, p.to]));
const id = (n) => `m_${n}`;
const label = (s) => { const a = [...s]; return a.length <= 2 ? a.join(', ') : `${a.slice(0, 2).join(', ')} 외 ${a.length - 2}`; };
const out = ['flowchart LR'];
Object.entries(LANES).forEach(([lane, mods], i) => {
  const here = mods.split(' ').filter((m) => used.has(m) && laneOf[m]);
  if (!here.length) return;
  out.push(`  subgraph g${i + 1}["${lane}"]`, ...here.map((m) => `    ${id(m)}["${m}"]`), '  end');
});
for (const p of pairs.values()) out.push(`  ${id(p.from)} -->|"${label(p.names)}"| ${id(p.to)}`);

const doc = `# Eve's modules\n\nWhich module uses which, from their imports (\`npm run map\` writes this). ${used.size} modules, ${pairs.size} lines; each line says what it takes.\n\n\`\`\`mermaid\n${out.join('\n')}\n\`\`\`\n`;
writeFileSync(join(ROOT, 'docs/modules.md'), doc);
console.log(`docs/modules.md: ${used.size} modules, ${pairs.size} lines`);
