/**
 * A newer Eve, from the GitHub releases: the phone's Eve-android.apk (the same file the setup page hands
 * out), or the Mac's Eve-macos-arm64.zip. Pure: fetch is injected so it runs in Node for tests.
 */
export const RELEASES = 'https://api.github.com/repos/happy-nut/eve/releases?per_page=10';
/** the only place an update may come from */
export const APK_PREFIX = 'https://github.com/happy-nut/eve/releases/download/';

/** 0.7.1 < 0.7.10 < 0.8.0; a tag's prefix ("android-v", "v") and any suffix are ignored */
export function newer(a: string, b: string): boolean {
  // "android-v0.7.2", "v0.7.2" and "0.7.2" are the same version
  const parts = (v: string) => (/\d+(?:\.\d+)*/.exec(v)?.[0] ?? '0').split('.').map((x) => Number(x) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export type Target = 'android' | 'mac';
/** `sha256`: what GitHub lists for the file (the Mac checks the download against it before installing) */
export interface Update { version: string; url: string; sha256?: string }
type Asset = { name: string; browser_download_url: string; digest?: string | null };

/** The file a release offers `target`, if any. The Mac needs the digest: nothing unchecked gets installed. */
function assetFor(target: Target, tag: string, assets: Asset[]): Asset | undefined {
  if (target === 'mac') {
    const zip = assets.find((a) => a.name === 'Eve-macos-arm64.zip');
    return /^v\d/.test(tag) && zip?.digest?.startsWith('sha256:') ? zip : undefined;
  }
  // Eve-android-0.7.6.apk (the version in the name); Eve-android.apk is the same file for older updaters
  const apks = assets.filter((a) => /^Eve-android(-[\d.]+)?\.apk$/.test(a.name));
  return apks.find((a) => a.name !== 'Eve-android.apk') ?? apks[0];
}

/** The highest-versioned published release that carries `target`'s file, if it is newer than `current`.
 *  (The API lists the Latest release first, and that is the Mac's — so order says nothing about versions.)
 *
 *  `token`: the github.com sync token, when there is one. Asked without it, GitHub answers an address only
 *  60 times an hour — shared with everything else on that network — and past that says 403.
 *  A question GitHub did not answer throws: "no newer Eve" is only ever said after reading the list. */
export async function findUpdate(current: string, f: typeof fetch = (...a) => fetch(...a), target: Target = 'android', token = ''): Promise<Update | null> {
  const ask = (auth: string) => f(RELEASES, {
    headers: { accept: 'application/vnd.github+json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    cache: 'no-store',
  });
  let res = await ask(token);
  if (res.status === 401 && token) res = await ask(''); // a revoked token still leaves the open question
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is limiting checks — try again in a while' : `GitHub answered ${res.status}`);
  let best: Update | null = null;
  for (const r of (await res.json()) as { tag_name: string; draft: boolean; prerelease?: boolean; assets?: Asset[] }[]) {
    const file = r.draft || r.prerelease ? undefined : assetFor(target, r.tag_name, r.assets ?? []);
    if (!file || !file.browser_download_url.startsWith(APK_PREFIX)) continue;
    const version = /\d+(?:\.\d+)*/.exec(r.tag_name)?.[0] ?? r.tag_name;
    if (!best || newer(version, best.version)) best = { version, url: file.browser_download_url, ...(file.digest ? { sha256: file.digest } : {}) };
  }
  return best && newer(best.version, current) ? best : null;
}
