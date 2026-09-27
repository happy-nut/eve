/**
 * A newer Eve for the phone, from the GitHub releases (the same Eve-android.apk the setup page hands
 * out). Pure: fetch is injected so it runs in Node for tests.
 */
export const RELEASES = 'https://api.github.com/repos/happy-nut/eve/releases?per_page=10';
/** the only place an update may come from */
export const APK_PREFIX = 'https://github.com/happy-nut/eve/releases/download/';

/** 0.7.1 < 0.7.10 < 0.8.0; a leading "v" and anything after "-" are ignored */
export function newer(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((x) => Number(x) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** The newest published release that carries the APK, if it is newer than `current`. */
export async function findUpdate(current: string, f: typeof fetch = (...a) => fetch(...a)): Promise<{ version: string; url: string } | null> {
  const res = await f(RELEASES, { headers: { accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) return null;
  for (const r of (await res.json()) as { tag_name: string; draft: boolean; assets?: { name: string; browser_download_url: string }[] }[]) {
    const apk = !r.draft && r.assets?.find((a) => a.name === 'Eve-android.apk');
    if (!apk || !apk.browser_download_url.startsWith(APK_PREFIX)) continue;
    return newer(r.tag_name, current) ? { version: r.tag_name.replace(/^v/, ''), url: apk.browser_download_url } : null;
  }
  return null;
}
