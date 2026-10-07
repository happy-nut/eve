//! The Mac's own updates, like the phone's (Updater.kt): the page finds a newer release (src/lib/update.ts)
//! and this downloads its Eve-macos-arm64.zip, checks it against the SHA-256 GitHub lists for it, and puts
//! the Eve.app inside in place of this one, then starts it again.
//!
//! The app is ad-hoc signed and not notarized, so there is no signature to check beyond GitHub's digest;
//! the zip is fetched over HTTPS from this repository's releases only. Files a program downloads itself
//! carry no quarantine flag, so Gatekeeper does not stop the new copy (the flag is cleared anyway). The
//! Homebrew cask is `version :latest`, so brew keeps no version of its own that this could contradict.
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const PREFIX: &str = "https://github.com/happy-nut/eve/releases/download/";
const ASSET: &str = "/Eve-macos-arm64.zip";

/// The only downloads an update may come from: this repository's Mac zip.
pub(crate) fn allowed(url: &str) -> bool {
    url.starts_with(PREFIX) && url.ends_with(ASSET) && !url[PREFIX.len()..].contains("..")
}

/// A digest as the releases API lists it ("sha256:<64 hex>"), or bare hex, as lowercase hex.
pub(crate) fn sha256_of(digest: &str) -> Option<String> {
    let hex = digest.strip_prefix("sha256:").unwrap_or(digest).to_ascii_lowercase();
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit())).then_some(hex)
}

/// The .app this executable runs from: …/Eve.app/Contents/MacOS/eve -> …/Eve.app.
pub(crate) fn bundle_of(exe: &Path) -> Result<PathBuf, String> {
    let bundle = exe.parent().and_then(Path::parent).and_then(Path::parent).ok_or("Eve is not running from an app.")?;
    let ok = exe.parent().and_then(Path::file_name).is_some_and(|n| n == "MacOS")
        && bundle.extension().is_some_and(|e| e == "app");
    if !ok {
        return Err("Eve is not running from an app (a development build?), so it cannot update itself.".into());
    }
    if bundle.to_string_lossy().contains("/AppTranslocation/") {
        return Err("Move Eve to the Applications folder first, then update.".into());
    }
    Ok(bundle.to_path_buf())
}

