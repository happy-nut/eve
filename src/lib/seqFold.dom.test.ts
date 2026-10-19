// A sequence diagram's blocks folded while it is looked at (seqFold.ts): the code drawn, and the drawing's labels
// matched back to their blocks. The drawings below are what mermaid 11 drew for these diagrams in Chromium, cut down
// to the parts the matching reads (the blocks' label groups, the rects, a box of participants).
import { test, expect } from 'vitest';
import { foldSeq, markFolds, seqBlocks } from './seqFold';

const MANY = `sequenceDiagram
participant A
participant B
participant C
A->>B: hi
alt is ok
  B->>C: x
  opt maybe
    C->>A: y
  end
else not ok
  B->>A: no
  loop every sec
    A->>B: ping
  end
end
par one
  A->>B: p1
and two
  A->>C: p2
end
rect rgb(200,200,255)
  A->>B: r
end
critical crit
  A->>B: c
option fail
  B->>A: f
end
break stop
  A->>B: s
end
loop every sec
  A->>C: dup
end
`;
// mermaid draws each labelled block as a group when its `end` comes (the opt and the loop inside the alt before it),
// and each rect first in the drawing
const MANY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -10 678 1137"><rect x="66" y="679" fill="rgb(200,200,255)" width="232" height="62" class="rect"></rect><g data-et="control-structure" data-id="i5"><polygon points="66,207 116,207 116,220 107.6,227 66,227" class="labelBox"></polygon><text x="91" y="220" class="labelText">opt</text><text x="314" y="224" class="loopText"><tspan x="314">[maybe]</tspan></text></g><g data-et="control-structure" data-id="i10"><polygon points="66,391 116,391 116,404 107.6,411 66,411" class="labelBox"></polygon><text x="91" y="404" class="labelText">loop</text><text x="207" y="408" class="loopText"><tspan x="207">[every sec]</tspan></text></g><g data-et="control-structure" data-id="i11"><polygon points="58,119 108,119 108,132 99.6,139 58,139" class="labelBox"></polygon><text x="83" y="132" class="labelText">alt</text><text x="314" y="136" class="loopText"><tspan x="314">[is ok]</tspan></text><text x="289" y="326" class="sectionTitle">[not ok]</text></g><g data-et="control-structure" data-id="i16"><polygon points="66,495 116,495 116,508 107.6,515 66,515" class="labelBox"></polygon><text x="91" y="508" class="labelText">par</text><text x="314" y="512" class="loopText"><tspan x="314">[one]</tspan></text><text x="289" y="606" class="sectionTitle">[two]</text></g><g data-et="control-structure" data-id="i24"><polygon points="66,749 116,749 116,762 107.6,769 66,769" class="labelBox"></polygon><text x="91" y="762" class="labelText">critical</text><text x="207" y="766" class="loopText"><tspan x="207">[crit]</tspan></text><text x="182" y="860" class="sectionTitle">[fail]</text></g><g data-et="control-structure" data-id="i27"><polygon points="66,933 116,933 116,946 107.6,953 66,953" class="labelBox"></polygon><text x="91" y="946" class="labelText">break</text><text x="207" y="950" class="loopText"><tspan x="207">[stop]</tspan></text></g><g data-et="control-structure" data-id="i30"><polygon points="66,1029 116,1029 116,1042 107.6,1049 66,1049" class="labelBox"></polygon><text x="91" y="1042" class="labelText">loop</text><text x="314" y="1046" class="loopText"><tspan x="314">[every sec]</tspan></text></g></svg>';

const HARD = `---
title: Hard
---
sequenceDiagram
  autonumber
  box Aqua Front
    actor U as User
    participant W
  end
  U->>+W: open
  loop retry #59; again
    W->>+D: query
    Note right of D: slow
    D-->>W: rows
  end
  D-->>-W: done
  alt ok
    W-->>-U: page
  else
    W-->>U: err
    W-->>U: err2
  else other
    W-->>U: err3
  end
  par_over all
    U->>W: a
  and
    W->>U: b
  end
  opt
    Note over U: just a note
  end
  rect rgba(0, 0, 255, .1)
    rect rgb(1,2,3)
      U->>W: in
    end
  end
  U->>W: last`;
