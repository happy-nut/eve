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
// GitHub not answering (offline, or its hourly limit) is not "up to date": the check fails
await assert.rejects(findUpdate('0.7.1', async () => ({ ok: false, status: 403 })), /limiting/);
await assert.rejects(findUpdate('0.7.1', async () => ({ ok: false, status: 500 })), /500/);
// the sync token goes along when there is one; a revoked one falls back to asking without it
{
  const seen = [];
  const f = async (_url, init) => { seen.push(init.headers.authorization ?? ''); return seen.length === 1 ? { ok: false, status: 401 } : { ok: true, json: async () => [apk('v0.7.2')] }; };
  assert.equal((await findUpdate('0.7.1', f, 'android', 'tok'))?.version, '0.7.2');
  assert.deepEqual(seen, ['Bearer tok', '']);
}

// the phone's own tags
assert.equal(newer('android-v0.7.2', '0.7.1'), true);
assert.equal(newer('android-v0.7.2', '0.7.2'), false);
assert.deepEqual((await findUpdate('0.7.1', releases([apk('android-v0.7.2')])))?.version, '0.7.2');

// the Latest (Mac) release comes first in the API's list; the highest version still wins
assert.deepEqual((await findUpdate('0.7.1', releases([apk('v0.7.1'), apk('android-v0.7.3'), apk('android-v0.7.2')])))?.version, '0.7.3');

// the versioned file is the one handed out; the plain name alone still counts
const both = (tag, v) => ({ tag_name: tag, draft: false, assets: [
  { name: 'Eve-android.apk', browser_download_url: `https://github.com/happy-nut/eve/releases/download/${tag}/Eve-android.apk` },
  { name: `Eve-android-${v}.apk`, browser_download_url: `https://github.com/happy-nut/eve/releases/download/${tag}/Eve-android-${v}.apk` }] });
assert.equal((await findUpdate('0.7.5', releases([both('android-v0.7.6', '0.7.6')])))?.url, 'https://github.com/happy-nut/eve/releases/download/android-v0.7.6/Eve-android-0.7.6.apk');
assert.equal((await findUpdate('0.7.5', releases([{ tag_name: 'android-v0.7.6', draft: false, assets: [{ name: 'Eve-android-backup.zip', browser_download_url: 'https://github.com/happy-nut/eve/releases/download/x/y' }] }]))), null);

// the Mac: a v* release's zip, with the digest GitHub lists for it
const HEX = 'e6456e9b9438864be87090eeef3b4bc2c50c2c9ae171119659c381048b2cc5d8';
const zip = (tag, digest = `sha256:${HEX}`) => ({ tag_name: tag, draft: false, assets: [
  { name: 'Eve-macos-arm64.zip', browser_download_url: `https://github.com/happy-nut/eve/releases/download/${tag}/Eve-macos-arm64.zip`, digest }] });
assert.deepEqual(await findUpdate('0.7.12', releases([apk('android-v0.7.19'), zip('v0.7.13'), zip('v0.7.12')]), 'mac'),
  { version: '0.7.13', url: 'https://github.com/happy-nut/eve/releases/download/v0.7.13/Eve-macos-arm64.zip', sha256: `sha256:${HEX}` });
assert.equal(await findUpdate('0.7.13', releases([zip('v0.7.13')]), 'mac'), null);
// no digest, nothing to check the download against: not offered
assert.equal(await findUpdate('0.7.12', releases([zip('v0.7.13', null)]), 'mac'), null);
// a phone release never updates the Mac, nor the Mac's zip the phone; pre-releases are skipped
assert.equal(await findUpdate('0.7.12', releases([apk('android-v0.7.30')]), 'mac'), null);
assert.equal(await findUpdate('0.7.12', releases([zip('v0.7.30')])), null);
assert.equal(await findUpdate('0.7.12', releases([{ ...zip('v0.7.13'), prerelease: true }]), 'mac'), null);
assert.equal(await findUpdate('0.7.12', releases([{ tag_name: 'v0.7.13', draft: false, assets: [{ name: 'Eve-macos-arm64.zip', browser_download_url: 'https://evil.example/Eve-macos-arm64.zip', digest: `sha256:${HEX}` }] }]), 'mac'), null);

console.log('UPDATE_OK');
