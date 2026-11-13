//! What the page's memory comes to, written down once a minute with what was done since: Eve was seen holding
//! gigabytes now and then, and a test that switches and types never got past a few hundred megabytes. The log says
//! which actions came before a climb. It is `memory.log` beside the notes folder (macOS only; a phone's WebView is
//! not a process of its own to look at).
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// What the page did since the last line: a note opened (its size), a panel, a sync. Kept short; a minute of
/// switching through notes is counted, not listed.
#[derive(Default)]
pub(crate) struct Marks(Mutex<Vec<String>>);

#[tauri::command]
pub(crate) fn mem_mark(marks: State<Marks>, what: String) {
    let mut m = marks.0.lock().unwrap();
    if m.len() < 200 { m.push(what) }
}

/// "note ×12, pdf, sync ×2": each kind of action once, with how many times, in the order first done.
fn summary(marks: Vec<String>) -> String {
    let mut kinds: Vec<(String, usize)> = Vec::new();
    for m in marks {
        match kinds.iter_mut().find(|(k, _)| *k == m) {
            Some((_, n)) => *n += 1,
            None => kinds.push((m, 1)),
        }
    }
    kinds.iter().map(|(k, n)| if *n > 1 { format!("{k} ×{n}") } else { k.clone() }).collect::<Vec<_>>().join(", ")
}

/// Seconds since 1970 as UTC `2026-11-13 09:41` (days to a date: Howard Hinnant's civil_from_days).
fn utc(secs: u64) -> String {
    let (days, rem) = ((secs / 86400) as i64, secs % 86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y}-{m:02}-{d:02} {:02}:{:02}", rem / 3600, rem % 3600 / 60)
}

#[cfg(target_os = "macos")]
fn footprint(pid: i32) -> Option<(u64, u64)> {
    let mut info: libc::rusage_info_v4 = unsafe { std::mem::zeroed() };
    let ok = unsafe { libc::proc_pid_rusage(pid, libc::RUSAGE_INFO_V4, &mut info as *mut _ as *mut libc::rusage_info_t) };
    (ok == 0).then_some((info.ri_phys_footprint >> 20, info.ri_lifetime_max_phys_footprint >> 20))
}

/// The process drawing the page (WebKit's own, not Eve's): asked of the webview on the main thread.
#[cfg(target_os = "macos")]
fn web_pid(app: &AppHandle) -> Option<i32> {
    use tauri::Manager;
    let window = app.get_webview_window("main")?;
    let (tx, rx) = std::sync::mpsc::channel();
    window.with_webview(move |platform| unsafe {
        use objc2::{runtime::NSObjectProtocol, sel};
        let webview: &objc2_web_kit::WKWebView = &*(platform.inner() as *mut objc2_web_kit::WKWebView);
        let pid: i32 = if webview.respondsToSelector(sel!(_webProcessIdentifier)) { objc2::msg_send![webview, _webProcessIdentifier] } else { 0 };
        let _ = tx.send(pid);
    }).ok()?;
    rx.recv_timeout(std::time::Duration::from_secs(5)).ok().filter(|p| *p > 0)
}

/// One line a minute: `2026-11-13 09:41  page 342 MB (most 512)  app 38 MB  note ×12, pdf`. The file keeps its last
/// half megabyte or so.
pub(crate) fn watch(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        use tauri::Manager;
        let Ok(path) = tauri::Manager::path(app).app_data_dir().map(|d| d.join("memory.log")) else { return };
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let Some((web, most)) = web_pid(&app).and_then(footprint) else { continue };
            let own = footprint(std::process::id() as i32).map_or(0, |f| f.0);
            let done = summary(std::mem::take(&mut *app.state::<Marks>().0.lock().unwrap()));
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
            let line = format!("{}  page {web} MB (most {most})  app {own} MB  {done}\n", utc(now));
            if std::fs::metadata(&path).is_ok_and(|m| m.len() > 1 << 20) {
                if let Ok(old) = std::fs::read(&path) {
                    let half = old.len() / 2;
                    let cut = old[half..].iter().position(|b| *b == b'\n').map_or(half, |i| half + i + 1);
                    let _ = std::fs::write(&path, &old[cut..]);
                }
            }
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) { let _ = f.write_all(line.as_bytes()); }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_date_and_a_count() {
        assert_eq!(utc(0), "1970-01-01 00:00");
        assert_eq!(utc(1_794_451_857), "2026-11-12 02:50");
        assert_eq!(summary(vec!["note".into(), "pdf".into(), "note".into()]), "note ×2, pdf");
    }
}
