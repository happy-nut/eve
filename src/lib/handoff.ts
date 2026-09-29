/**
 * A signed-in Mac hands its sign-in to a phone over the local network, with no GitHub step.
 *
 * The Mac seals { user, repo, token, host } with a fresh AES-GCM key and serves the sealed bytes, once, at a
 * random path on its LAN address (lib.rs share_start). The QR carries the address, the path and the key
 * — in the link's fragment, which no server sees. The phone fetches the bytes and opens them with the
 * key; the token itself never crosses the network in the clear and never sits in the QR. The Mac stops
 * serving after the first fetch or ten minutes.
 * Pure (WebCrypto only), so it runs in Node for tests.
 */
/** `host`: the GitHub Enterprise server the repo is on ('' or absent = github.com) */
export interface Account { user: string; repo: string; token: string; host?: string }
export interface Ticket { host: string; path: string; key: string }

/** The phone-setup page (docs/android/): downloads Eve, or opens it with the ticket. */
export const PHONE_PAGE = 'https://happy-nut.github.io/eve/android/';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Seal an account for one hand-off: the bytes to serve, and the path + key the QR carries. */
export async function seal(account: Account): Promise<{ body: string; path: string; key: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(account))));
  const body = new Uint8Array(iv.length + ct.length);
  body.set(iv);
  body.set(ct, iv.length);
  return { body: b64url(body), path: hex(crypto.getRandomValues(new Uint8Array(16))), key: b64url(raw) };
}

/** Open what the Mac served. Throws on a wrong key or tampered bytes (AES-GCM checks both). */
export async function open(body: string, key: string): Promise<Account> {
  const bytes = unb64url(body.trim());
  const k = await crypto.subtle.importKey('raw', unb64url(key), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, k, bytes.subarray(12));
  const a = JSON.parse(new TextDecoder().decode(pt));
  if (typeof a.token !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(a.repo)) throw new Error('not an Eve sign-in');
  // a Mac from before servers were a setting sends none: github.com. The Mac sends it normalized
  // (github.ts normHost); anything else is not a host (no import here: this file stays standalone)
  const host = typeof a.host === 'string' ? a.host : '';
  if (host && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(host)) throw new Error(`"${host}" is not a server address`);
  return { user: String(a.user ?? ''), repo: a.repo, token: a.token, host };
}

/**
 * The QR's link. The ticket rides in the fragment, which never leaves the phone. The query carries the
 * newest phone version the Mac found (the page downloads exactly that APK, asking GitHub nothing — a
 * phone's browser had served a day-old copy of the releases list) and a fresh value per QR, so no copy of
 * the page GitHub Pages cached from before a change is used. Nothing of the ticket is in the query.
 */
export const ticketLink = (t: Ticket, version?: string) =>
  `${PHONE_PAGE}?${version && /^\d+(\.\d+){1,3}$/.test(version) ? `v=${version}&` : ''}t=${Date.now().toString(36)}` +
  `#h=${encodeURIComponent(t.host)}&p=${t.path}&k=${t.key}`;

/** `eve://signin?h=…&p=…&k=…` (how the page opens the app; `connect` from older pages) -> the ticket. Null for anything else. */
export function parseTicket(url: string): Ticket | null {
  const m = /^eve:\/\/(?:signin|connect)\?(.*)$/.exec(url);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const host = q.get('h') ?? '', path = q.get('p') ?? '', key = q.get('k') ?? '';
  // a private IPv4 address and port only: the phone must not be pointed anywhere else
  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}:\d{1,5}$/.exec(host);
  const lan = ip && (ip[1] === '10' || (ip[1] === '192' && ip[2] === '168') || (ip[1] === '172' && +ip[2] >= 16 && +ip[2] <= 31));
  if (!lan || !/^[0-9a-f]{32}$/.test(path) || !/^[\w-]{43}$/.test(key)) return null;
  return { host, path, key };
}
