export const WRITE_BACK_MS = 250;

/**
 * A drawing's edits written back into its code a moment after the last one, and the code coming back from that write
 * told apart from code changed elsewhere (undo, sync, typing in the code), which the drawing must be read anew from.
 */
export class WriteBack {
  private seen: string | null;
  private echo: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(seen: string | null, private write: (code: string) => void, private codeNow: () => string, private delayMs = WRITE_BACK_MS) {
    this.seen = seen;
  }

  /** the drawing now reads as `drawn`; true when that is an edit, which is written back unless the code moves first */
  drawn(drawn: string | null): boolean {
    if (drawn === null || drawn === this.seen) return false;
    this.seen = this.echo = drawn;
    this.cancel();
    const at = this.codeNow();
    this.timer = setTimeout(() => { this.timer = undefined; if (this.codeNow() === at) this.write(drawn); }, this.delayMs);
    return true;
  }

  /** the write still waiting is made now */
  flush(drawn: string | null) {
    if (this.timer === undefined) return;
    this.cancel();
    if (drawn !== null && drawn !== this.codeNow()) this.write(drawn);
  }

  /** the code is now `code`; unless it is this drawing's own write coming back, the waiting write is dropped and the
   *  drawing is read anew by `reread`, which says how the drawing reads after */
  arrived(code: string, reread: (code: string) => string | null): boolean {
    if (code === this.echo) return false;
    this.cancel();
    this.echo = null;
    this.seen = reread(code);
    return true;
  }

  private cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
