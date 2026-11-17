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
.claude/skills/formal-sync/check.sh                # all three below, ~1 min; prints ok/FAIL per line, exit 1 on a FAIL
.claude/skills/formal-sync/check.sh EveSync        # a note both devices have: written, deleted, typed into mid-sync
.claude/skills/formal-sync/check.sh EveSyncDay     # a day's note made under the same id on both devices
.claude/skills/formal-sync/check.sh Reach          # must be violated: conflict copies are still reached
```

`EveSync` and `EveSyncDay` must say `No error has been found`; `Reach` must say `NoCopyYet is violated`, or the model
has gone quiet (a step that can no longer fire) and the two passes prove nothing. Needs Java (`brew install openjdk`). `check.sh` fetches the pinned
`tla2tools.jar` (TLA+ 1.7.4) into `~/.cache/tlaplus/` once and checks its sha256. Read every result, a pass or a
trace, with `/devkit:statechart`: it turns a violation into the shortest path in plain words, and a pass into a
picture of how the states move.

## What it covers (sync commit `f723a17`)

The model was last checked to describe the code at `f723a17`. Each action names the code it stands for:

| Action | Code |
|---|---|
| `Type` | `notes.update` (a key reaching the store: the editor's 150 ms flush) |
| `Delete` | `notes.remove` (a tombstone, the body kept) |
| `Make` | `notes.dayNote` (a day's note, fixed id `daily-<date>`, dated `OLDER_THAN_ANY_SYNC` = 0) |
| `Start` → `Pull` | `Sync.now` → `syncRound` → `Repo.pull` (head, `known`, `f.prev`) |
| `Hash` | `gather` (sync.svelte.ts): `flushEdits()`, then `seen` and `untouched` from `serialize(local)`, taken before `await hashes.file` |
| `Base` | `gather`: the agreed version (`agreed`): `seen` when untouched, `await repo.blob(f.prev)` when both changed it, else none for now |
| `Decide` | `decide`, after the last await, its own `flushEdits()` first: untouched and unchanged since `seen` → `mergeRemote(force)`; else `agreed` (or, for a `sameIdNoneAgreed` note `writtenOnBoth`, `''` judged now) → `merge3`; else `whichStands` (the later, or an erasure over a tombstone) and the earlier is a `keepConflictCopy` if `wordsOnlyIn` it; none agreed → lww |
| `Snap` / `Push` | `local()` (`serialize` now, hashed after), `Repo.push` (nothing changed → done; ref PATCH 422 → pull again, 3 tries) |

Each `await` in the code is a gap between two actions, where the other device and the person may act. Bounds:
2 devices, 3 words, clock ≤ 9, 7 commits.

Assumptions, not checked: clocks agree (`updatedAt` is one counter; a device whose clock is behind loses lww where the
model has it win, though the loser is kept as a copy either way when it holds words of its own); one note per run
(several notes' files in one pull are gathered first and decided together after the last wait, so another file's wait
is one more gap before `Decide`); words are only added (a person erasing is not a loss, and Trash › Delete forever is
not modelled: `src/lib/syncConflict.dom.test.ts` covers it); deleting while the note's own sync waits is not modelled
(covered by a test); `repo.blob` refusing is not modelled (the code then merges nothing and keeps copies); assets,
renames and `[[link]]` following are left out; `merge3` is taken as "both sides' words" or "cannot".

## History

Found by this model on 2026-11-17 and fixed the same day (each has a case in `src/lib/syncConflict.dom.test.ts`):
- written on one device while the other deleted the note later: the words went with the tombstone;
- written and deleted on one device, deleted on the other later: the Trash lost what was written;
- a day's note written on both devices before either synced (no `f.prev`): lww dropped one side;
- a key typed while the sync waited on GitHub, into a note judged `untouched` before the wait: the other device's
  version, or its deletion, went in over it.

Found by a review of that fix (`/dev:review`, three models) and by this model once it was brought up to the code, and
fixed on 2026-11-17 by deciding only after the last wait:
- a key typed while sync waited, into a note whose two versions could not be put together, or a day's note, or a long
  note whose keys were still in the editor (the second `flushEdits()`), or into a day's note still only its template;
- copies of a version that loses nothing (erased, a template, deleted unchanged, untouched since signing in again):
  `wordsOnlyIn`; and an erasure undone by a later tombstone.

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
   `ELSE IF rver = head[d]` → `ELSE IF TRUE` (a push over a moved branch); `IF ut[d] /\ loc[d].w = seen[d].w` →
   `IF ut[d]` (no re-check of `seen`); `copies' = IF Earlier(d).w ...` → `copies' = copies` (no copy; on both configs);
   in `Agreed`, `FreshSameId /\ prev[d].none` → `FALSE /\ prev[d].none` (`EveSyncDay`). If a check passes far faster or
   with far fewer states than before, suspect the model first: an action that cannot fire (a variable both set and
   listed in its `UNCHANGED`) once hid every copy.
6. Only once the model describes the new commit, set the sync commit above to it.
