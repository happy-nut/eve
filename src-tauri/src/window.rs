//! The one window: summon, dismiss, Dock, always on top.
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
