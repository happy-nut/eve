---
name: formal-sync
description: TLA+ model of Eve's GitHub sync (one note, two devices) checked by TLC for "no word written on either device is ever lost". Use before and after changing src/lib/sync.svelte.ts, Repo.pull/push/syncRound in src/lib/github.ts, or notes.mergeRemote / keepConflictCopy / remove / dayNote in src/lib/notes.svelte.ts, and when a sync bug report says words went missing.
---

# Formal check: sync keeps every word

**The property.** Every word written into a note on either device is still somewhere a person can find it (a device's
copy of the note, Trash included; the branch on GitHub; a conflict copy) after any order of edits and syncs.
**The harm when it breaks.** Someone writes on the phone and on the Mac, both sync, and what they wrote on one of them
is gone with nothing saying so.

`EveSync.tla` checks this for one note on two devices, every interleaving of typing and the steps of a sync round.
`merge3` itself is not in it (it is taken as "both sides' words" or "cannot", either way): its line work is tested in
`src/lib/merge3.test.mjs`.

## Run it

```bash
.claude/skills/formal-sync/check.sh                 # the promise: must say "No error has been found" (~1 s)
.claude/skills/formal-sync/check.sh FindingDelete   # known bugs below: each must still find its counterexample
.claude/skills/formal-sync/check.sh FindingSameId
.claude/skills/formal-sync/check.sh FindingMidSync
```

Needs Java (`brew install openjdk`). `check.sh` fetches the pinned `tla2tools.jar` (TLA+ 1.7.4) into
`~/.cache/tlaplus/` once and checks its sha256. Read every result, a pass or a trace, with `/devkit:statechart`:
it turns a violation into the shortest path in plain words, and a pass into a picture of how the states move.

## What it covers (sync commit `236fb85`)

The model was last checked to describe the code at `236fb85`. Each action names the code it stands for:

| Action | Code |
|---|---|
| `Type` | `notes.update` (a key reaching the store: the editor's 150 ms flush) |
| `Delete` | `notes.remove` (a tombstone, the body kept) |
| `Make` | `notes.dayNote` (a day's note, fixed id `daily-<date>`, dated `UNWRITTEN` = 0) |
| `Start` → `Pull` | `Sync.now` → `syncRound` → `Repo.pull` (head, `known`, `f.prev`) |
| `Hash` | onPull: `flushEdits()`, then `untouched` from `serialize(local)` taken before `await this.hashes.file` |
| `Decide` / `Merge` | onPull: both written → `await repo.blob(f.prev)` → `merge3` or `keepConflictCopy` of the older + lww; else `untouched` → `mergeRemote(force)`, or `mergeRemote` (lww: only if newer) |
| `Snap` / `Push` | `local()` (`serialize` now, hashed after), `Repo.push` (nothing changed → done; ref PATCH 422 → pull again, 3 tries) |

Each `await` in the code is a gap between two actions, where the other device and (with `TypeMidSync`) the person may
act. Bounds in `EveSync.cfg`: 2 devices, 3 words, clock ≤ 9, 7 commits.

Assumptions, not checked: clocks agree (`updatedAt` is one counter; a device whose clock is behind loses lww where the
model has it win); one note (several notes' files in one pull are one `Decide` here, see FindingMidSync); words are
only added (a person erasing is not a loss); assets, renames and `[[link]]` following are left out; the editor's
unflushed keys before `flushEdits` are not modelled.

## Known bugs (found 2026-11-17, not fixed)

Each has a config that turns its case on, and each was replayed on the real code with `fakeGitHub.mjs` in a vitest
case like those in `src/lib/syncConflict.dom.test.ts`, losing the words there too.

- **FindingDelete.** The note is synced on both. B writes "written here". A deletes the note later and syncs. B syncs:
  the pulled file is deleted, so `Decide` skips the merge (`!r.deleted`), lww takes A's newer tombstone, and B's words
  are replaced by A's body. They are in no note and not in the Trash.
- **FindingSameId.** Neither device has today's note. A makes it (`dayNote`) and writes, B makes it and writes, A
  syncs first. B pulls a file it never knew (`f.prev` undefined), so no merge and no copy: lww keeps the newer and
  the other device's words are gone.
- **FindingMidSync.** The note is synced on both; A writes and syncs. B starts a sync and pulls; B's note is judged
  `untouched` from the hash taken before the await. While B waits (in the real code: on another note's
  `repo.blob`), a key reaches the note. Then `mergeRemote(force)` puts A's version over it and the key's words are
  gone. Reproduced on the real code when the key lands during the third blob fetch of a two-note pull.

When one is fixed, its config should report no error. Then move its flag into `EveSync.cfg` (set it `TRUE` there) and
delete its `Finding*.cfg`, so the promise covers it from then on.

## Before you change sync

1. Is the change in a file of the table above? If not, nothing to do here.
2. Run `check.sh` before and after. Before must pass (and the findings fail as listed).
3. If it fails after your change: walk the trace step by step against the code.
   - **A step the code cannot take** (an `await` that is not there, a branch the model has wrong) means the model is
     wrong. Fix the model to match the code, say what was wrong, and run again.
   - **Every step possible in the code** means your change broke the promise: a bug. Do not weaken `NoWordLost` or the
     model to pass.
4. If you meant to change what sync does (a new path, an await added or removed, a new reason to force or skip),
   change the matching action, keeping one action per stretch of code without an `await` in it.
5. Then break it on purpose once and see it fail: e.g. `IF Both(d)` → `IF FALSE` (no merge) or `ELSE IF rver = head[d]`
   → `ELSE IF TRUE` (a push over a moved branch). Both must report `NoWordLost is violated`. Undo the break.
6. Only once the model describes the new commit, set the sync commit above to it.
