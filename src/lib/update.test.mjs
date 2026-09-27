import assert from 'node:assert/strict';
import { newer, findUpdate } from './update.ts';

assert.equal(newer('v0.7.2', '0.7.1'), true);
assert.equal(newer('0.7.10', '0.7.9'), true);
assert.equal(newer('0.8.0', '0.7.99'), true);
assert.equal(newer('0.7.1', '0.7.1'), false);
assert.equal(newer('0.7.0', '0.7.1'), false);
assert.equal(newer('v1.0.0-beta', '0.9.9'), true);

const releases = (list) => async () => ({ ok: true, json: async () => list });
const apk = (tag) => ({ tag_name: tag, draft: false, assets: [{ name: 'Eve-android.apk', browser_download_url: `https://github.com/happy-nut/eve/releases/download/${tag}/Eve-android.apk` }] });
// the newest release with an APK decides; a release with only the Mac zip is skipped
assert.deepEqual(await findUpdate('0.7.1', releases([{ tag_name: 'v0.7.3', draft: false, assets: [{ name: 'Eve-macos-arm64.zip', browser_download_url: 'x' }] }, apk('v0.7.2')])),
  { version: '0.7.2', url: 'https://github.com/happy-nut/eve/releases/download/v0.7.2/Eve-android.apk' });
assert.equal(await findUpdate('0.7.2', releases([apk('v0.7.2')])), null);
// drafts and assets hosted anywhere else are never offered
assert.equal(await findUpdate('0.7.1', releases([{ ...apk('v0.7.2'), draft: true }])), null);
assert.equal(await findUpdate('0.7.1', releases([{ tag_name: 'v0.7.2', draft: false, assets: [{ name: 'Eve-android.apk', browser_download_url: 'https://evil.example/Eve-android.apk' }] }])), null);
assert.equal(await findUpdate('0.7.1', async () => ({ ok: false })), null);

console.log('UPDATE_OK');
