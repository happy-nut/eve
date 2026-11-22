use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub(crate) fn is_front(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) fn show_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    #[cfg(target_os = "macos")]
    app.show().map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    // set_focus only makes the *window* key; the webview can come back without being first responder,
    // and then the page gets no keystrokes at all however the DOM focus looks.
    #[cfg(desktop)]
    {
        let webview: &tauri::Webview<_> = win.as_ref();
        let _ = webview.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn summon_window(app: AppHandle) -> Result<(), String> {
    use tauri::Emitter;
    let n = SUMMONS.fetch_add(1, Ordering::SeqCst) + 1;
    *SUMMONED_AT.lock().unwrap() = Some(std::time::Instant::now());
    crate::mac::set_opaque(&app, false, None);
    show_window(app.clone())?;
    let _ = app.emit("eve-reveal", n);
    std::thread::spawn(move || reveal_then_reload_if_stuck(&app, n));
    Ok(())
}

fn reveal_then_reload_if_stuck(app: &AppHandle, n: u64) {
    std::thread::sleep(std::time::Duration::from_millis(REVEAL_ANYWAY_MS));
    reveal(app, n, "not drawn: seen anyway");
    std::thread::sleep(std::time::Duration::from_millis(RELOAD_SILENT_PAGE_MS));
    let Some(w) = app.get_webview_window("main") else { return };
    if stuck(LAST_DRAWN_SUMMON.load(Ordering::SeqCst), n, w.is_visible().unwrap_or(false)) {
        note(app, format!("summon {n}: the page never answered: loaded again"));
        crate::mac::end_page(app);
        let _ = w.reload();
    }
}

fn stuck(answered: u64, n: u64, visible: bool) -> bool {
    visible && answered < n
}

/// WebKit's process that draws the page ended (macOS took its memory while Eve was hidden, or it crashed): the page
/// loaded again. Tauri's own does this too, but gives up without a word when it cannot reach the window at that moment,
/// and the window was then white for good.
pub(crate) fn page_ended<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    note(webview.app_handle(), "the page's process ended: loaded again".into());
    let _ = webview.reload();
}

const REVEAL_ANYWAY_MS: u64 = 1500;
const RELOAD_SILENT_PAGE_MS: u64 = 5000;
static SUMMONS: AtomicU64 = AtomicU64::new(0);
static LAST_DRAWN_SUMMON: AtomicU64 = AtomicU64::new(0);
static SEEN: AtomicU64 = AtomicU64::new(0);
static SUMMONED_AT: Mutex<Option<std::time::Instant>> = Mutex::new(None);

#[tauri::command]
pub(crate) fn reveal_window(app: AppHandle, n: Option<u64>) {
    let n = n.unwrap_or_else(|| SUMMONS.load(Ordering::SeqCst));
    LAST_DRAWN_SUMMON.fetch_max(n, Ordering::SeqCst);
    reveal(&app, n, "drawn");
}

fn reveal(app: &AppHandle, n: u64, how: &'static str) {
    if SEEN.fetch_max(n, Ordering::SeqCst) >= n { return; }
    let ms = SUMMONED_AT.lock().unwrap().map(|t| t.elapsed().as_millis()).unwrap_or(0);
    let app2 = app.clone();
    crate::mac::set_opaque(app, true, Some(Box::new(move |visible: Option<bool>| {
        let shown = match visible { Some(true) => "on screen", Some(false) => "hidden from WebKit (occluded)", None => "?" };
        note(&app2, format!("summon {n}: {how} after {ms} ms; before it was seen the window was {shown}"));
    })));
}

/// a line in Logs/dev.happynut.eve/summon.log, kept short: the last few hundred
fn note<R: tauri::Runtime>(app: &AppHandle<R>, line: String) {
    let Some(path) = app.path().app_log_dir().ok().map(|d| d.join("summon.log")) else { return };
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    if std::fs::metadata(&path).map(|m| m.len() > 64 * 1024).unwrap_or(false) { let _ = std::fs::remove_file(&path); }
    let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) { let _ = writeln!(f, "{at} {line}"); }
}

/// Show + focus the main window, or hide the whole app (returning focus to the previous app).
#[tauri::command]
pub(crate) fn toggle_window(app: AppHandle) -> Result<(), String> {
    if is_front(app.clone()) { hide_app(app) } else { show_window(app) }
}

#[tauri::command]
pub(crate) fn hide_app(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return app.hide().map_err(|e| e.to_string());
    #[cfg(not(target_os = "macos"))]
    app.get_webview_window("main")
        .ok_or("no main window")?
        .hide()
        .map_err(|e| e.to_string())
}

/// Like Raycast: no Dock icon and no ⌘Tab entry (Settings → Hide from Dock). The window is still summoned by
/// the hotkey, Finder "Open With" or `open -a Eve`; key equivalents (⌘C/V/Z/Q…) still route through the hidden menu.
#[tauri::command]
pub(crate) fn set_dock_hidden(app: AppHandle, hidden: bool) -> Result<(), String> {
    // becoming an accessory app deactivates it, and its window drops behind the app below. Eve started by a link
    // (eve://updated after an update, `eve open`) has just shown its window, then the page applies this: Eve
    // looked like it never came back. At login there is no link, and the window stays out of the way as before.
    #[cfg(target_os = "macos")]
    {
        let front = is_front(app.clone()) && app.state::<crate::PendingLink>().0.lock().unwrap().is_some();
        app.set_activation_policy(if hidden { tauri::ActivationPolicy::Accessory } else { tauri::ActivationPolicy::Regular })
            .map_err(|e| e.to_string())?;
        // the deactivation lands a moment later: shown again at once, it was undone (a test app needed ≥50 ms)
        if front {
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(150));
                let _ = show_window(app);
            });
        }
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::stuck;

    /// a page that drew for the summon (or a later one) is left alone; one that said nothing, on screen, is loaded
    /// again (it stayed white for good); one put away before it could draw is not
    #[test]
    fn a_page_that_never_answers_is_loaded_again() {
        assert!(!stuck(3, 3, true));
        assert!(!stuck(4, 3, true));
        assert!(stuck(2, 3, true));
        assert!(!stuck(2, 3, false));
    }
}
