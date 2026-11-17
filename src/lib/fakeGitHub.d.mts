export function fakeGitHub(): {
  fetch: typeof globalThis.fetch;
  calls: () => number;
  commits: () => number;
};
