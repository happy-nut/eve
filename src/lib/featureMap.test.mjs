import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const MAP = fileURLToPath(new URL('../../.claude/skills/verify-eve/features/', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});

const index = readFileSync(join(MAP, 'README.md'), 'utf8');
const screens = index.split('\n## Screens\n')[1]?.split('\n## ')[0] ?? '';
assert.ok(screens, 'features/README.md has a "## Screens" section: each .svelte file and the feature file that drives it');

const listed = new Map();
for (const m of screens.matchAll(/^- `([\w]+\.svelte)`: (.+)$/gm)) listed.set(m[1], [...m[2].matchAll(/\]\(\.\/([\w-]+\.md)\)/g)].map((l) => l[1]));

const components = files(SRC).filter((p) => p.endsWith('.svelte')).map((p) => basename(p)).sort();
assert.deepEqual(components.filter((c) => !listed.has(c)), [],
  'a screen with no feature file to drive it: add it to "## Screens" in .claude/skills/verify-eve/features/README.md, with a proved feature file');
assert.deepEqual([...listed.keys()].filter((c) => !components.includes(c)), [], 'a screen in "## Screens" that no longer exists in src/');

const HEADS = ['## Sub-features', '## How to get to it (user POV)', '## Driving it with drive.mjs', '## Gotchas'];
for (const [c, links] of listed) {
  assert.ok(links.length, `${c} in "## Screens" links no feature file`);
  for (const f of links) {
    assert.ok(existsSync(join(MAP, f)), `${c} links ${f}, which is not in features/`);
    const text = readFileSync(join(MAP, f), 'utf8');
    assert.deepEqual(HEADS.filter((h) => !text.includes(`\n${h}\n`)), [], `${f} is missing a section every feature file has`);
  }
}
const linkedFiles = new Set([...listed.values()].flat());
const featureFiles = readdirSync(MAP).filter((f) => f.endsWith('.md') && f !== 'README.md');
assert.deepEqual(featureFiles.filter((f) => !index.includes(`(./${f})`)), [], 'a feature file not in the README index');
console.log(`feature map: ${components.length} screens, each driven by one of ${linkedFiles.size} feature files`);
