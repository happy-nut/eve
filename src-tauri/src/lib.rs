use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};

mod files;
mod mac;
mod net;
mod window;

/// Files macOS asked us to open before the frontend was listening.
#[derive(Default)]
struct Pending(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_files(pending: tauri::State<Pending>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // a phone has no global hotkeys and no login items
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init());
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Pending::default())
        .invoke_handler(tauri::generate_handler![
            files::list_notes,
            files::write_note,
            files::import_asset,
            files::save_asset,
            mac::pdf_thumb,
            mac::ql_preview,
            files::list_assets,
            files::read_asset,
            files::write_asset,
            net::github_post,
            net::share_start,
            net::share_stop,
            net::lan_get,
            net::open_url,
            mac::open_asset,
            net::fetch_url,
            files::read_file,
            files::write_file,
            mac::save_pdf,
            mac::save_image,
            files::list_folder,
            take_pending_files,
            files::notes_path,
            window::toggle_window,
            window::is_front,
            window::show_window,
            window::hide_app,
            window::set_dock_hidden,
            mac::is_default_for_markdown,
            mac::set_default_for_markdown,
            window::set_always_on_top
        ])
        .on_window_event(|window, event| {
            // Closing the window keeps the app alive so the global hotkey still works.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window::hide_app(window.app_handle().clone());
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

#[cfg(test)]
mod tests {
    /// The deadline is the whole point of the helper: a child that never exits has to be killed,
    /// not waited on. `yes` writes forever and never finishes on its own.
    #[test]
    fn run_with_deadline_kills_a_hung_child() {
        let start = std::time::Instant::now();
        let err = super::mac::run_with_deadline(
            std::process::Command::new("/usr/bin/yes"),
            std::time::Duration::from_millis(300),
        )
        .unwrap_err();
        assert_eq!(err, "timed out");
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
    }

    /// The phone-setup server hands the sealed body to one right request, 404s anything else, and is
    /// gone after that one hand-over.
    #[test]
    fn serve_once_answers_the_right_path_once() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let me = super::net::SHARE.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let path = "0123456789abcdef0123456789abcdef";
        let server = std::thread::spawn(move || super::net::serve_once(listener, path, "SEALED", me, std::time::Duration::from_secs(10)));
        let get = |p: &str| {
            let mut c = std::net::TcpStream::connect(addr)?;
            c.write_all(format!("GET /{p} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())?;
            let mut out = String::new();
            c.read_to_string(&mut out)?;
            Ok::<_, std::io::Error>(out)
        };
        assert!(get("ffffffffffffffffffffffffffffffff").unwrap().starts_with("HTTP/1.1 404"));
        let ok = get(path).unwrap();
        assert!(ok.starts_with("HTTP/1.1 200") && ok.ends_with("SEALED"), "{ok}");
        assert!(server.join().unwrap());
        // one phone per QR: nothing listens any more
        assert!(get(path).is_err());
    }

    #[test]
    fn run_with_deadline_returns_output_of_a_quick_child() {
        let mut cmd = std::process::Command::new("/bin/echo");
        cmd.arg("hi");
        let out = super::mac::run_with_deadline(cmd, std::time::Duration::from_secs(5)).unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hi");
    }
}
