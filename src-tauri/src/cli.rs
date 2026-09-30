//! `eve <command>` in a terminal: core's commands (the very ones Claude gets over MCP), their arguments
//! read from the command line, the answer printed. `eve help` lists them, `eve help <command>` shows one.
use crate::core::{self, command, notes_dir, Command, Kind};
use serde_json::{json, Map, Value};
use std::io::Write;

fn print(to_err: bool, text: &str) {
    let text = if text.ends_with('\n') { text.to_string() } else { format!("{text}\n") };
    // `eve list | head` closes the pipe early: that is not an error worth a panic
    let _ = if to_err { std::io::stderr().write_all(text.as_bytes()) } else { std::io::stdout().write_all(text.as_bytes()) };
}

/// The arguments after `eve <command>` as the JSON the command takes: `--name value` (or `--name=value`)
/// for any parameter, and bare words for the one that may be given bare (joined by spaces for a text,
/// one each for a list).
pub fn parse_args(cmd: &Command, argv: &[String]) -> Result<Value, String> {
    let mut out = Map::new();
    let mut bare: Vec<String> = Vec::new();
    let mut words = argv.iter();
    let mut flags_done = false;
    while let Some(word) = words.next() {
        let Some(flag) = word.strip_prefix("--").filter(|f| !flags_done && !f.is_empty()) else {
            if word == "--" && !flags_done {
                flags_done = true;
            } else {
                bare.push(word.clone());
            }
            continue;
        };
        let (name, inline) = match flag.split_once('=') {
            Some((n, v)) => (n, Some(v.to_string())),
            None => (flag, None),
        };
        let p = cmd
            .params
            .iter()
            .find(|p| p.name == name)
            .ok_or_else(|| format!("eve {} has no --{name}. See: eve help {}", cmd.cli, cmd.cli))?;
        let value = match inline {
            Some(v) => v,
            None => words.next().cloned().ok_or_else(|| format!("--{name} needs a value."))?,
        };
        match p.kind {
            Kind::Texts(..) => {
                let list = out.entry(name).or_insert_with(|| json!([]));
                list.as_array_mut().unwrap().push(json!(value));
            }
            _ if out.contains_key(name) => return Err(format!("--{name} is given twice.")),
            Kind::Number(..) => {
                let n: u64 = value.trim().parse().map_err(|_| format!("--{name} takes a whole number, not \"{value}\"."))?;
                out.insert(name.into(), json!(n));
            }
            Kind::Text => {
                out.insert(name.into(), json!(value));
            }
        }
    }
    if !bare.is_empty() {
        let p = cmd
            .params
            .iter()
            .find(|p| p.positional)
            .ok_or_else(|| format!("eve {} takes no bare words (\"{}\"). See: eve help {}", cmd.cli, bare.join(" "), cmd.cli))?;
        match p.kind {
            Kind::Texts(..) => {
                let list = out.entry(p.name).or_insert_with(|| json!([]));
                list.as_array_mut().unwrap().extend(bare.into_iter().map(Value::from));
            }
            _ if out.contains_key(p.name) => return Err(format!("--{} is given twice.", p.name)),
            _ => {
                out.insert(p.name.into(), json!(bare.join(" ")));
            }
        }
    }
    if let Some(p) = cmd.params.iter().find(|p| p.required && !out.contains_key(p.name)) {
        return Err(format!("eve {} needs <{}>. See: eve help {}", cmd.cli, p.name, cmd.cli));
    }
    Ok(Value::Object(out))
}

