//! The notes folder: notes, their assets, and files opened from outside.
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub(crate) fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("invalid note id".into());
    }
    Ok(())
}

/// Returns raw file contents of every note; parsing happens in the frontend.
#[tauri::command]
pub(crate) fn list_notes(app: AppHandle) -> Result<Vec<String>, String> {
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
pub(crate) fn write_note(app: AppHandle, id: String, text: String) -> Result<(), String> {
    safe_id(&id)?;
    let path = notes_dir(&app)?.join(format!("{id}.md"));
    write_atomic(&path, text.as_bytes())
}

pub(crate) fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = notes_dir(app)?.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// What may live in notes/assets: pictures, videos, and PDFs dropped into a note.
pub(crate) const ASSET_EXTS: [&str; 16] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "pdf", "mp4", "mov", "m4v", "webm",
    // documents the webview cannot draw itself: the viewer shows Quick Look's preview of them
    "xlsx", "xls", "hwp", "hwpx",
];

pub(crate) fn safe_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if ok { Ok(()) } else { Err("invalid asset name".into()) }
}

pub(crate) fn stamp_name(ext: &str) -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{stamp:x}.{ext}")
}

pub(crate) fn raw_body(request: &tauri::ipc::Request<'_>) -> Result<Vec<u8>, String> {
    use serde::Deserialize;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => Ok(b.clone()),
        // Android's IPC has no request bodies: the bytes come over as a JSON array of numbers
        tauri::ipc::InvokeBody::Json(v) => Vec::<u8>::deserialize(v).map_err(|_| "expected raw bytes".into()),
    }
}

pub(crate) fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

/// Copy a file picked by the user into notes/assets and return its note-relative path.
#[tauri::command]
pub(crate) fn import_asset(app: AppHandle, src: String) -> Result<String, String> {
    let src = PathBuf::from(src);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ASSET_EXTS.contains(&e.as_str()))
        .ok_or("unsupported file type")?;
    let name = stamp_name(&ext);
    fs::copy(&src, assets_dir(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

/// File bytes from the clipboard / a drop, saved into notes/assets. Body = raw bytes, header x-ext = extension.
#[tauri::command]
pub(crate) fn save_asset(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let ext = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("png")
        .to_ascii_lowercase();
    if !ASSET_EXTS.contains(&ext.as_str()) {
        return Err("unsupported file type".into());
    }
    let name = stamp_name(&ext);
    fs::write(assets_dir(&app)?.join(&name), raw_body(&request)?).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

// ---- sync: the assets folder as a list of immutable named blobs -------------
#[tauri::command]
pub(crate) fn list_assets(app: AppHandle) -> Result<Vec<String>, String> {
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
pub(crate) fn read_asset(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    safe_name(&name)?;
    let bytes = fs::read(assets_dir(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// An asset pulled from sync. Body = raw bytes, header x-name = file name.
#[tauri::command]
pub(crate) fn write_asset(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-name")?
        .to_string();
    safe_name(&name)?;
    write_atomic(&assets_dir(&app)?.join(&name), &raw_body(&request)?)
}

/// External files (opened via Finder / "Open With"). Edited in place, never synced.
#[tauri::command]
pub(crate) fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn write_file(path: String, text: String) -> Result<(), String> {
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Every file under a picked folder, as paths relative to it (hidden files skipped).
#[tauri::command]
pub(crate) fn list_folder(root: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&root);
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.file_name().and_then(|n| n.to_str()).is_none_or(|n| n.starts_with('.')) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(rel) = path.strip_prefix(&root) {
                out.push(rel.to_string_lossy().into_owned());
            }
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub(crate) fn notes_path(app: AppHandle) -> Result<String, String> {
    Ok(notes_dir(&app)?.to_string_lossy().into_owned())
}
