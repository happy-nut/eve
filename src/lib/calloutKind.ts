export type CalloutColor = 'blue' | 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

const OBSIDIAN_KINDS: [string[], string, CalloutColor][] = [
  [['note'], '✏️', 'blue'],
  [['abstract', 'summary', 'tldr'], '📋', 'cyan'],
  [['info'], 'ℹ️', 'blue'],
  [['todo'], '☑️', 'blue'],
  [['tip', 'hint', 'important'], '🔥', 'cyan'],
  [['success', 'check', 'done'], '✅', 'green'],
  [['question', 'help', 'faq'], '❓', 'orange'],
  [['warning', 'caution', 'attention'], '⚠️', 'orange'],
  [['failure', 'fail', 'missing'], '❌', 'red'],
  [['danger', 'error'], '⚡', 'red'],
  [['bug'], '🐛', 'red'],
  [['example'], '📑', 'purple'],
  [['quote', 'cite'], '💬', 'gray'],
];
const BY_NAME = new Map(OBSIDIAN_KINDS.flatMap(([names, icon, color]) => names.map((n) => [n, { icon, color }] as const)));

export const calloutKind = (token: string): { icon: string; color: CalloutColor } | null => BY_NAME.get(token.trim().toLowerCase()) ?? null;