// the box of participants is a rect.rect too, inside a group with its title; the two rects first, the outer one
// (which ends last) ahead of the inner
const HARD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-52 -50 815 1128"><g><rect x="-16" y="-4" fill="Aqua" stroke="rgb(0,0,0, 0.5)" width="408" height="1072" class="rect"></rect><text x="188" y="15.5" class="text"><tspan x="188" dy="0">Front</tspan></text></g><rect x="64" y="928" fill="rgba(0, 0, 255, .1)" width="248" height="86" class="rect"></rect><rect x="72" y="944" fill="rgb(1,2,3)" width="232" height="62" class="rect"></rect><g data-et="control-structure" data-id="i8"><polygon points="282,146 332,146 332,159 323.6,166 282,166" class="labelBox"></polygon><text x="307" y="159" class="labelText">loop</text><text x="522.5" y="163" class="loopText"><tspan x="522.5">[retry ; again]</tspan></text></g><g data-et="control-structure" data-id="i19"><polygon points="72,385 122,385 122,398 113.6,405 72,405" class="labelBox"></polygon><text x="97" y="398" class="labelText">alt</text><text x="215" y="402" class="loopText"><tspan x="215">[ok]</tspan></text><text x="190" y="610" class="sectionTitle">[other]</text></g><g data-et="control-structure" data-id="i24"><polygon points="72,683 122,683 122,696 113.6,703 72,703" class="labelBox"></polygon><text x="97" y="696" class="labelText">par</text><text x="213" y="700" class="loopText"><tspan x="213">[all]</tspan></text></g><g data-et="control-structure" data-id="i27"><polygon points="-2,847 48,847 48,860 39.6,867 -2,867" class="labelBox"></polygon><text x="23" y="860" class="labelText">opt</text><text x="106" y="864" class="loopText"><tspan x="106">​</tspan></text></g></svg>';

const drawing = (svg: string) => {
  const div = document.createElement('div');
  div.innerHTML = svg;
  return div.querySelector('svg')!;
};
/** the key each label (and a rect's own ▾) was matched to, top to bottom of the code */
const marked = (svg: SVGSVGElement) => [...svg.querySelectorAll('.eve-fold-mark')].map((m) => `${m.getAttribute('data-fold')} ${m.textContent}`);

test('a sequence diagram\'s blocks, as written: nested ones, their parts, what they hold and who', () => {
  const b = seqBlocks(MANY);
  expect(b.map((x) => x.key)).toEqual(['alt:is ok#0', 'opt:maybe#0', 'loop:every sec#0', 'par:one#0', 'rect:rgb(200,200,255)#0', 'critical:crit#0', 'break:stop#0', 'loop:every sec#1']);
  const [alt, opt, loop] = b;
  expect([alt.sections, alt.messages, alt.who]).toEqual([2, 4, ['A', 'B', 'C']]);
  expect([opt.parent, loop.parent]).toEqual([0, 0]);
  expect(opt.who).toEqual(['A', 'C']); // in the participants' order, not the message's (C->>A)
  expect(seqBlocks('flowchart LR\n  A --> B')).toEqual([]);
  expect(seqBlocks('sequenceDiagram\n  loop x\n    A->>B: y')).toEqual([]); // a block never closed: not one to fold
});

test('nothing folded is the code exactly as written; a folded alt is its box and one note across who it used', () => {
  expect(foldSeq(MANY, new Set()).code).toBe(MANY);
  expect(foldSeq('flowchart LR\n  A --> B', new Set(['alt:x#0'])).code).toBe('flowchart LR\n  A --> B');
  const { code, shown } = foldSeq(MANY, new Set(['alt:is ok#0']));
  expect(code).toContain('A->>B: hi\nalt is ok\n  Note over A,C: ⋯ 4 messages in 2 parts\nend\npar one');
  expect(code).not.toContain('else not ok');
  // the opt and the loop inside fold away with it
  expect(shown.map((x) => x.key)).not.toContain('opt:maybe#0');
  expect(shown.map((x) => x.key)).not.toContain('loop:every sec#0');
  // a nested one folds on its own, at its own indent, inside its parent
  expect(foldSeq(MANY, new Set(['opt:maybe#0'])).code).toContain('  opt maybe\n    Note over A,C: ⋯ 1 message\n  end\nelse not ok');
});

test('what the hidden lines did is kept: a participant first met there, one left active, the messages\' numbers', () => {
  const { code } = foldSeq(HARD, new Set(['loop:retry #59; again#0', 'alt:ok#0']));
  expect(code).toContain(['  loop retry #59; again', '    participant D', '    Note over W,D: ⋯ 2 messages', '    activate D', '  end', '  autonumber 4 1'].join('\n'));
  expect(code).toContain(['  alt ok', '    Note over U,W: ⋯ 4 messages in 3 parts', '    deactivate W', '  end', '  autonumber 9 1'].join('\n'));
  expect(code.startsWith('---\ntitle: Hard\n---\nsequenceDiagram\n  autonumber\n  box Aqua Front')).toBe(true);
  expect(foldSeq(HARD, new Set(['opt:#0'])).code).toContain('  opt\n    Note over U: ⋯ 1 note\n  end');
});

