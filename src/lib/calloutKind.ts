/**
 * Obsidian's callout types (`> [!warning]`): the word stays in the file, the box shows the type's icon and
 * colour. Anything else in the brackets is an icon of its own (`> [!💡]`, Eve's form). Pure: tested in Node.
 */
export type CalloutColor = 'blue' | 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

const KINDS: [string[], string, CalloutColor][] = [
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
const BY_NAME = new Map(KINDS.flatMap(([names, icon, color]) => names.map((n) => [n, { icon, color }] as const)));

/** A callout's type word (any case) -> its icon and colour; null for an emoji or anything else. */
export const calloutKind = (token: string): { icon: string; color: CalloutColor } | null => BY_NAME.get(token.trim().toLowerCase()) ?? null;
