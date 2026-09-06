/** In-app confirm/prompt (WKWebView has no native JS dialogs). Rendered by Confirm.svelte. */
interface Pending { message: string; input?: string; danger?: boolean; resolve: (v: string | null) => void }

class Ui {
  pending = $state<Pending | null>(null);

  /** Yes/no. `danger` colors the confirm button red. */
  ask(message: string, danger = true): Promise<boolean> {
    return new Promise((res) => { this.pending = { message, danger, resolve: (v) => res(v !== null) }; });
  }
  /** Text input; resolves null on cancel. */
  prompt(message: string, initial = ''): Promise<string | null> {
    return new Promise((res) => { this.pending = { message, input: initial, resolve: res }; });
  }
  done(v: string | null) { this.pending?.resolve(v); this.pending = null; }
}

export const ui = new Ui();
