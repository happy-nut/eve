import assert from 'node:assert/strict';
import { seal, open, ticketLink, parseTicket } from './handoff.ts';

const account = { user: 'happy-nut', repo: 'happy-nut/eve-notes', token: 'gho_example' };

// round trip: what the Mac seals, the phone opens with the QR's key
const s = await seal(account);
assert.deepEqual(await open(s.body, s.key), { ...account, host: account.host ?? '' });
// a GitHub Enterprise sign-in carries its server; a bad one is refused
const ghes = { user: 'me', repo: 'me/eve-notes', token: 'ghp_x', host: 'github.acme.com' };
const g = await seal(ghes);
assert.deepEqual(await open(g.body, g.key), ghes);
const bad = await seal({ ...ghes, host: 'evil host/x' });
await assert.rejects(open(bad.body, bad.key), /not a server address/);
assert.doesNotMatch(s.body, /gho_example/); // the served bytes do not carry the token in the clear

// a wrong key or a flipped byte is refused, not misread
const other = await seal(account);
await assert.rejects(open(s.body, other.key));
const flipped = s.body.slice(0, 20) + (s.body[20] === 'A' ? 'B' : 'A') + s.body.slice(21);
await assert.rejects(open(flipped, s.key));

// the QR link carries the ticket in its fragment, and the app link gives it back
const t = { host: '192.168.0.12:51234', path: s.path, key: s.key };
const link = ticketLink(t);
assert.match(link, /^https:\/\/happy-nut\.github\.io\/eve\/android\/\?t=[0-9a-z]+#h=/);
assert.match(ticketLink(t, '0.7.6'), /\/android\/\?v=0\.7\.6&t=[0-9a-z]+#h=/);
assert.doesNotMatch(ticketLink(t, '0.7.6"><x'), /v=/); // only a plain version goes in
assert.doesNotMatch(link.split('#')[0], new RegExp(s.path + '|' + s.key)); // nothing of the ticket before the fragment
assert.deepEqual(parseTicket('eve://connect?' + link.split('#')[1]), t);
assert.deepEqual(parseTicket('eve://signin?' + link.split('#')[1]), t);
assert.deepEqual(parseTicket(`eve://connect?h=10.0.0.5:8080&p=${s.path}&k=${s.key}`)?.host, '10.0.0.5:8080');
assert.deepEqual(parseTicket(`eve://connect?h=172.20.1.1:80&p=${s.path}&k=${s.key}`)?.host, '172.20.1.1:80');

// only a private address: a QR must not send the phone to the internet
assert.equal(parseTicket(`eve://connect?h=8.8.8.8:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=172.32.0.1:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=evil.example:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=192.168.0.2:80&p=../x&k=${s.key}`), null);
assert.equal(parseTicket('https://evil.example/connect?h=192.168.0.2:80'), null);

console.log('HANDOFF_OK');
