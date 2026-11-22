export interface Account { user: string; repo: string; token: string; host?: string }
export interface Ticket { host: string; path: string; key: string }

export const PHONE_PAGE = 'https://happy-nut.github.io/eve/android/';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

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

const isServerAddress = (host: string) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(host);

export async function open(body: string, key: string): Promise<Account> {
  const bytes = unb64url(body.trim());
  const k = await crypto.subtle.importKey('raw', unb64url(key), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, k, bytes.subarray(12));
  const a = JSON.parse(new TextDecoder().decode(pt));
  if (typeof a.token !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(a.repo)) throw new Error('not an Eve sign-in');
  const host = typeof a.host === 'string' ? a.host : '';
  if (host && !isServerAddress(host)) throw new Error(`"${host}" is not a server address`);
  return { user: String(a.user ?? ''), repo: a.repo, token: a.token, host };
}

export const ticketLink = (t: Ticket, version?: string) =>
  `${PHONE_PAGE}?${version && /^\d+(\.\d+){1,3}$/.test(version) ? `v=${version}&` : ''}t=${Date.now().toString(36)}` +
  `#h=${encodeURIComponent(t.host)}&p=${t.path}&k=${t.key}`;

const OLD_SIGNIN_PATH = 'connect';
const TICKET_LINK = new RegExp(`^eve://(?:signin|${OLD_SIGNIN_PATH})\\?(.*)$`);

function isPrivateLanHost(host: string): boolean {
  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}:\d{1,5}$/.exec(host);
  return !!ip && (ip[1] === '10' || (ip[1] === '192' && ip[2] === '168') || (ip[1] === '172' && +ip[2] >= 16 && +ip[2] <= 31));
}

export function parseTicket(url: string): Ticket | null {
  const m = TICKET_LINK.exec(url);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const host = q.get('h') ?? '', path = q.get('p') ?? '', key = q.get('k') ?? '';
  if (!isPrivateLanHost(host) || !/^[0-9a-f]{32}$/.test(path) || !/^[\w-]{43}$/.test(key)) return null;
  return { host, path, key };
}
