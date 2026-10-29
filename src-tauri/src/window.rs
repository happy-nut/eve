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
    });
    Ok(())
}

/// how long a summoned window waits for the page before it is seen anyway
const FALLBACK_MS: u64 = 1500;
static SUMMONS: AtomicU64 = AtomicU64::new(0);
static SEEN: AtomicU64 = AtomicU64::new(0);
static SUMMONED_AT: Mutex<Option<std::time::Instant>> = Mutex::new(None);

/// The page has drawn since summon `n`: the window is seen.
#[tauri::command]
pub(crate) fn reveal_window(app: AppHandle, n: Option<u64>) {
    reveal(&app, n.unwrap_or_else(|| SUMMONS.load(Ordering::SeqCst)), "drawn");
}

/// seen once per summon, by whichever comes first; how long it took is written down (Logs/dev.happynut.eve/summon.log),
/// so a white page on someone's Mac says why
fn reveal(app: &AppHandle, n: u64, how: &'static str) {
    if SEEN.fetch_max(n, Ordering::SeqCst) >= n { return; }
    let ms = SUMMONED_AT.lock().unwrap().map(|t| t.elapsed().as_millis()).unwrap_or(0);
    let log = app.path().app_log_dir().ok().map(|d| d.join("summon.log"));
    crate::mac::set_seen(app, true, Some(Box::new(move |visible: Option<bool>| {
        let Some(path) = log else { return };
        let _ = std::fs::create_dir_all(path.parent().unwrap());
        // kept short: the last few hundred summons
        if std::fs::metadata(&path).map(|m| m.len() > 64 * 1024).unwrap_or(false) { let _ = std::fs::remove_file(&path); }
        let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let shown = match visible { Some(true) => "on screen", Some(false) => "hidden from WebKit (occluded)", None => "?" };
        let line = format!("{at} summon {n}: {how} after {ms} ms; before it was seen the window was {shown}\n");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) { let _ = f.write_all(line.as_bytes()); }
    })));
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
