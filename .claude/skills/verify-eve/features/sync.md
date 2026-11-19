# Sync

A person signs in with GitHub once; from then on notes written on another device come in, a note changed on both
devices is put together line by line, what cannot be is kept as a "(conflict copy)" beside it, and when GitHub cannot
be reached Eve says so and keeps the notes. The web build cannot sign in (that is the Tauri shell), but everything
after sign-in runs in the page through `fetch`, so it is driven against the tests' in-memory GitHub.

## Sub-features

- `sync-signin`: Settings → Sync → Sign in with GitHub, a device code, a private `eve-notes` repository (not proved
  here: the button is disabled without Tauri, "Sign-in needs the desktop app"; the device flow's POSTs are Tauri's;
  `src/lib/github.test.mjs` covers the code flow and `ensureRepo`).
- `sync-status`: signed in, Settings → Sync shows `@user`, `private repository owner/repo`, `Synced at HH:MM` and Sync
  now; the sidebar's foot says `synced` with a blue dot.
- `sync-pull`: a note written on the other device comes into the list on the next sync (Sync now, focus, a minute,
  2 s after an edit).
- `sync-merge`: one line changed here and another on the other device: the note has both, here and in the repository.
- `sync-conflict`: the same line changed on both: the later one stays the note, the other is kept as
  `Budget (conflict copy)` and a toast says so.
- `sync-error`: GitHub unreachable: `Sync failed` and "Could not reach GitHub. Eve tries again every minute; your notes
  are kept here meanwhile."; the sidebar `sync error`; back to `synced` once it answers.
- `sync-phone-qr`: the Mac's QR that signs a phone in (not proved here: Tauri and Android only;
  `src/lib/handoff.test.mjs` covers the QR's sealed ticket).
- `sync-background`: the phone's sync with Eve closed. **Unchecked:** Android only (`PullJob.kt`, a JobService); no test covers it, and neither this Mac nor CI has the Android SDK to run one.
- `sync-model`: no words lost in any order of two devices' rounds (not proved here: that is the TLA+ model in
  `.claude/skills/formal-sync/` and `src/lib/syncConflict.dom.test.ts`).

## How to get to it (user POV)

- Settings (⌘,) → Sync: Sign in with GitHub (or GitHub Enterprise, an organization, or a token…), Sign out, Sync now.
- The sidebar's foot: `local only` / `synced` / `syncing…` / `sync error` (the error on hover).
- Nothing to do for a round: 2 s after an edit, every minute, and when the window comes back.

## Driving it with drive.mjs

Preconditions: `a.md` `# Plan` / `step one` / `step two`, `b.md` `# Budget` / `total: 100`, written with no newline at
the end (`printf '# Plan\n\nstep one\n\nstep two'`; see Gotchas). Run: `node .claude/skills/verify-eve/drives/run.mjs sync`

The steps run in Node, so they import the tests' GitHub and the app's own `Repo` (Node strips `github.ts`'s types) as
the other device, and answer the page's API calls from it:

```js
const REPO = '/abs/path/to/eve';
const { fakeGitHub } = await import(`${REPO}/src/lib/fakeGitHub.mjs`);
const { Repo } = await import(`${REPO}/src/lib/github.ts`);
const gh = fakeGitHub();
const other = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
const enc = new TextEncoder();
let offline = false;
const otherWrites = async (id, body, order = 9) => {
  await other.pull();
  if (!(await other.push([{ path: `notes/${id}.md`, data: enc.encode(`---\nid: ${id}\nupdated: ${Date.now() + 5000}\ndeleted: false\norder: ${order}\n---\n${body}`) }]))) throw new Error('other device could not push');
};
const syncNow = async (t) => {
  await t.key(`${t.mod}+Comma`);
  await t.page.waitForSelector('[role="dialog"][aria-label="Settings"]');
  await t.click('[role="dialog"] button[role="tab"]:has-text("Sync")');
  await t.click('[role="dialog"] button:has-text("Sync now")');
  await t.page.waitForFunction(() => !document.querySelector('[role="dialog"] .status.syncing'), null, { timeout: 15000 });
};
// in the steps:
await t.page.route('https://api.github.com/repos/o/r/**', async (route) => {
  const q = route.request();
  if (offline) return route.abort('internetdisconnected');
  const res = await gh.fetch(q.url(), { method: q.method(), headers: { authorization: q.headers().authorization }, body: q.postData() ?? undefined });
  await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
});
await t.page.evaluate(() => localStorage.setItem('eve.sync', JSON.stringify({ user: 'o', repo: 'o/r', token: 'tok' })));
await t.page.reload();
await t.page.waitForSelector('.tiptap');
```

- `sync-status` **Signed out.** Before the `eve.sync` seed, Settings → Sync: `button:has-text("Sign in with GitHub")` is disabled and
  says "Sign-in needs the desktop app"; the sidebar `local only`.
- `sync-status` **Status.** `await syncNow(t)`: the card reads `@o private repository o/r … Synced at 오후 09:40` (the host's
  locale and time).
- `sync-pull` **Pull.** `await otherWrites('phone1', '# From the phone\n\nwritten on the other device'); await syncNow(t);` Esc:
  `From the phone` is the list's last row and opens with its line.
- `sync-merge` **Merge.** `await otherWrites('a', '# Plan\n\nstep one\n\nstep two, done on the phone', 0);` then click
  `.tiptap p:has-text("step one")`, End, type `, done here`, `syncNow`: the note and the repository's `notes/a.md`
  both read `step one, done here` / `step two, done on the phone`.
- `sync-conflict` **Conflict.** `await otherWrites('b', '# Budget\n\ntotal: 250', 1);` then in Budget turn `100` into `120` by
  keys, `syncNow`: Budget reads `total: 250`, a row `Budget (conflict copy)` holds `total: 120`, and the toast begins
  `“Budget” was changed on two devices at once`.
- `sync-error` **Error.** `offline = true; await syncNow(t);` the card shows `Sync failed` and the red line above, the sidebar
  `sync error`; `offline = false; await syncNow(t);` the sidebar `synced` again.

## Gotchas

- Route only `api.github.com/repos/o/r/**`: Settings also asks GitHub for Eve's own releases, which the fake answers
  401 (console errors) if caught.
- The sidebar says `not synced yet` until the first round has gone through, then `synced`.
- `otherWrites` before typing here: if the page pushes first, the other device's push is refused (`false`).
- A note whose stored body ends in a newline (a file written on github.com) still merges with Eve's copy, saved
  without it: `merge3` sets final newlines aside.
- The conflict toast wraps onto a second line in a 1200 px window: the copy's name is readable in the shot.
- Settings stays open after Sync now: Esc it before the next ⌘, (which would shut it); ⌘, pressed as the page has just loaded was once missed, the gear (`aside footer button[aria-label="Settings"]`) was not.
