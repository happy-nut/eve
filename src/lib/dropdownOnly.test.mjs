import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const OWN = new Set(['Menu.svelte', 'Select.svelte']);
const TYPED = {
  'Confirm.svelte': 'its found list narrows as the box is typed into, so the keyboard stays in the box',
  'EmojiRow.svelte': 'the : picker narrows as the note is typed into, so the keyboard stays in the text (pickerKeys.dom.test.ts)',
};
const dropdown = /<[a-z][^<>]*\srole="(listbox|menu)"|<select[\s>]/g;
const bad = files(SRC)
  .filter((p) => p.endsWith('.svelte'))
  .filter((p) => { const n = relative(SRC, p); return !OWN.has(n) && !(n in TYPED); })
  .flatMap((p) => { const text = readFileSync(p, 'utf8'); return [...text.matchAll(dropdown)].map((m) => `${relative(SRC, p)}:${text.slice(0, m.index).split('\n').length}  ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`); });
assert.deepEqual(bad, [], `a dropdown is ui.openMenu(...) (src/Menu.svelte) or <Select> (src/Select.svelte), which put the keyboard on the list as it opens and move it with ↑↓; add a new one to e2e/popups.mjs ("every dropdown opened by the pointer"):\n${bad.join('\n')}`);
console.log('dropdowns ok');
