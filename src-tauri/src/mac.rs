//! macOS only: Quick Look previews, printing a note to PDF / PNG, and being the .md handler.
use std::fs;
use tauri::{AppHandle, Manager};

use crate::files::{assets_dir, safe_name};

/// First page of a stored PDF as a PNG, for the card in a note. Rendered by Quick Look (the same
/// picture Finder shows) and cached, so a note full of PDFs costs one render each, once.
/// ponytail: runs qlmanage on the async runtime; if a huge PDF ever makes that felt, move it to
/// spawn_blocking.
#[tauri::command]
pub(crate) async fn pdf_thumb(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    safe_name(&name)?;
    let src = assets_dir(&app)?.join(&name);
    if !src.is_file() {
        return Err("no such asset".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let png = dir.join(format!("{name}.png")); // qlmanage names it after the whole file name
    if !png.is_file() {
        let out = std::process::Command::new("/usr/bin/qlmanage")
            .args(["-t", "-s", "320", "-o"])
            .arg(&dir)
            .arg(&src)
            .output()
            .map_err(|e| e.to_string())?;
        if !png.is_file() {
            return Err(format!("no thumbnail: {}", String::from_utf8_lossy(&out.stderr)));
        }
    }
    Ok(tauri::ipc::Response::new(
        fs::read(&png).map_err(|e| e.to_string())?,
    ))
}

/// Run a command, but never wait on it forever: Quick Look hangs indefinitely on a format no
/// generator on this Mac handles (a .hwp without Hancom Office does exactly that), and a hung
/// child would hold the viewer open on a spinner for good.
pub(crate) fn run_with_deadline(
    mut cmd: std::process::Command,
    deadline: std::time::Duration,
) -> Result<std::process::Output, String> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(_) => return child.wait_with_output().map_err(|e| e.to_string()),
            None if start.elapsed() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("timed out".into());
            }
            None => std::thread::sleep(std::time::Duration::from_millis(50)),
        }
    }
}

/// A stored document as HTML, for the floating viewer: Quick Look's own preview bundle — the one
/// Finder draws on the space bar — exported once into the cache, which is why a spreadsheet arrives
/// laid out as a table without this app knowing anything about the format. Returns the path of its
/// Preview.html. A PDF never comes through here: the webview draws that itself.
#[tauri::command]
pub(crate) async fn ql_preview(app: AppHandle, name: String) -> Result<String, String> {
    safe_name(&name)?;
    let src = assets_dir(&app)?.join(&name);
    if !src.is_file() {
        return Err("no such asset".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("previews");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // qlmanage names the bundle after the whole file name, and puts Preview.html inside it
    let html = dir.join(format!("{name}.qlpreview")).join("Preview.html");
    if html.is_file() {
        return Ok(html.to_string_lossy().into_owned());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("/usr/bin/qlmanage");
        cmd.args(["-p", "-o"]).arg(&dir).arg(&src);
        let out = run_with_deadline(cmd, std::time::Duration::from_secs(20))?;
        if !html.is_file() {
            return Err(format!(
                "no preview: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(html.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Hand a stored asset to whatever app owns it (Preview, for a PDF). The asset protocol URL the
/// webview renders means nothing to the rest of the system, so the file itself is opened by path.
#[tauri::command]
pub(crate) async fn open_asset(app: AppHandle, name: String) -> Result<(), String> {
    safe_name(&name)?;
    let path = assets_dir(&app)?.join(&name);
    if !path.is_file() {
        return Err("no such asset".into());
    }
    let ok = std::process::Command::new("open")
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?
        .success();
    if ok { Ok(()) } else { Err("could not open the file".into()) }
}

/// A print job finishes on the run loop, so the file appears a moment after the call that started it.
/// A PDF ends with its own end-of-file marker; until that is on disk the pages are still being written.
pub(crate) fn wait_for_pdf(path: &std::path::Path, secs: u64) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if let Ok(bytes) = fs::read(path) {
            if bytes.len() > 400 && bytes.ends_with(b"%%EOF\n") {
                return Ok(());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(60));
    }
    Err("the print job did not finish".into())
}

/// Export what the window shows as a PDF file, with margins and no panel in the way.
///
/// The note is printed, not screenshotted: a print job whose disposition is "save" writes the pages
/// straight to `out`, so it needs no printer connected and the text stays text. `@media print` in the
/// app's stylesheet is what strips the window chrome first. The job is started on the run loop and the
/// call returns — a print operation that blocks the main thread never finishes, WebKit needs it.
#[tauri::command(async)]
pub(crate) fn save_pdf(window: tauri::WebviewWindow, out: String, margin: f64) -> Result<(), String> {
    print_pdf(&window, &out, margin)?;
    wait_for_pdf(std::path::Path::new(&out), 60)
}

/// The note as a picture: the printed page, rasterised. Same margins, same pagination, same everything
/// — a long note simply becomes its first page. (`qlmanage` used to draw a standalone HTML page here,
/// on a square canvas that left half the picture empty.)
#[tauri::command(async)]
pub(crate) fn save_image(app: AppHandle, window: tauri::WebviewWindow, out: String, margin: f64, width: u32) -> Result<(), String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("export");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pdf = dir.join("note.pdf");
    let _ = fs::remove_file(&pdf);
    print_pdf(&window, &pdf.to_string_lossy(), margin)?;
    wait_for_pdf(&pdf, 60)?;
    let res = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "--resampleWidth", &width.to_string()])
        .arg(&pdf)
        .arg("--out")
        .arg(&out)
        .output()
        .map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&pdf);
    if !std::path::Path::new(&out).is_file() {
        return Err(format!("could not render: {}", String::from_utf8_lossy(&res.stderr)));
    }
    Ok(())
}

pub(crate) fn print_pdf(window: &tauri::WebviewWindow, out: &str, margin: f64) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, out, margin);
        return Err("PDF export is macOS only".into());
    }
    #[cfg(target_os = "macos")]
    {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, ProtocolObject};
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSWindow};
    use objc2_foundation::{NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let out = out.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |platform| {
            unsafe {
                let webview: &WKWebView = &*(platform.inner() as *mut WKWebView);
                let host: &NSWindow = &*(platform.ns_window() as *mut NSWindow);
                let info = NSPrintInfo::new();
                info.setTopMargin(margin);
                info.setBottomMargin(margin);
                info.setLeftMargin(margin);
                info.setRightMargin(margin);
                info.setJobDisposition(NSPrintSaveJob);
                let url: Retained<NSURL> = NSURL::fileURLWithPath(&NSString::from_str(&out));
                let target: &AnyObject = &url;
                info.dictionary()
                    .setObject_forKey(target, ProtocolObject::from_ref(NSPrintJobSavingURL));
                let op = webview.printOperationWithPrintInfo(&info);
                op.setShowsPrintPanel(false);
                op.setShowsProgressPanel(false);
                // Modal *for the window*, not for the thread: it returns at once and the job runs on the
                // run loop. `runOperation()` instead deadlocks — it blocks the main thread while WebKit
                // still needs it to lay the pages out, and the whole app stops with it.
                op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                    host,
                    None,
                    None,
                    std::ptr::null_mut(),
                );
            }
            let _ = tx.send(());
        })
        .map_err(|e| e.to_string())?;
    // only that the job was handed over — the pages are written as the run loop gets to them
    rx.recv_timeout(std::time::Duration::from_secs(10)).map_err(|e| e.to_string())
    }
}

