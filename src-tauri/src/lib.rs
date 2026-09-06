use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager, WindowEvent};

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("invalid note id".into());
    }
    Ok(())
}

/// Returns raw file contents of every note; parsing happens in the frontend.
#[tauri::command]
fn list_notes(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = notes_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(fs::read_to_string(path).map_err(|e| e.to_string())?);
        }
    }
    Ok(out)
}

#[tauri::command]
fn write_note(app: AppHandle, id: String, text: String) -> Result<(), String> {
    safe_id(&id)?;
    let path = notes_dir(&app)?.join(format!("{id}.md"));
    let tmp = path.with_extension("md.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

/// Copy an image picked by the user into notes/assets and return its note-relative path.
#[tauri::command]
fn import_asset(app: AppHandle, src: String) -> Result<String, String> {
    let src = PathBuf::from(src);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].contains(&e.as_str()))
        .ok_or("unsupported image type")?;
    let dir = notes_dir(&app)?.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let name = format!("{stamp:x}.{ext}");
    fs::copy(&src, dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

#[tauri::command]
fn notes_path(app: AppHandle) -> Result<String, String> {
    Ok(notes_dir(&app)?.to_string_lossy().into_owned())
}

/// Show + focus the main window, or hide the whole app (returning focus to the previous app).
#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    let visible = win.is_visible().unwrap_or(false);
    let focused = win.is_focused().unwrap_or(false);
    if visible && focused {
        hide_app(app)
    } else {
        #[cfg(target_os = "macos")]
        app.show().map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn hide_app(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return app.hide().map_err(|e| e.to_string());
    #[cfg(not(target_os = "macos"))]
    app.get_webview_window("main")
        .ok_or("no main window")?
        .hide()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_notes,
            write_note,
            import_asset,
            notes_path,
            toggle_window,
            hide_app
        ])
        .on_window_event(|window, event| {
            // Closing the window keeps the app alive so the global hotkey still works.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_app(window.app_handle().clone());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running eve");
}
