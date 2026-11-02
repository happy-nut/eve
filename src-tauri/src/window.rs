//! The one window: summon, dismiss, Dock, always on top.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Is the main window currently visible and frontmost? (the frontend decides whether to summon or dismiss)
#[tauri::command]
pub(crate) fn is_front(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// Show + focus the main window.
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

/// Summoned (the hotkey, a link from another app): shown and focused but not yet seen, until the page has drawn in it
/// again (`reveal_window`). While Eve was hidden WebKit may have let go of what the page drew, and a window seen at once
/// was white until the page drew again. The page is told to (`eve-reveal`); if it never says so, the window is seen
/// anyway, a while later: at 300 ms that was too soon on a busy Mac, just back from sleep, and it was seen white.
#[tauri::command]
pub(crate) fn summon_window(app: AppHandle) -> Result<(), String> {
    use tauri::Emitter;
    let n = SUMMONS.fetch_add(1, Ordering::SeqCst) + 1;
    *SUMMONED_AT.lock().unwrap() = Some(std::time::Instant::now());
    crate::mac::set_seen(&app, false, None);
    show_window(app.clone())?;
    let _ = app.emit("eve-reveal", n);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(FALLBACK_MS));
        reveal(&app, n, "not drawn: seen anyway");
        // still no word from the page a good while on: it is not slow, it is gone or stuck, and the window stayed
        // white for good until Eve was quit. Loaded again, it draws (the notes are on disk; the caret and ⌘Z are lost)
        std::thread::sleep(std::time::Duration::from_millis(STUCK_MS));
        let Some(w) = app.get_webview_window("main") else { return };
        if stuck(ANSWERED.load(Ordering::SeqCst), n, w.is_visible().unwrap_or(false)) {
            note(&app, format!("summon {n}: the page never answered: loaded again"));
            crate::mac::end_page(&app);
            let _ = w.reload();
        }
    });
    Ok(())
}

/// Summon `n` came up and the page never said it drew for it (nor for a later one): it is gone or stuck. Not when the
/// window was put away again meanwhile: a hidden page draws nothing, so it had nothing to say.
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

/// how long a summoned window waits for the page before it is seen anyway
const FALLBACK_MS: u64 = 1500;
/// and after that, how much longer before a page that has said nothing is taken for gone and loaded again
const STUCK_MS: u64 = 5000;
static SUMMONS: AtomicU64 = AtomicU64::new(0);
/// the last summon the page itself said it had drawn for (not the fallback's)
static ANSWERED: AtomicU64 = AtomicU64::new(0);
static SEEN: AtomicU64 = AtomicU64::new(0);
static SUMMONED_AT: Mutex<Option<std::time::Instant>> = Mutex::new(None);

/// The page has drawn since summon `n`: the window is seen.
#[tauri::command]
pub(crate) fn reveal_window(app: AppHandle, n: Option<u64>) {
    let n = n.unwrap_or_else(|| SUMMONS.load(Ordering::SeqCst));
    ANSWERED.fetch_max(n, Ordering::SeqCst);
    reveal(&app, n, "drawn");
}

/// seen once per summon, by whichever comes first; how long it took is written down (Logs/dev.happynut.eve/summon.log),
/// so a white page on someone's Mac says why
fn reveal(app: &AppHandle, n: u64, how: &'static str) {
    if SEEN.fetch_max(n, Ordering::SeqCst) >= n { return; }
    let ms = SUMMONED_AT.lock().unwrap().map(|t| t.elapsed().as_millis()).unwrap_or(0);
    let app2 = app.clone();
    crate::mac::set_seen(app, true, Some(Box::new(move |visible: Option<bool>| {
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
