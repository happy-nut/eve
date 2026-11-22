export const closeKeepingFocus = (close: () => void) => (e: MouseEvent) => { e.preventDefault(); close(); };
