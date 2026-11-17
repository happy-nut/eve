#!/usr/bin/env node
// Is this checkout fit to drive? Reads only: the installed WebKit, vite, the build it would serve. Exit 1 if not.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '../../..');
const req = createRequire(`${REPO}/package.json`);
const bad = [];
const say = (ok, what) => { console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); if (!ok) bad.push(what); };
say(existsSync(`${REPO}/node_modules`), 'node_modules installed (else: npm ci)');
let webkit = '';
try { webkit = req('playwright-core').webkit.executablePath(); } catch {}
say(!!webkit && existsSync(webkit), `WebKit for Playwright at ${webkit || '?'} (else: npx playwright-core install webkit)`);
try { req.resolve('vite'); say(true, 'vite resolvable'); } catch { say(false, 'vite resolvable'); }
say(existsSync(`${REPO}/.claude/skills/ui-audit/drive.mjs`), 'drive.mjs present');
const v = JSON.parse(readFileSync(`${REPO}/src-tauri/tauri.conf.json`, 'utf8')).version;
console.log(`info Eve ${v} at ${execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()}${execSync('git status --porcelain -- src', { cwd: REPO }).toString().trim() ? ' (src/ has uncommitted changes)' : ''}`);
process.exit(bad.length ? 1 : 0);
