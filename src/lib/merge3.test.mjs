// A note changed on two devices since they last agreed: both changes kept when they are to different lines, nothing
// made up when they are to the same one.
import assert from 'node:assert/strict';
import { merge3 } from './merge3.ts';

const base = '# Plan\n\nstep one\n\nstep two';
// only one side changed: that side
assert.equal(merge3(base, base, base + '\n\nstep three'), base + '\n\nstep three');
assert.equal(merge3(base, base.replace('one', '1'), base), base.replace('one', '1'));
// both made the same change: once
assert.equal(merge3(base, base + '\n\nsame', base + '\n\nsame'), base + '\n\nsame');
// different lines changed: both
assert.equal(merge3(base, base.replace('step one', 'step one, done'), base.replace('step two', 'step two, later')), '# Plan\n\nstep one, done\n\nstep two, later');
// a line changed on one, a line added at the end on the other
assert.equal(merge3('# Typing\n\nfirst line', '# Typing\n\nfirst line and B typed this', '# Typing\n\nfirst line\n\nfrom A'), '# Typing\n\nfirst line and B typed this\n\nfrom A');
// both added at the same place (the end, most often): both, ours first
assert.equal(merge3(base, base + '\n\nfrom the Mac', base + '\n\nfrom the phone'), base + '\n\nfrom the Mac\n\nfrom the phone');
// a line deleted on one side, a line further on edited on the other
const longer = '# Plan\n\nstep one\n\nmiddle\n\nstep two';
assert.equal(merge3(longer, '# Plan\n\nmiddle\n\nstep two', longer.replace('step two', 'step 2')), '# Plan\n\nmiddle\n\nstep 2');
// …with nothing but a blank line between the two changes, which line went is a guess: both versions are kept
assert.equal(merge3(base, '# Plan\n\nstep two', base.replace('step two', 'step 2')), null);
// the same line made into two different things: no merge
assert.equal(merge3(base, base.replace('step one', 'step A'), base.replace('step one', 'step B')), null);
// a line edited on one side and deleted on the other: no merge (the edit would be lost)
assert.equal(merge3(base, base.replace('step one', 'step one!'), '# Plan\n\nstep two'), null);
// nothing in common to go by (a note both devices started from nothing): no merge
assert.equal(merge3('', 'mine', 'theirs'), null);
console.log('ok   merge3: both devices\' changes kept, conflicts not guessed at');
