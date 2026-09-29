//! Settings → Claude: one click registers `eve mcp` (mcp.rs) with the Claude apps on this Mac.
//!
//! Claude Desktop reads its servers from a JSON file we edit in place (every other key kept).
//! Claude Code keeps its own in ~/.claude.json, a file it rewrites constantly, so that one goes
//! through its CLI (`claude mcp add --scope user`) instead of being edited under its feet.
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const NAME: &str = "eve";

#[derive(Serialize, Clone)]
pub(crate) struct Client {
    id: &'static str,
    name: &'static str,
    /// the app / CLI is on this Mac
    installed: bool,
    /// registered, pointing at this copy of Eve
    connected: bool,
    /// registered, but at another path (Eve moved, or a dev build registered it)
    stale: bool,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

fn desktop_config() -> PathBuf {
    home().join("Library/Application Support/Claude/claude_desktop_config.json")
}

/// The command a client should start: this very executable.
fn exe() -> Result<String, String> {
    let path = std::env::current_exe().and_then(|p| p.canonicalize()).map_err(|e| e.to_string())?;
    let path = path.to_string_lossy().into_owned();
    // a quarantined app runs from a random read-only copy that is gone after a restart
    if path.contains("/AppTranslocation/") {
        return Err("Move Eve to the Applications folder first, then connect.".into());
    }
    Ok(path)
}

// ---- the JSON config: pure, tested ------------------------------------------------
/// The command `mcpServers.eve` starts, if the config has one.
pub(crate) fn registered(config: &str) -> Option<String> {
    let v: Value = serde_json::from_str(config).ok()?;
    v.get("mcpServers")?.get(NAME)?.get("command")?.as_str().map(str::to_string)
}

/// `config` with `mcpServers.eve` set to run `exe mcp` (or removed), everything else as it was.
pub(crate) fn with_eve(config: &str, exe: Option<&str>) -> Result<String, String> {
    let mut root: Value = if config.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(config).map_err(|e| format!("Claude's config is not valid JSON ({e}); fix or remove it first."))?
    };
    let obj = root.as_object_mut().ok_or("Claude's config is not a JSON object.")?;
    let servers = obj.entry("mcpServers").or_insert_with(|| Value::Object(Map::new()));
    let servers = servers.as_object_mut().ok_or("mcpServers in Claude's config is not an object.")?;
    match exe {
        Some(exe) => {
            servers.insert(NAME.into(), json!({ "command": exe, "args": ["mcp"] }));
        }
        None => {
            servers.remove(NAME);
        }
    }
    serde_json::to_string_pretty(&root).map(|s| s + "\n").map_err(|e| e.to_string())
}

fn status(installed: bool, command: Option<String>, me: &str) -> (bool, bool, bool) {
    let connected = command.as_deref() == Some(me);
    (installed, connected, command.is_some() && !connected)
}

// ---- Claude Desktop -------------------------------------------------------------
fn desktop(me: &str) -> Client {
    let path = desktop_config();
    let installed = Path::new("/Applications/Claude.app").exists()
        || home().join("Applications/Claude.app").exists()
        || path.parent().is_some_and(Path::exists);
    let command = std::fs::read_to_string(&path).ok().and_then(|c| registered(&c));
    let (installed, connected, stale) = status(installed, command, me);
    Client { id: "desktop", name: "Claude Desktop", installed, connected, stale }
}

fn desktop_set(on: bool, me: &str) -> Result<(), String> {
    let path = desktop_config();
    let old = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    if old.is_empty() && !on {
        return Ok(());
    }
    let new = with_eve(&old, on.then_some(me))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    crate::files::write_atomic(&path, new.as_bytes())
}

// ---- Claude Code ------------------------------------------------------------------
/// `sh`-quoted, for a line handed to the user's shell.
fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Run a line in the user's login shell: an app started from the Dock gets a bare PATH, and the
/// `claude` CLI (and the node it may need) live wherever the shell's profile says.
fn shell(line: &str) -> Result<std::process::Output, String> {
    let sh = std::env::var("SHELL").ok().filter(|s| s.starts_with('/')).unwrap_or_else(|| "/bin/zsh".into());
    let home = home();
    let extra = [".local/bin", ".claude/local", ".npm-global/bin", ".bun/bin", ".volta/bin"]
        .iter()
        .map(|d| home.join(d).to_string_lossy().into_owned())
        .chain(["/opt/homebrew/bin".to_string(), "/usr/local/bin".to_string()])
        .collect::<Vec<_>>()
        .join(":");
    let mut cmd = std::process::Command::new(sh);
    cmd.arg("-ilc")
        .arg(format!("export PATH=\"$PATH:{extra}\"; {line}"))
        .stdin(std::process::Stdio::null());
    crate::mac::run_with_deadline(cmd, std::time::Duration::from_secs(30))
}

