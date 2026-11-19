#!/usr/bin/env node
// Runs every sub-feature check of the feature map in WebKit: each <feature>.mjs here (and <feature>.phone.mjs, in a phone
// window) through drive.mjs, two at a time. A file may export `notes` ({ id: markdown }) to start from other notes.
//   node .claude/skills/verify-eve/drives/run.mjs [feature ...]
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = import.meta.dirname;
const DRIVE = resolve(HERE, '../../ui-audit/drive.mjs');
const OUT = join(tmpdir(), 'eve-drives', new Date().toISOString().replace(/[:.]/g, '-'));
const hour = 3600_000;
export const DEFAULT_NOTES = {
  a: '# Plan\n\nFirst line.\n',
  b: `---\nid: b\nupdated: ${Date.now() - hour}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n`,
  c: '# Reading list\n\nA book.\n',
};

const wanted = process.argv.slice(2);
const drives = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')
  .filter((f) => !wanted.length || wanted.includes(f.replace(/(\.phone)?\.mjs$/, '')));

async function run(file) {
  const name = file.replace(/\.mjs$/, '');
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'notes'), { recursive: true });
  const { notes = DEFAULT_NOTES } = await import(pathToFileURL(join(HERE, file)).href);
  for (const [id, text] of Object.entries(notes)) writeFileSync(join(dir, 'notes', `${id}.md`), text);
  const args = [DRIVE, join(dir, 'notes'), join(HERE, file), join(dir, 'shots'), ...(file.includes('.phone.') ? ['--phone'] : [])];
  return new Promise((done) => {
    let log = '';
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    p.on('close', (code) => {
      writeFileSync(join(dir, 'log.txt'), log);
      const lines = log.split('\n');
      const checks = lines.filter((l) => /^(PASS|FAIL) /.test(l));
      const stopped = lines.find((l) => l.startsWith('STOPPED'));
      console.log(`${code === 0 ? 'ok  ' : 'BAD '} ${name}: ${checks.filter((l) => l.startsWith('PASS')).length} passed${stopped ? ` · ${stopped}` : ''}`);
      for (const l of checks.filter((c) => c.startsWith('FAIL'))) console.log(`       ${l}`);
      done({ name, code, checks });
    });
  });
}

const queue = [...drives];
const results = [];
await Promise.all([0, 1].map(async () => { while (queue.length) results.push(await run(queue.shift())); }));
const bad = results.filter((r) => r.code !== 0);
const passed = new Set(results.flatMap((r) => r.checks.filter((l) => l.startsWith('PASS')).map((l) => l.split(' ')[1])));
console.log(`${passed.size} sub-features passed in ${results.length} drives, ${bad.length} failed; shots and logs in ${OUT}`);
process.exit(bad.length || !results.length ? 1 : 0);
