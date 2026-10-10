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

/// `<ms-hex>-<6 hex>.<ext>`. The millisecond alone is not enough: an import copies a note's
/// pictures at once, and two of them in one millisecond would share a name and the second
/// would overwrite the first. The suffix counts up from a random start, so names never repeat
/// within one run and two devices (or two runs) rarely pick the same one.
pub(crate) fn stamp_name(ext: &str) -> String {
    use std::hash::{BuildHasher, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::OnceLock;
    static START: OnceLock<u64> = OnceLock::new();
    static COUNT: AtomicU64 = AtomicU64::new(0);
    // std's hasher keys are random per process: enough randomness without another crate
    let start = *START.get_or_init(|| std::collections::hash_map::RandomState::new().build_hasher().finish());
    let n = start.wrapping_add(COUNT.fetch_add(1, Ordering::Relaxed)) & 0xff_ffff;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{stamp:x}-{n:06x}.{ext}")
}

/// A new file in notes/assets under a fresh name, filled by `fill`. Never replaces an
/// existing file: a name already taken (synced in from another device) just draws another.
fn create_asset(app: &AppHandle, ext: &str, mut fill: impl FnMut(&mut fs::File) -> std::io::Result<()>) -> Result<String, String> {
    let dir = assets_dir(app)?;
    for _ in 0..8 {
        let name = stamp_name(ext);
        let path = dir.join(&name);
        let mut file = match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            r => r.map_err(|e| e.to_string())?,
        };
        if let Err(e) = fill(&mut file) {
            // no half-written picture left behind for sync to pick up
            let _ = fs::remove_file(&path);
            return Err(e.to_string());
        }
        return Ok(format!("assets/{name}"));
    }
    Err("could not find a free asset name".into())
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
    let mut from = fs::File::open(&src).map_err(|e| e.to_string())?;
    create_asset(&app, &ext, |to| std::io::copy(&mut from, to).map(|_| ()))
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
    let bytes = raw_body(&request)?;
    create_asset(&app, &ext, |to| std::io::Write::write_all(to, &bytes))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// An import copies a note's pictures together, many inside one millisecond.
    #[test]
    fn stamp_names_in_a_row_are_distinct_and_safe() {
        let names: Vec<String> = (0..5000).map(|_| stamp_name("png")).collect();
        let unique: std::collections::HashSet<&String> = names.iter().collect();
        assert_eq!(unique.len(), names.len());
        for n in &names {
            assert!(safe_name(n).is_ok(), "{n}");
        }
        assert!(safe_name(&stamp_name("hwpx")).is_ok());
    }
}
