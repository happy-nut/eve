export const RELEASES = 'https://api.github.com/repos/happy-nut/eve/releases?per_page=10';
export const APK_PREFIX = 'https://github.com/happy-nut/eve/releases/download/';

export function newer(a: string, b: string): boolean {
  const parts = (v: string) => (/\d+(?:\.\d+)*/.exec(v)?.[0] ?? '0').split('.').map((x) => Number(x) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export type Target = 'android' | 'mac';
export interface Update { version: string; url: string; sha256?: string }
type Asset = { name: string; browser_download_url: string; digest?: string | null };

function assetFor(target: Target, tag: string, assets: Asset[]): Asset | undefined {
  if (target === 'mac') {
    const zip = assets.find((a) => a.name === 'Eve-macos-arm64.zip');
    return /^v\d/.test(tag) && zip?.digest?.startsWith('sha256:') ? zip : undefined;
  }
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
  if (res.status === 401 && token) res = await ask('');
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
