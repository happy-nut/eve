/**
 * `eve://open?id=…[&section=…]`: how `eve open` and the MCP server's open_note (src-tauri/src/mcp.rs,
 * link_to) ask the running Eve to show a note. A link only ever shows a note — any page could hand one
 * to macOS, so nothing it says may write, delete or create.
 */
export interface EveLink { id: string; section: string }

export function parseEveLink(url: string): EveLink | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  // `eve://open?…`: WebKit and Node read "open" as the host; some parsers give it as the path
  const action = u.host || u.pathname.replace(/^\/+/, '');
  if (u.protocol !== 'eve:' || action !== 'open') return null;
  const id = u.searchParams.get('id')?.trim() ?? '';
  if (!id || id.length > 200) return null;
  return { id, section: (u.searchParams.get('section') ?? '').trim() };
}
