use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Default)]
pub(crate) struct Marks(Mutex<Vec<String>>);

#[tauri::command]
pub(crate) fn mem_mark(marks: State<Marks>, what: String) {
    let mut m = marks.0.lock().unwrap();
    if m.len() < 200 { m.push(what) }
}

#[cfg(any(target_os = "macos", test))]
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

#[cfg(any(target_os = "macos", test))]
fn utc(secs: u64) -> String {
    let (y, m, d) = crate::core::civil((secs / 86400) as i64);
    let rem = secs % 86400;
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
