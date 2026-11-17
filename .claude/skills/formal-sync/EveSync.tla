---------------------------- MODULE EveSync ----------------------------
(* One note, two devices, one GitHub branch: Eve's sync round as it is written in
   src/lib/sync.svelte.ts (Sync.now, gather and decide), src/lib/github.ts (syncRound, Repo.pull,
   Repo.push) and src/lib/notes.svelte.ts (mergeRemote, keepConflictCopy, update, remove, dayNote).

   The promise checked (CLAUDE.md, "A note written on two devices before they sync loses one device's
   words"): every word written into the note on either device is still somewhere a person can find it
   (a device's copy of the note, the branch, or a conflict copy) after any order of edits and syncs.

   Words are only ever added (Type), so a word missing from everywhere was lost, not erased by a person.
   A note's text is the set of words written in it; merge3 is taken as "both sides' words" or "cannot"
   (null), chosen freely: its own line-by-line work is tested in src/lib/merge3.test.mjs, not here.
   A file's git blob sha is its content, so a record stands for its own sha (known, prev). *)
EXTENDS Naturals, FiniteSets

CONSTANTS Devices, Words,
          Deletes,       \* a device may delete the note (notes.remove) while the other writes in it
          FreshSameId,   \* the note starts on neither side, and each device may make it itself with the
                         \* same id (dayNote: a day's note is daily-<date> on every device)
          TypeMidSync,   \* a key may reach the note (notes.update, from the editor's 150 ms flush) while
                         \* the device's own sync is between two awaits
          MaxClock, MaxHead

None == [w |-> {}, del |-> FALSE, at |-> 0, none |-> TRUE]
Rec(ws, d, t) == [w |-> ws, del |-> d, at |-> t, none |-> FALSE]

VARIABLES
  loc,     \* notes.all's copy of the note on each device (None: not there)
  known,   \* repo.s.known[path]: the record the device last agreed on with the branch
  head,    \* repo.s.head
  rfile,   \* the note's file on the branch
  rver,    \* the branch's commit count (its head)
  pc,      \* where each device is in Sync.now
  pr,      \* the file pulled (f.data parsed: r)
  prev,    \* f.prev: what known said before this pull
  ut,      \* `untouched`, as the hash taken before the await found it
  seen,    \* `seen`: the note here as it was when `untouched` was taken
  base,    \* the version the two last agreed on, as gather holds it (None: no agreed version, plain lww)
  mg,      \* whether merge3 may put the two together (an agreed version from f.prev or untouched)
  snap,    \* local(): what is pushed, read before Repo.push's awaits
  tries,   \* syncRound's three tries
  copies,  \* the words in conflict copies (keepConflictCopy), never lost
  typed,   \* every word ever written (history)
  clock    \* Date.now()

vars == <<loc, known, head, rfile, rver, pc, pr, prev, ut, seen, base, mg, snap, tries, copies, typed, clock>>

Init ==
  /\ clock = 2
  /\ rver = 0 /\ head = [d \in Devices |-> 0]
  /\ IF FreshSameId
       THEN /\ rfile = None /\ loc = [d \in Devices |-> None] /\ known = [d \in Devices |-> None]
       ELSE /\ rfile = Rec({}, FALSE, 1)
            /\ loc = [d \in Devices |-> Rec({}, FALSE, 1)]
            /\ known = [d \in Devices |-> Rec({}, FALSE, 1)]
  /\ pc = [d \in Devices |-> "idle"] /\ pr = [d \in Devices |-> None] /\ prev = [d \in Devices |-> None]
  /\ ut = [d \in Devices |-> FALSE] /\ seen = [d \in Devices |-> None] /\ base = [d \in Devices |-> None]
  /\ mg = [d \in Devices |-> FALSE] /\ snap = [d \in Devices |-> None] /\ tries = [d \in Devices |-> 0]
  /\ copies = {} /\ typed = {}

Syncing(d) == pc[d] # "idle"
Tick == clock' = clock + 1

\* ---- what a person does -------------------------------------------------------------------------
\* notes.update: the body changes and updatedAt = Date.now()
Type(d, word) ==
  /\ word \notin typed
  /\ ~loc[d].none /\ ~loc[d].del
  /\ TypeMidSync \/ ~Syncing(d)
  /\ loc' = [loc EXCEPT ![d] = Rec(loc[d].w \cup {word}, FALSE, clock)]
  /\ typed' = typed \cup {word} /\ Tick
  /\ UNCHANGED <<known, head, rfile, rver, pc, pr, prev, ut, seen, base, mg, snap, tries, copies>>

\* notes.remove: a tombstone, the words kept in it (the Trash)
Delete(d) ==
  /\ Deletes /\ ~Syncing(d)
  /\ ~loc[d].none /\ ~loc[d].del
  /\ loc' = [loc EXCEPT ![d] = Rec(loc[d].w, TRUE, clock)] /\ Tick
  /\ UNCHANGED <<known, head, rfile, rver, pc, pr, prev, ut, seen, base, mg, snap, tries, copies, typed>>

\* notes.dayNote: the day's note made here, dated OLDER_THAN_ANY_SYNC (0) so another device's written copy wins
Make(d) ==
  /\ FreshSameId /\ ~Syncing(d)
  /\ loc[d].none
  /\ loc' = [loc EXCEPT ![d] = Rec({}, FALSE, 0)]
  /\ UNCHANGED <<known, head, rfile, rver, pc, pr, prev, ut, seen, base, mg, snap, tries, copies, typed, clock>>

\* ---- Sync.now -> syncRound ----------------------------------------------------------------------
Start(d) ==
  /\ pc[d] = "idle"
  /\ pc' = [pc EXCEPT ![d] = "pull"] /\ tries' = [tries EXCEPT ![d] = 0]
  /\ UNCHANGED <<loc, known, head, rfile, rver, pr, prev, ut, seen, base, mg, snap, copies, typed, clock>>

\* Repo.pull: nothing if the head is the same; else the file, when its blob is not the one known
Pull(d) ==
  /\ pc[d] = "pull"
  /\ IF rver = head[d] \/ rfile = known[d] \/ rfile.none
       THEN /\ head' = [head EXCEPT ![d] = rver]
            /\ pc' = [pc EXCEPT ![d] = "snap"]
            /\ UNCHANGED <<known, pr, prev>>
       ELSE /\ head' = [head EXCEPT ![d] = rver]
            /\ pr' = [pr EXCEPT ![d] = rfile]
            /\ prev' = [prev EXCEPT ![d] = known[d]]
            /\ known' = [known EXCEPT ![d] = rfile]
            /\ pc' = [pc EXCEPT ![d] = "hash"]
  /\ UNCHANGED <<loc, rfile, rver, ut, seen, base, mg, snap, tries, copies, typed, clock>>

\* gather: flushEdits(); `seen` and `untouched` from the note's hash, taken before `await hashes.file`
Hash(d) ==
  /\ pc[d] = "hash"
  /\ ut' = [ut EXCEPT ![d] = ~loc[d].none /\ ~prev[d].none /\ loc[d] = prev[d]]
  /\ seen' = [seen EXCEPT ![d] = loc[d]]
  /\ pc' = [pc EXCEPT ![d] = "base"]
  /\ UNCHANGED <<loc, known, head, rfile, rver, pr, prev, base, mg, snap, tries, copies, typed, clock>>

\* after that await: the version the two last agreed on. Untouched: the note as it was (`seen`). Changed on both
\* with an f.prev: `await repo.blob(f.prev)` (a gap after this step, as every step). Else none for now
Base(d) ==
  /\ pc[d] = "base"
  /\ LET differ == ~loc[d].none /\ loc[d].w # pr[d].w IN
     /\ base' = [base EXCEPT ![d] =
          IF ut[d] THEN seen[d]
          ELSE IF differ /\ ~prev[d].none THEN prev[d]
          ELSE None]
     /\ mg' = [mg EXCEPT ![d] = ut[d] \/ (differ /\ ~prev[d].none)]
  /\ pc' = [pc EXCEPT ![d] = "decide"]
  /\ UNCHANGED <<loc, known, head, rfile, rver, pr, prev, ut, seen, snap, tries, copies, typed, clock>>

\* mergeRemote(lww): taken only if newer; mergeRemote(force): taken as it is
Lww(d, r) == IF loc[d].none \/ loc[d].at < r.at THEN r ELSE loc[d]
Later(d) == IF pr[d].at > loc[d].at THEN pr[d] ELSE loc[d]
Earlier(d) == IF pr[d].at > loc[d].at THEN loc[d] ELSE pr[d]
\* judged at Decide: a madeOnEveryDevice note with no f.prev, made and written on both (neither OLDER_THAN_ANY_SYNC): nothing agreed ({})
Agreed(d) == IF ~base[d].none THEN base[d]
             ELSE IF FreshSameId /\ prev[d].none /\ ~loc[d].none /\ loc[d].w # pr[d].w /\ loc[d].at # 0 /\ pr[d].at # 0
               THEN Rec({}, FALSE, 0) ELSE None
\* wordsOnlyIn: the earlier version is kept as a conflict copy only if it holds words the later and the base lack
KeepEarlier(d) ==
  /\ copies' = IF Earlier(d).w \ (Later(d).w \cup Agreed(d).w) # {} THEN copies \cup {Earlier(d).w} ELSE copies
  /\ loc' = [loc EXCEPT ![d] = Later(d)] /\ UNCHANGED clock

\* decide: no wait left before mergeRemote; the note as it is now (flushEdits() again first)
Decide(d) ==
  /\ pc[d] = "decide"
  /\ IF ut[d] /\ loc[d].w = seen[d].w
       THEN /\ loc' = [loc EXCEPT ![d] = pr[d]] /\ UNCHANGED <<copies, clock>>
       ELSE IF loc[d].none \/ Agreed(d).none
         THEN /\ loc' = [loc EXCEPT ![d] = Lww(d, pr[d])] /\ UNCHANGED <<copies, clock>>
       ELSE IF mg[d] /\ ~loc[d].del /\ ~pr[d].del
         THEN \/ /\ loc' = [loc EXCEPT ![d] = Rec(loc[d].w \cup pr[d].w, FALSE, clock)] /\ Tick
                 /\ UNCHANGED copies
              \/ KeepEarlier(d)
       ELSE KeepEarlier(d)
  /\ pc' = [pc EXCEPT ![d] = "snap"]
  /\ UNCHANGED <<known, head, rfile, rver, pr, prev, ut, seen, base, mg, snap, tries, typed>>

\* local(): serialize(n) read now, hashed and pushed after awaits
Snap(d) ==
  /\ pc[d] = "snap"
  /\ snap' = [snap EXCEPT ![d] = loc[d]]
  /\ pc' = [pc EXCEPT ![d] = "push"]
  /\ UNCHANGED <<loc, known, head, rfile, rver, pr, prev, ut, seen, base, mg, tries, copies, typed, clock>>

\* Repo.push: nothing changed -> done; else a commit on s.head; the ref PATCH refused (422) if the
\* branch moved -> syncRound pulls again, three times at most, then an error (head/known kept)
Push(d) ==
  /\ pc[d] = "push"
  /\ IF snap[d].none \/ snap[d] = known[d]
       THEN /\ pc' = [pc EXCEPT ![d] = "idle"] /\ UNCHANGED <<rfile, rver, head, known, tries>>
       ELSE IF rver = head[d]
         THEN /\ rfile' = snap[d] /\ rver' = rver + 1
              /\ head' = [head EXCEPT ![d] = rver + 1]
              /\ known' = [known EXCEPT ![d] = snap[d]]
              /\ pc' = [pc EXCEPT ![d] = "idle"] /\ UNCHANGED tries
         ELSE /\ tries' = [tries EXCEPT ![d] = tries[d] + 1]
              /\ pc' = [pc EXCEPT ![d] = IF tries[d] + 1 < 3 THEN "pull" ELSE "idle"]
              /\ UNCHANGED <<rfile, rver, head, known>>
  /\ UNCHANGED <<loc, pr, prev, ut, seen, base, mg, snap, copies, typed, clock>>

Next ==
  \E d \in Devices :
    \/ \E word \in Words : Type(d, word)
    \/ Delete(d) \/ Make(d) \/ Start(d) \/ Pull(d) \/ Hash(d) \/ Base(d) \/ Decide(d) \/ Snap(d) \/ Push(d)

Spec == Init /\ [][Next]_vars

\* ---- the promise ----------------------------------------------------------------------------------
Kept == UNION ({loc[d].w : d \in Devices} \cup {rfile.w} \cup copies)
NoWordLost == typed \subseteq Kept

\* must be reached (Reach.cfg): a check that passes because a step can no longer fire proves nothing
NoCopyYet == copies = {}

Bounds == clock <= MaxClock /\ rver <= MaxHead
=============================================================================