fn claude_cli() -> bool {
    shell("command -v claude").is_ok_and(|o| {
        o.status.success() && String::from_utf8_lossy(&o.stdout).lines().any(|l| l.trim_start().starts_with('/'))
    })
}

fn code(me: &str) -> Client {
    // user-scoped servers sit at the top of ~/.claude.json
    let command = std::fs::read_to_string(home().join(".claude.json")).ok().and_then(|c| registered(&c));
    let (installed, connected, stale) = status(claude_cli(), command, me);
    Client { id: "code", name: "Claude Code", installed, connected, stale }
}

fn code_set(on: bool, me: &str) -> Result<(), String> {
    // `add` refuses a name that exists, so an old entry (another path) goes first
    let mut line = format!("claude mcp remove --scope user {NAME} >/dev/null 2>&1;");
    if on {
        line += &format!(" claude mcp add --scope user {NAME} -- {} mcp", quote(me));
    } else {
        line += " true";
    }
    let out = shell(&line)?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    let last = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("claude mcp add failed");
    Err(format!("Claude Code: {}", last.trim()))
}

// ---- commands -----------------------------------------------------------------------
fn clients() -> Result<Vec<Client>, String> {
    let me = exe()?;
    Ok(vec![desktop(&me), code(&me)])
}

/// Which Claude apps are here, and whether each already runs `eve mcp`.
#[tauri::command]
pub(crate) async fn mcp_clients() -> Result<Vec<Client>, String> {
    clients()
}

/// Register (`on`) or unregister Eve with every Claude app found here. Returns the new state.
#[tauri::command]
pub(crate) async fn mcp_connect(on: bool) -> Result<Vec<Client>, String> {
    let me = exe()?;
    let mut errors = Vec::new();
    for c in clients()?.into_iter().filter(|c| c.installed) {
        let done = match c.id {
            "desktop" => desktop_set(on, &me),
            _ => code_set(on, &me),
        };
        if let Err(e) = done {
            errors.push(e);
        }
    }
    if errors.is_empty() { clients() } else { Err(errors.join("\n")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_and_removes_eve_keeping_the_rest() {
        let config = r#"{ "globalShortcut": "Alt+Space", "mcpServers": { "other": { "command": "x" } } }"#;
        let on = with_eve(config, Some("/Applications/Eve.app/Contents/MacOS/eve")).unwrap();
        assert_eq!(registered(&on).as_deref(), Some("/Applications/Eve.app/Contents/MacOS/eve"));
        let v: Value = serde_json::from_str(&on).unwrap();
        assert_eq!(v["globalShortcut"], "Alt+Space");
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
        assert_eq!(v["mcpServers"]["eve"]["args"], json!(["mcp"]));
        let off = with_eve(&on, None).unwrap();
        assert_eq!(registered(&off), None);
        assert_eq!(serde_json::from_str::<Value>(&off).unwrap()["mcpServers"]["other"]["command"], "x");
    }

    #[test]
    fn starts_a_missing_config_and_refuses_a_broken_one() {
        assert_eq!(registered(&with_eve("", Some("/e")).unwrap()).as_deref(), Some("/e"));
        assert!(with_eve("{ not json", Some("/e")).is_err());
        assert!(with_eve("[]", Some("/e")).is_err());
        assert!(with_eve(r#"{ "mcpServers": 3 }"#, Some("/e")).is_err());
    }

    #[test]
    fn quotes_for_the_shell() {
        assert_eq!(quote("/Applications/Eve.app/x"), "'/Applications/Eve.app/x'");
        assert_eq!(quote("/a b/it's"), r"'/a b/it'\''s'");
    }

    #[test]
    fn stale_means_registered_elsewhere() {
        assert_eq!(status(true, Some("/me".into()), "/me"), (true, true, false));
        assert_eq!(status(true, Some("/old".into()), "/me"), (true, false, true));
        assert_eq!(status(true, None, "/me"), (true, false, false));
    }
}
