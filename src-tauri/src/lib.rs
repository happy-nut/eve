use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/// Files macOS asked us to open before the frontend was listening.
#[derive(Default)]
struct Pending(Mutex<Vec<String>>);

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
    write_atomic(&path, text.as_bytes())
}

fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = notes_dir(app)?.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

const IMAGE_EXTS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"];

fn safe_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if ok { Ok(()) } else { Err("invalid asset name".into()) }
}

fn stamp_name(ext: &str) -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{stamp:x}.{ext}")
}

fn raw_body(request: &tauri::ipc::Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => Ok(b.clone()),
        _ => Err("expected raw bytes".into()),
    }
}

fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
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
        .filter(|e| IMAGE_EXTS.contains(&e.as_str()))
        .ok_or("unsupported image type")?;
    let name = stamp_name(&ext);
    fs::copy(&src, assets_dir(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

/// Image bytes from the clipboard / a drop, saved into notes/assets. Body = raw bytes, header x-ext = extension.
#[tauri::command]
fn save_asset(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let ext = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("png")
        .to_ascii_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("unsupported image type".into());
    }
    let name = stamp_name(&ext);
    fs::write(assets_dir(&app)?.join(&name), raw_body(&request)?).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

// ---- sync: the assets folder as a list of immutable named blobs -------------
#[tauri::command]
fn list_assets(app: AppHandle) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(assets_dir(&app)?).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if safe_name(&name).is_ok() && entry.path().is_file() {
            out.push(name);
        }
    }
    Ok(out)
}

/// Raw bytes of one asset (arrives in JS as an ArrayBuffer).
#[tauri::command]
fn read_asset(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    safe_name(&name)?;
    let bytes = fs::read(assets_dir(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// An asset pulled from sync. Body = raw bytes, header x-name = file name.
#[tauri::command]
fn write_asset(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-name")?
        .to_string();
    safe_name(&name)?;
    write_atomic(&assets_dir(&app)?.join(&name), &raw_body(&request)?)
}

// ---- GitHub sign-in (device flow) -------------------------------------------
/// github.com/login/* has no CORS headers, so the two device-flow POSTs run here through macOS's curl.
/// `form` = [[key, value], ...]. Async so the main thread never blocks.
#[tauri::command]
async fn github_post(url: String, form: Vec<(String, String)>) -> Result<String, String> {
    if !url.starts_with("https://github.com/login/") {
        return Err("url not allowed".into());
    }
    let mut cmd = std::process::Command::new("curl");
    cmd.args(["-sS", "-X", "POST", "-H", "Accept: application/json", &url]);
    for (k, v) in &form {
        cmd.args(["--data-urlencode", &format!("{k}={v}")]);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn is_web_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// Open a link in the default browser (device-flow page, bookmark cards).
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err("url not allowed".into());
    }
    let ok = std::process::Command::new("open").arg(&url).status().map_err(|e| e.to_string())?.success();
    if ok { Ok(()) } else { Err("could not open the browser".into()) }
}

/// Page HTML for link previews (og:* tags). curl keeps the webview's cookies and CORS out of it; the
/// body is cut at 300k chars, plenty for <head>.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    if !is_web_url(&url) {
        return Err("url not allowed".into());
    }
    let out = std::process::Command::new("curl")
        .args(["-sSL", "--max-time", "8", "--max-filesize", "5000000", "--compressed", "-A",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", &url])
        .output()
        .map_err(|e| e.to_string())?;
    let mut html = String::from_utf8_lossy(&out.stdout).into_owned();
    if html.is_empty() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    if let Some((i, _)) = html.char_indices().nth(300_000) {
        html.truncate(i);
    }
    Ok(html)
}

/// External files (opened via Finder / "Open With"). Edited in place, never synced.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, text: String) -> Result<(), String> {
    fs::write(path, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn take_pending_files(pending: tauri::State<Pending>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap())
}

#[tauri::command]
fn notes_path(app: AppHandle) -> Result<String, String> {
    Ok(notes_dir(&app)?.to_string_lossy().into_owned())
}

/// Is the main window currently visible and frontmost? (the frontend decides whether to summon or dismiss)
#[tauri::command]
fn is_front(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// Show + focus the main window.
#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    #[cfg(target_os = "macos")]
    app.show().map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

/// Show + focus the main window, or hide the whole app (returning focus to the previous app).
#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    if is_front(app.clone()) { hide_app(app) } else { show_window(app) }
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
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(Pending::default())
        .invoke_handler(tauri::generate_handler![
            list_notes,
            write_note,
            import_asset,
            save_asset,
            list_assets,
            read_asset,
            write_asset,
            github_post,
            open_url,
            fetch_url,
            read_file,
            write_file,
            take_pending_files,
            notes_path,
            toggle_window,
            is_front,
            show_window,
            hide_app
        ])
        .on_window_event(|window, event| {
            // Closing the window keeps the app alive so the global hotkey still works.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_app(window.app_handle().clone());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building eve")
        .run(|app, event| {
            // Finder "Open With", double-click on a .md, `open -a Eve file.md`
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                app.state::<Pending>().0.lock().unwrap().extend(paths.clone());
                let _ = app.emit("open-files", paths);
                if let Some(win) = app.get_webview_window("main") {
                    let _ = app.show();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        });
}