/// Run what the command line asks for. None: it asks for no command, so the app itself starts.
pub fn main(argv: Vec<String>) -> Option<i32> {
    let first = argv.first()?.as_str();
    let rest = &argv[1..];
    let answer = match first {
        // a Claude app started us as its notes server
        "mcp" => {
            crate::mcp::serve();
            return Some(0);
        }
        "help" | "--help" | "-h" => core::help(rest.first().map(String::as_str)),
        "version" | "--version" | "-V" => Ok(format!("eve {}", env!("CARGO_PKG_VERSION"))),
        // whatever macOS passes when it starts an app (-psn_…, -NS… defaults) is for the app
        _ if first.starts_with('-') => return None,
        _ => match command(first) {
            Some(cmd) if rest.iter().any(|a| a == "--help" || a == "-h") => core::help(Some(cmd.cli)),
            Some(cmd) => parse_args(cmd, rest).and_then(|args| core::run(&notes_dir(), cmd.tool, &args)),
            None => Err(format!("Unknown command \"{first}\". See: eve help")),
        },
    };
    Some(match answer {
        Ok(text) => {
            print(false, &text);
            0
        }
        Err(e) => {
            print(true, &format!("eve: {e}"));
            1
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(s: &str) -> Vec<String> {
        s.split(' ').filter(|w| !w.is_empty()).map(String::from).collect()
    }

    #[test]
    fn arguments_become_what_the_tool_takes() {
        let search = command("search").unwrap();
        assert_eq!(parse_args(search, &words("회의 결정 --group Work --limit 5")).unwrap(), json!({ "query": "회의 결정", "group": "Work", "limit": 5 }));
        assert_eq!(parse_args(search, &words("--query=plan --from 2026-09")).unwrap(), json!({ "query": "plan", "from": "2026-09" }));
        assert!(parse_args(search, &words("--group Work")).unwrap_err().contains("needs <query>"));
        assert!(parse_args(search, &words("x --limit five")).unwrap_err().contains("whole number"));
        assert!(parse_args(search, &words("x --nope 1")).unwrap_err().contains("has no --nope"));
        assert!(parse_args(search, &words("x --group")).unwrap_err().contains("needs a value"));
        assert!(parse_args(search, &words("x --query y")).unwrap_err().contains("twice"));
        // after --, a word that looks like a flag is a word
        assert_eq!(parse_args(search, &words("-- --not-a-flag")).unwrap(), json!({ "query": "--not-a-flag" }));

        let many = command("read-many").unwrap();
        assert_eq!(parse_args(many, &words("a b --ids c --cursor 1:2~3")).unwrap(), json!({ "ids": ["c", "a", "b"], "cursor": "1:2~3" }));
        let read = command("read").unwrap();
        assert_eq!(parse_args(read, &words("Weekly plan --section Goals")).unwrap(), json!({ "title": "Weekly plan", "section": "Goals" }));
        assert_eq!(parse_args(read, &words("--id abc")).unwrap(), json!({ "id": "abc" }));
        assert!(parse_args(command("list").unwrap(), &words("stray")).unwrap_err().contains("no bare words"));
    }

    #[test]
    fn help_is_written_from_the_commands() {
        let all = core::help(None).unwrap();
        for c in core::COMMANDS {
            assert!(all.contains(&format!("  {:<11}{}", c.cli, c.title)), "{all}");
        }
        assert!(all.contains("mcp") && all.contains("eve help <command>"));
        let one = core::help(Some("search")).unwrap();
        assert!(one.starts_with("eve search — Search notes\n"), "{one}");
        assert!(one.contains("Usage: eve search <query> [--group <group>] [--from <from>] [--to <to>] [--limit <n>]"), "{one}");
        assert!(one.contains("<query>, --query") && one.contains("— required") && one.contains("(default 20, 1–100)"), "{one}");
        // Claude's tool names read as the commands a terminal types
        assert!(one.contains("`eve read`") && !one.contains("read_note "), "{one}");
        assert!(one.contains("MCP tool search_notes"));
        assert_eq!(core::help(Some("open_note")).unwrap(), core::help(Some("open")).unwrap());
        assert!(core::help(Some("nope")).is_err());
        let many = core::help(Some("read-many")).unwrap();
        assert!(many.contains("eve read-many <id>..."), "{many}");
    }

    #[test]
    fn only_a_command_keeps_the_app_from_starting() {
        assert_eq!(main(vec![]), None);
        assert_eq!(main(words("-psn_0_12345")), None);
        assert_eq!(main(words("nope")), Some(1));
        assert_eq!(main(words("help")), Some(0));
        assert_eq!(main(words("search --help")), Some(0));
        assert_eq!(main(words("search")), Some(1));
    }
}