test('each label in the drawing is matched to its block, inner blocks drawn first; rects the other way round', () => {
  const svg = drawing(MANY_SVG);
  const { shown } = foldSeq(MANY, new Set());
  expect(markFolds(svg, shown, new Set(['par:one#0']))).toBe(true);
  expect(marked(svg)).toEqual(['opt:maybe#0 ▾', 'loop:every sec#0 ▾', 'alt:is ok#0 ▾', 'par:one#0 ▸', 'critical:crit#0 ▾', 'break:stop#0 ▾', 'loop:every sec#1 ▾', 'rect:rgb(200,200,255)#0 ▾']);
  // the label's box and its word are what a click folds by
  const alt = [...svg.querySelectorAll('g.eve-fold')].find((g) => g.querySelector('.labelText')!.textContent === 'alt')!;
  expect(alt.querySelector('.labelBox')!.getAttribute('data-fold')).toBe('alt:is ok#0');
  expect(alt.querySelector('.labelText')!.getAttribute('data-fold')).toBe('alt:is ok#0');
  expect(svg.querySelector('g.folded .labelText')!.textContent).toBe('par');
  // a long condition is printed over two lines, a word broken with a hyphen: still the same one
  const wrapped = MANY_SVG.replace('<tspan x="314">[maybe]</tspan></text>', '<tspan x="314">[may-</tspan></text><text x="314" y="244" class="loopText"><tspan x="314">be]</tspan></text>');
  expect(wrapped).not.toBe(MANY_SVG);
  expect(markFolds(drawing(wrapped), shown, new Set())).toBe(true);

  const hard = drawing(HARD_SVG);
  expect(markFolds(hard, foldSeq(HARD, new Set()).shown, new Set())).toBe(true);
  expect(marked(hard)).toEqual(['loop:retry #59; again#0 ▾', 'alt:ok#0 ▾', 'par_over:all#0 ▾', 'opt:#0 ▾', 'rect:rgba(0, 0, 255, .1)#0 ▾', 'rect:rgb(1,2,3)#0 ▾']);
  // each rect's ▾ at its own corner; the box of participants has none
  const at = (key: string) => hard.querySelector(`.eve-fold-mark[data-fold="${key}"]`)!.getAttribute('x');
  expect(at('rect:rgb(1,2,3)#0')).toBe('77');
  expect(at('rect:rgba(0, 0, 255, .1)#0')).toBe('69');
});

test('a drawing that is not what the code says is left unmarked (the blocks fold from a row of their own)', () => {
  const svg = drawing(MANY_SVG);
  // one block fewer than drawn
  expect(markFolds(svg, foldSeq(MANY, new Set()).shown.slice(1), new Set())).toBe(false);
  // as many, but not the same ones
  const other = MANY.replace('opt maybe', 'break maybe');
  expect(markFolds(svg, foldSeq(other, new Set()).shown, new Set())).toBe(false);
  const said = MANY.replace('loop every sec\n  A->>C', 'loop every hour\n  A->>C');
  expect(markFolds(svg, foldSeq(said, new Set()).shown, new Set())).toBe(false);
  expect(svg.querySelectorAll('[data-fold]').length).toBe(0);
});

test('the note a folded block became is marked too, so a click on it unfolds it; a note of the diagram\'s own is not', () => {
  const code = 'sequenceDiagram\n  A->>B: hi\n  Note over A,B: ⋯ 1 message\n  loop again\n    A->>B: x\n  end';
  const { code: drawn, shown } = foldSeq(code, new Set(['loop:again#0']));
  expect(drawn).toContain('  loop again\n    Note over A,B: ⋯ 1 message\n  end');
  const note = (y: number) => `<g data-et="note"><rect y="${y}" class="note"></rect><text class="noteText"><tspan>⋯ 1 message</tspan></text></g>`;
  const svg = drawing(`<svg xmlns="http://www.w3.org/2000/svg">${note(80)}<g data-et="control-structure"><polygon points="0,140 50,140 50,160 0,160" class="labelBox"></polygon><text x="25" y="150" class="labelText">loop</text><text class="loopText"><tspan>[again]</tspan></text></g>${note(160)}</svg>`);
  expect(markFolds(svg, shown, new Set(['loop:again#0']))).toBe(true);
  const notes = [...svg.querySelectorAll('g[data-et="note"]')];
  expect(notes.map((g) => g.getAttribute('data-fold'))).toEqual([null, 'loop:again#0']);
  expect(notes[1].classList.contains('eve-folded-note')).toBe(true);
});
