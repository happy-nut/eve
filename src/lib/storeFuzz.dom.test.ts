// The notes and groups stores driven by long random runs of what a user (and sync) does to them, their rules checked
// after every step. A rule broken by one path nobody tried (back into a deleted note, a page its own ancestor, a
// group-delete undo that left notes behind) fails here with the seed and the steps that led to it.
import { test, expect } from 'vitest';
import { notes, type Note } from './notes.svelte';
import { groups } from './groups.svelte';
import { history } from './history.svelte';

/** a small seeded generator: the same seed, the same run */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function broken(): string[] {
  const out: string[] = [];
  const byId = new Map(notes.all.map((n) => [n.id, n]));
  const cur = notes.currentId;
  if (cur && !byId.get(cur)) out.push(`the open note ${cur} doesn't exist`);
  if (cur && byId.get(cur)?.deleted) out.push(`the open note ${cur} is deleted`);
  const vis = notes.visible.map((n) => n.id);
  if (new Set(vis).size !== vis.length) out.push('a note is listed twice');
  if (notes.visible.some((n) => n.deleted)) out.push('a deleted note is listed');
  for (const n of notes.visible) {
    // a page under itself, however far up: the sidebar would nest it forever
    const seen = new Set<string>();
    for (let p: Note | undefined = n; p?.parent; p = byId.get(p.parent)) { if (seen.has(p.id)) { out.push(`${n.id} is its own ancestor`); break; } seen.add(p.id); }
    if (n.group && !groups.names.includes(n.group)) out.push(`${n.id} sits in a group that isn't there: ${n.group}`);
  }
  if (new Set(groups.names).size !== groups.names.length) out.push('a group is listed twice');
  // back/forward lit only where they lead somewhere, and there to a note that is there
  for (const [can, go, undo] of [[notes.canBack, () => notes.back(), () => notes.forward()], [notes.canForward, () => notes.forward(), () => notes.back()]] as const) {
    const before = notes.currentId;
    go();
    const now = notes.currentId;
    if (can && now === before) out.push('back/forward lit but went nowhere');
    if (now && byId.get(now)?.deleted) out.push('back/forward landed on a deleted note');
    if (now !== before) undo();
  }
  return out;
}

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`a random run of edits, moves, deletes, undos, history and sync (seed ${seed}) keeps the stores' rules`, async () => {
    history.clear();
    for (const n of notes.all) n.deleted = true;
    const start = notes.create('# Start\n\nx');
    notes.touched(start.id);
    notes.currentId = start.id;
    const r = rng(seed), pick = <T,>(a: T[]): T | undefined => a[Math.floor(r() * a.length)];
    const live = () => notes.visible.filter((n) => !n.deleted);
    const undos: (() => void)[] = [];
    const removed: string[] = [];
    const log: string[] = [];
    for (let step = 0; step < 250; step++) {
      const ops: [string, () => void][] = [
        ['create', () => { const n = notes.create(`# N${step}\n\nx`, pick(['', ...groups.names]) ?? ''); notes.touched(n.id); }],
        ['create unwritten', () => { notes.create(); }],
        ['open', () => { const n = pick(live()); if (n) notes.currentId = n.id; }],
        ['edit', () => { const n = pick(live()); if (n) { notes.update(n.id, n.body + ' y'); notes.touched(n.id); } }],
        ['delete', () => { const n = pick(live()); if (n) { notes.remove(n.id); removed.push(n.id); } }],
        ['undo delete', () => { const id = removed.pop(); if (id) notes.restore(id); }],
        ['back', () => notes.back()],
        ['forward', () => notes.forward()],
        ['new group', () => { groups.create(pick(['', ...groups.names]) ?? ''); }],
        ['delete group', () => { const g = pick(groups.names); if (g) undos.push(groups.remove(g)); }],
        ['undo group delete', () => { undos.pop()?.(); }],
        ['move to group', () => { const n = pick(live()); if (n) notes.setGroup(n.id, pick(['', ...groups.names]) ?? ''); }],
        ['nest', () => { const a = pick(live()), b = pick(live()); if (a && b && a !== b && !notes.isAncestor(a.id, b.id)) notes.setParent(a.id, b.id); }],
        ['unnest', () => { const a = pick(live()); if (a) notes.setParent(a.id, null); }],
        ['sync brings a change', () => { const n = pick(live()); if (n) notes.mergeRemote([{ ...n, body: n.body + ' z', updatedAt: Date.now() + 1000 }]); }],
        ['sync deletes one', () => { const n = pick(live()); if (n) notes.mergeRemote([{ ...n, deleted: true, updatedAt: Date.now() + 1000 }]); }],
        ['set an icon', () => { const n = pick(live()); if (n) notes.setIcon(n.id, pick(['', '🐢', '📌'])!); }],
        ['move a group', () => { const g = pick(groups.names); if (g) groups.move(g, pick(['', ...groups.names.filter((x) => x !== g)]) ?? '', null); }],
        // ⌘Z outside the text: the newest thing done to the notes or the groups taken back (history.svelte.ts)
        ['app undo', () => { history.undo(); }],
      ];
      const [name, run] = pick(ops)!;
      log.push(name);
      run();
      await Promise.resolve(); // the step closes as an action's own code is done (history.svelte.ts)
      const bad = broken();
      if (bad.length) { expect.soft(bad, `seed ${seed}, step ${step}, after: ${log.slice(-8).join(' → ')}`).toEqual([]); return; }
    }
  }, 60_000);
}
