import assert from 'node:assert/strict';
import { seal, open, ticketLink, parseTicket } from './handoff.ts';

const account = { user: 'happy-nut', repo: 'happy-nut/eve-notes', token: 'gho_example' };

// round trip: what the Mac seals, the phone opens with the QR's key
const s = await seal(account);
assert.deepEqual(await open(s.body, s.key), account);
assert.doesNotMatch(s.body, /gho_example/); // the served bytes do not carry the token in the clear

// a wrong key or a flipped byte is refused, not misread
const other = await seal(account);
await assert.rejects(open(s.body, other.key));
const flipped = s.body.slice(0, 20) + (s.body[20] === 'A' ? 'B' : 'A') + s.body.slice(21);
await assert.rejects(open(flipped, s.key));

// the QR link carries the ticket in its fragment, and the app link gives it back
const t = { host: '192.168.0.12:51234', path: s.path, key: s.key };
const link = ticketLink(t);
assert.match(link, /^https:\/\/happy-nut\.github\.io\/eve\/android\/#h=/);
assert.deepEqual(parseTicket('eve://connect?' + link.split('#')[1]), t);
assert.deepEqual(parseTicket(`eve://connect?h=10.0.0.5:8080&p=${s.path}&k=${s.key}`)?.host, '10.0.0.5:8080');
assert.deepEqual(parseTicket(`eve://connect?h=172.20.1.1:80&p=${s.path}&k=${s.key}`)?.host, '172.20.1.1:80');

// only a private address: a QR must not send the phone to the internet
assert.equal(parseTicket(`eve://connect?h=8.8.8.8:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=172.32.0.1:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=evil.example:80&p=${s.path}&k=${s.key}`), null);
assert.equal(parseTicket(`eve://connect?h=192.168.0.2:80&p=../x&k=${s.key}`), null);
assert.equal(parseTicket('https://evil.example/connect?h=192.168.0.2:80'), null);

console.log('HANDOFF_OK');
