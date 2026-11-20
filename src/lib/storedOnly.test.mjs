import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const rawJson = /JSON\.parse\(\s*localStorage|localStorage\.setItem\([^)]*JSON\.stringify/;
const bad = files(SRC)
  .filter((p) => /\.(ts|svelte)$/.test(p) && !/\.test\.|stored\.ts$/.test(p))
  .flatMap((p) => readFileSync(p, 'utf8').split('\n').map((line, i) => [p, i, line]))
  .filter(([, , line]) => rawJson.test(line))
  .map(([p, i, line]) => `${relative(SRC, p)}:${i + 1}  ${line.trim()}`);
assert.deepEqual(bad, [], `a setting kept on this device goes through saved() / save() in src/lib/stored.ts, which never throws when storage is full or shut:\n${bad.join('\n')}`);
console.log('stored settings ok');