/// Whether macOS opens .md files with this app, and the switch that claims them.
///
/// LaunchServices keeps one handler per content type; `duti` and friends are just wrappers around
/// these two calls, so the app makes them itself.
#[cfg(target_os = "macos")]
pub(crate) mod default_app {
    use core_foundation::base::{CFRelease, TCFType};
    use core_foundation::string::{CFString, CFStringRef};

    // .md / .markdown, and the plain-text family a .txt falls into
    pub const TYPES: [&str; 2] = ["net.daringfireball.markdown", "public.plain-text"];
    const ALL_ROLES: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSCopyDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32, handler: CFStringRef) -> i32;
    }

    pub fn handler(content_type: &str) -> Option<String> {
        let ty = CFString::new(content_type);
        unsafe {
            let raw = LSCopyDefaultRoleHandlerForContentType(ty.as_concrete_TypeRef(), ALL_ROLES);
            if raw.is_null() {
                return None;
            }
            let id = CFString::wrap_under_get_rule(raw).to_string();
            CFRelease(raw as *const _);
            Some(id)
        }
    }

    pub fn set(content_type: &str, bundle_id: &str) -> Result<(), String> {
        let ty = CFString::new(content_type);
        let handler = CFString::new(bundle_id);
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(ty.as_concrete_TypeRef(), ALL_ROLES, handler.as_concrete_TypeRef())
        };
        if status == 0 { Ok(()) } else { Err(format!("LaunchServices refused ({status})")) }
    }
}

/// Is this app what macOS opens a .md with?
#[tauri::command]
pub(crate) fn is_default_for_markdown(app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        let me = app.config().identifier.to_lowercase();
        return default_app::TYPES
            .iter()
            .all(|t| default_app::handler(t).map(|h| h.to_lowercase() == me).unwrap_or(false));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        false
    }
}

/// Claim (or hand back) .md and .txt. Handing back picks TextEdit, the system's own editor.
#[tauri::command]
pub(crate) fn set_default_for_markdown(app: AppHandle, on: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let id = if on { app.config().identifier.clone() } else { "com.apple.TextEdit".to_string() };
        for t in default_app::TYPES {
            default_app::set(t, &id)?;
        }
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, on);
        Err("macOS only".into())
    }
}
