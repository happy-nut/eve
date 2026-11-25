export const WRITE_BACK_MS = 250;

/**
 * A drawing's edits written back into its code a moment after the last one, and the code coming back from that write
 * told apart from code changed elsewhere (undo, sync, typing in the code), which the drawing must be read anew from.
 * Each change is written as one, for the note's undo to take back one at a time: letters typed into one field go on
 * with the change they began, and anything else done writes the change waiting first.
 */
export class WriteBack {
  private seen: string | null;
  private waiting: string | null = null;
  private written: string | null = null;
  private typing: Element | null = null;
  private starts = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(seen: string | null, private write: (code: string, startsChange: boolean) => void, private codeNow: () => string, private delayMs = WRITE_BACK_MS) {
    this.seen = seen;
  }

  /** the drawing now reads as `drawn`; true when that is an edit, which is written back unless the code moves first.
   *  `typedInto` is the field typing in made it: more typed there goes on with the same change */
  drawn(drawn: string | null, typedInto: Element | null = null): boolean {
    if (drawn === null || drawn === this.seen) return false;
    if (typedInto === null || typedInto !== this.typing) {
      this.writeWaiting();
      this.starts = true;
    }
    this.typing = typedInto;
    this.seen = this.waiting = drawn;
    this.cancel();
    const at = this.codeNow();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.codeNow() === at) this.writeWaiting(); else this.waiting = null;
    }, this.delayMs);
    return true;
  }

  /** the field typed in was left, or something else was done: what is typed next is a change of its own */
  stopTyping() { this.typing = null; }

  /** the write still waiting is made now */
  flush(drawn: string | null) {
    this.drawn(drawn);
    this.writeWaiting();
  }

  /** the code is now `code`; unless it is this drawing's own write coming back, the waiting write is dropped and the
   *  drawing is read anew by `reread`, which says how the drawing reads after */
  arrived(code: string, reread: (code: string) => string | null): boolean {
    if (code === this.waiting || code === this.written) return false;
    this.cancel();
    this.waiting = this.written = this.typing = null;
    this.seen = reread(code);
    return true;
  }

  private writeWaiting() {
    this.cancel();
    const code = this.waiting;
    this.waiting = null;
    if (code === null || code === this.codeNow()) return;
    this.written = code;
    this.write(code, this.starts);
    this.starts = false;
  }

  private cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
