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
.claude/skills/formal-sync/check.sh             # a note both devices have: written, deleted, typed into mid-sync (~15 s)
.claude/skills/formal-sync/check.sh EveSyncDay  # a day's note made under the same id on both devices (~50 s)
```

Both must say `No error has been found`. Needs Java (`brew install openjdk`). `check.sh` fetches the pinned
`tla2tools.jar` (TLA+ 1.7.4) into `~/.cache/tlaplus/` once and checks its sha256. Read every result, a pass or a
trace, with `/devkit:statechart`: it turns a violation into the shortest path in plain words, and a pass into a
picture of how the states move.

## What it covers (sync commit `2e15a85`)

The model was last checked to describe the code at `2e15a85`. Each action names the code it stands for:

| Action | Code |
|---|---|
| `Type` | `notes.update` (a key reaching the store: the editor's 150 ms flush) |
| `Delete` | `notes.remove` (a tombstone, the body kept) |
| `Make` | `notes.dayNote` (a day's note, fixed id `daily-<date>`, dated `UNWRITTEN` = 0) |
| `Start` → `Pull` | `Sync.now` → `syncRound` → `Repo.pull` (head, `known`, `f.prev`) |
| `Hash` | onPull: `flushEdits()`, then `seen` and `untouched` from `serialize(local)`, taken before `await this.hashes.file` |
| `Decide` | onPull after the await: written on both (`Both`) → `Merge`; else a clash with nothing to merge from (one side deleted, or a `fixedId` note with no `f.prev`) → `keepConflictCopy` of the version lww drops (a tombstone's into the Trash) + lww; else `untouched` → `mergeRemote(force)`, re-checked against `seen` at the end of onPull (changed since → `merge3(seen, now, r)`, or a copy of the note as it is now); else lww |
| `Merge` | `await repo.blob(f.prev)` → `merge3`, or `keepConflictCopy` of the older + lww |
| `Snap` / `Push` | `local()` (`serialize` now, hashed after), `Repo.push` (nothing changed → done; ref PATCH 422 → pull again, 3 tries) |

Each `await` in the code is a gap between two actions, where the other device and the person may act. Bounds:
2 devices, 3 words, clock ≤ 9, 7 commits.

Assumptions, not checked: clocks agree (`updatedAt` is one counter; a device whose clock is behind loses lww where the
model has it win, though the loser is now kept as a copy either way); one note per run (several notes' files in one
pull share one `Decide` here; the `seen` re-check is what keeps a later file's wait from mattering); words are only
added (a person erasing is not a loss); assets, renames and `[[link]]` following are left out; the editor's unflushed
keys before `flushEdits` are not modelled; `merge3` is taken as "both sides' words" or "cannot".

## History

Found by this model on 2026-11-17 and fixed the same day (each has a case in `src/lib/syncConflict.dom.test.ts`):
- written on one device while the other deleted the note later: the words went with the tombstone;
- written and deleted on one device, deleted on the other later: the Trash lost what was written;
- a day's note written on both devices before either synced (no `f.prev`): lww dropped one side;
- a key typed while the sync waited on GitHub, into a note judged `untouched` before the wait: the other device's
  version, or its deletion, went in over it.

## Before you change sync

1. Is the change in a file of the table above? If not, nothing to do here.
2. Run both checks before and after. Before must pass.
3. If it fails after your change: walk the trace step by step against the code.
   - **A step the code cannot take** (an `await` that is not there, a branch the model has wrong) means the model is
     wrong. Fix the model to match the code, say what was wrong, and run again.
   - **Every step possible in the code** means your change broke the promise: a bug. Do not weaken `NoWordLost` or the
     model to pass.
4. If you meant to change what sync does (a new path, an await added or removed, a new reason to force or skip),
   change the matching action, keeping one action per stretch of code without an `await` in it.
5. Then break it on purpose once and see it fail. Each of these must report `NoWordLost is violated`; undo it after:
   `ELSE IF rver = head[d]` → `ELSE IF TRUE` (a push over a moved branch); `ELSE IF ~ut[d] \/ loc[d].w = seen[d].w \/
   loc[d].del` → `ELSE IF TRUE` (no re-check of `seen`); `copies' = copies \cup {Lost(d).w}` → `copies' = copies` (no
   copy when lww drops a side; also on `EveSyncDay`). Taking out the merge alone (`IF Both(d)` → `IF FALSE`) passes, and
   should: a conflict copy still keeps every word, only less neatly.
6. Only once the model describes the new commit, set the sync commit above to it.