fn run(cmd: &str, args: &[&std::ffi::OsStr]) -> Result<String, String> {
    let out = std::process::Command::new(cmd).args(args).output().map_err(|e| format!("{cmd}: {e}"))?;
    if !out.status.success() {
        return Err(format!("{cmd}: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// How a failed download starts its message: the one failure Homebrew is asked to take over (brew_update).
const DOWNLOAD_FAILED: &str = "Download failed";

/// Download `url` to `to`, reporting "downloading:<percent>" every 5%.
fn download(app: &AppHandle, url: &str, to: &Path) -> Result<(), String> {
    use std::io::{Read, Write};
    let agent = ureq::Agent::config_builder()
        .https_only(true)
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .timeout_global(Some(std::time::Duration::from_secs(600)))
        .build()
        .new_agent();
    let mut res = agent.get(url).call().map_err(|e| format!("{DOWNLOAD_FAILED}: {e}"))?;
    let total: u64 = res.headers().get("content-length").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut body = res.body_mut().with_config().limit(200 << 20).reader();
    let mut file = std::fs::File::create(to).map_err(|e| e.to_string())?;
    let (mut buf, mut done, mut shown) = (vec![0u8; 64 * 1024], 0u64, -1i64);
    loop {
        let n = body.read(&mut buf).map_err(|e| format!("{DOWNLOAD_FAILED}: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        let p = if total > 0 { (done * 100 / total) as i64 } else { -1 };
        if p >= 0 && p / 5 != shown / 5 {
            shown = p;
            let _ = app.emit("eve-update", format!("downloading:{p}"));
        }
    }
    file.sync_all().map_err(|e| e.to_string())
}

/// Download, check, swap in, restart. On any failure before the swap nothing of the old app is touched.
fn install(app: &AppHandle, url: &str, sha256: &str, version: &str) -> Result<(), String> {
    if !allowed(url) {
        return Err("That download is not an Eve release.".into());
    }
    let want = sha256_of(sha256).ok_or("The release lists no SHA-256 for its zip, so it cannot be checked.")?;
    if version.is_empty() || !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return Err("Not a version number.".into());
    }
    let exe = std::env::current_exe().and_then(|p| p.canonicalize()).map_err(|e| e.to_string())?;
    let bundle = bundle_of(&exe)?;
    let dir = bundle.parent().ok_or("Eve's folder is unknown.")?.to_path_buf();
    // everything happens next to the app, so the swap is two renames on one disk
    let work = dir.join(format!(".eve-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir(&work).map_err(|e| {
        format!("Eve cannot write to {} ({e}). Update with `brew reinstall --cask eve` instead.", dir.display())
    })?;
    let result = (|| {
        let zip = work.join("Eve.zip");
        let _ = app.emit("eve-update", "downloading");
        download(app, url, &zip)?;
        let got = run("/usr/bin/shasum", &["-a".as_ref(), "256".as_ref(), zip.as_os_str()])?;
        if got.split_whitespace().next() != Some(want.as_str()) {
            return Err("The download does not match the release's SHA-256; nothing was changed.".into());
        }
        let _ = app.emit("eve-update", "installing");
        run("/usr/bin/ditto", &["-x".as_ref(), "-k".as_ref(), zip.as_os_str(), work.as_os_str()])?;
        let new = work.join("Eve.app");
        let plist = new.join("Contents/Info.plist");
        let read = |key: &str| run("/usr/bin/plutil", &["-extract".as_ref(), key.as_ref(), "raw".as_ref(), plist.as_os_str()]);
        if read("CFBundleIdentifier")? != app.config().identifier {
            return Err("The download is not Eve; nothing was changed.".into());
        }
        if read("CFBundleShortVersionString")? != version {
            return Err(format!("The download is not Eve {version}; nothing was changed."));
        }
        let _ = run("/usr/bin/xattr", &["-dr".as_ref(), "com.apple.quarantine".as_ref(), new.as_os_str()]);
        // the swap: the old app aside, the new one in its place, the old one back if that fails
        let old = work.join("Eve-old.app");
        // macOS's App Management protection may refuse this; then nothing has changed yet
        std::fs::rename(&bundle, &old).map_err(|e| {
            format!("macOS did not let Eve replace itself ({e}). Allow Eve in System Settings → Privacy & Security → App Management, or update with `brew reinstall --cask eve`.")
        })?;
        if let Err(e) = std::fs::rename(&new, &bundle) {
            let _ = std::fs::rename(&old, &bundle);
            return Err(format!("Could not put the new Eve in place: {e}"));
        }
        Ok(())
    })();
    // the old app's files may go: this process already has what it runs from open
    let _ = std::fs::remove_dir_all(&work);
    result?;
    let _ = app.emit("eve-update", "restarting");
    // start the new copy once this one has gone (a second Eve would find the hotkey taken). Started bare it
    // would wait for the hotkey with no window, as at login, and the update looked like Eve had quit: handing
    // it an eve:// link brings the window up (RunEvent::Opened shows it; the page acts only on eve://open).
    std::process::Command::new("/bin/sh")
        .args(["-c", "while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; /usr/bin/open -a \"$2\" eve://updated", "sh"])
        .arg(std::process::id().to_string())
        .arg(&bundle)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Updated, but could not restart: {e}. Open Eve again."))?;
    app.exit(0);
    Ok(())
}

/// Homebrew's turn, in the user's own shell: a login, interactive one, so it has what their Terminal has —
/// a company network's proxy or mirror is set there (.zprofile, .zshrc), and a Mac app started from the Dock
/// has none of it. The cask quits Eve as it reinstalls (`uninstall quit:`), so this runs on in a process group
/// of its own, and starts the new Eve when brew is done (one brew could not quit goes first). brew is not
/// left to update itself or its taps first: the cask always fetches the latest release.
/// $1 the shell, $2 the log, $3 this Eve's pid. Exits as brew did (127: no Homebrew).
const BREW: &str = r#"shell="$1"; log="$2"; pid="$3"
mkdir -p "$(dirname "$log")"
"$shell" -l -i -c '
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_INSTALL_CLEANUP=1
  command -v brew >/dev/null 2>&1 || export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  command -v brew >/dev/null 2>&1 || { echo "Homebrew is not installed."; exit 127; }
  if brew list --cask eve >/dev/null 2>&1; then brew reinstall --cask happy-nut/tap/eve
  else brew install --cask --force happy-nut/tap/eve; fi
' >"$log" 2>&1 </dev/null
code=$?
echo "exit $code" >>"$log"
if [ "$code" -eq 0 ]; then
  kill "$pid" 2>/dev/null
  while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
  /usr/bin/open -b dev.happynut.eve eve://updated
elif ! kill -0 "$pid" 2>/dev/null; then
  /usr/bin/open -b dev.happynut.eve
fi
exit "$code"
"#;

/// The last lines brew wrote, for the message (all of it stays in the log).
fn tail(log: &Path, lines: usize) -> String {
    let text = std::fs::read_to_string(log).unwrap_or_default();
    let kept: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with("exit ")).collect();
    kept[kept.len().saturating_sub(lines)..].join("\n")
}

/// The download was refused (a company network that lets only Homebrew out): brew reinstalls Eve instead.
/// Returns once brew has; on success this Eve is quit and the new one started by the script.
fn brew(app: &AppHandle) -> Result<(), String> {
    let _ = app.emit("eve-update", "brew");
    let shell = std::env::var("SHELL").ok().filter(|s| s.starts_with('/') && Path::new(s).exists()).unwrap_or_else(|| "/bin/zsh".into());
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let log = Path::new(&home).join("Library/Logs/Eve/brew-update.log");
    let mut cmd = std::process::Command::new("/bin/sh");
    cmd.args(["-c", BREW, "sh", &shell])
        .arg(&log)
        .arg(std::process::id().to_string())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0); // lives on when brew quits this Eve
    let status = cmd.spawn().and_then(|mut c| c.wait()).map_err(|e| format!("Could not start Homebrew: {e}"))?;
    match status.code() {
        Some(0) => {
            let _ = app.emit("eve-update", "restarting");
            Ok(())
        }
        Some(127) => Err("Homebrew is not installed on this Mac, so it could not take over.".into()),
        _ => Err(format!("Homebrew could not update Eve either:\n{}\n(all of it: {})", tail(&log, 4), log.display())),
    }
}

/// Update this Mac's Eve to `version` from `url` (a release's Eve-macos-arm64.zip, with its `sha256`).
/// Progress arrives as "eve-update" events: downloading[:percent], installing, brew, restarting.
/// A download the network refuses is handed to Homebrew; any other failure is not (a zip that does not match
/// its SHA-256 must not be installed unchecked, which the cask would do; a Mac that will not let Eve replace
/// itself will not let a brew Eve started either).
#[tauri::command]
pub(crate) async fn install_update(app: AppHandle, url: String, sha256: String, version: String) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Updating in place is for the Mac.".into());
    }
    tauri::async_runtime::spawn_blocking(move || match install(&app, &url, &sha256, &version) {
        Err(e) if e.starts_with(DOWNLOAD_FAILED) => brew(&app).map_err(|b| format!("{e}\n{b}")),
        done => done,
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_repositorys_mac_zip() {
        assert!(allowed("https://github.com/happy-nut/eve/releases/download/v0.7.13/Eve-macos-arm64.zip"));
        assert!(!allowed("https://github.com/happy-nut/eve/releases/download/android-v0.7.19/Eve-android.apk"));
        assert!(!allowed("https://github.com/someone/eve/releases/download/v0.7.13/Eve-macos-arm64.zip"));
        assert!(!allowed("http://github.com/happy-nut/eve/releases/download/v0.7.13/Eve-macos-arm64.zip"));
        assert!(!allowed("https://github.com/happy-nut/eve/releases/download/../../x/Eve-macos-arm64.zip"));
    }

    #[test]
    fn digests() {
        let hex = "e6456e9b9438864be87090eeef3b4bc2c50c2c9ae171119659c381048b2cc5d8";
        assert_eq!(sha256_of(&format!("sha256:{hex}")).as_deref(), Some(hex));
        assert_eq!(sha256_of(&hex.to_uppercase()).as_deref(), Some(hex));
        assert!(sha256_of("sha256:abc").is_none());
        assert!(sha256_of("").is_none());
        assert!(sha256_of(&format!("sha1:{hex}")).is_none());
    }

    #[test]
    fn the_app_it_runs_from() {
        assert_eq!(bundle_of(Path::new("/Applications/Eve.app/Contents/MacOS/eve")).unwrap(), Path::new("/Applications/Eve.app"));
        assert!(bundle_of(Path::new("/Users/me/eve/src-tauri/target/debug/eve")).is_err());
        assert!(bundle_of(Path::new("/private/var/folders/x/AppTranslocation/y/d/Eve.app/Contents/MacOS/eve")).unwrap_err().contains("Applications"));
    }
}
