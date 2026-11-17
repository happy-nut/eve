//! The network: GitHub sign-in, links, and a phone set up from the Mac over the LAN.
use tauri::{AppHandle, Emitter};

// ---- GitHub sign-in (device flow) -------------------------------------------
/// The two device-flow endpoints, on github.com or a GitHub Enterprise server: nothing else may be POSTed.
pub(crate) fn login_url_ok(url: &str) -> bool {
    let Some((host, path)) = url.strip_prefix("https://").and_then(|r| r.split_once('/')) else { return false };
    let host_ok = !host.is_empty()
        && host.contains('.')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':');
    host_ok && matches!(path, "login/device/code" | "login/oauth/access_token")
}

/// GitHub's login/* has no CORS headers, so the two device-flow POSTs run here.
/// `form` = [[key, value], ...]. Async so the main thread never blocks.
#[tauri::command]
pub(crate) async fn github_post(url: String, form: Vec<(String, String)>) -> Result<String, String> {
    if !login_url_ok(&url) {
        return Err("url not allowed".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        ureq::post(&url)
            .header("Accept", "application/json")
            .send_form(form)
            .map_err(|e| e.to_string())?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- a phone set up from the Mac, over the local network (src/lib/handoff.ts) --------------
/// Which hand-off is live; starting another (or finishing) retires the one before it.
pub(crate) static SHARE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// This Mac's address on the local network: the interface a packet to the internet would leave from.
/// (A UDP "connect" only picks the route; nothing is sent.)
pub(crate) fn lan_ip() -> Result<std::net::IpAddr, String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    sock.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    Ok(sock.local_addr().map_err(|e| e.to_string())?.ip())
}

/// Serve `body` (already sealed by the page) at `/<path>` on the LAN, to the first fetch only, for at
/// most ten minutes. Returns "ip:port" for the QR. Emits "share-done" once the phone has it.
#[tauri::command]
pub(crate) fn share_start(app: AppHandle, path: String, body: String) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    if path.len() != 32 || !path.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("bad path".into());
    }
    let ip = lan_ip()?;
    let listener = std::net::TcpListener::bind((ip, 0)).map_err(|e| e.to_string())?;
    let host = format!("{ip}:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
    let me = SHARE.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        if serve_once(listener, &path, &body, me, std::time::Duration::from_secs(600)) {
            let _ = app.emit("share-done", ());
        }
    });
    Ok(host)
}

/// The hand-off's server loop: answer `GET /<path>` with `body` once and stop; anything else gets a
/// 404 and the wait goes on, until `deadline` or until another hand-off (`SHARE` moved past `me`).
/// True when the body was handed over.
pub(crate) fn serve_once(listener: std::net::TcpListener, path: &str, body: &str, me: u64, deadline: std::time::Duration) -> bool {
    use std::io::{Read, Write};
    use std::sync::atomic::Ordering;
    let _ = listener.set_nonblocking(true);
    let until = std::time::Instant::now() + deadline;
    let mut done = false;
    while !done && SHARE.load(Ordering::SeqCst) == me && std::time::Instant::now() < until {
        let Ok((mut conn, _)) = listener.accept() else {
            std::thread::sleep(std::time::Duration::from_millis(150));
            continue;
        };
        let _ = conn.set_nonblocking(false);
        let _ = conn.set_read_timeout(Some(std::time::Duration::from_secs(5)));
        let mut buf = [0u8; 1024];
        let n = conn.read(&mut buf).unwrap_or(0);
        done = String::from_utf8_lossy(&buf[..n]).starts_with(&format!("GET /{path} "));
        let reply = if done {
            format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
        } else {
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()
        };
        let _ = conn.write_all(reply.as_bytes());
    }
    // retire this hand-off, unless a newer one already took over
    let _ = SHARE.compare_exchange(me, me + 1, Ordering::SeqCst, Ordering::SeqCst);
    done
}

/// Retire the live hand-off (Done, or a new QR).
#[tauri::command]
pub(crate) fn share_stop() {
    SHARE.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

/// Phone: fetch the sealed sign-in from the Mac. Plain HTTP to a private address only — the bytes are
/// sealed, and the key never travels (it came in the QR).
#[tauri::command]
pub(crate) async fn lan_get(host: String, path: String) -> Result<String, String> {
    let ip: std::net::SocketAddr = host.parse().map_err(|_| "bad host".to_string())?;
    let private = match ip.ip() {
        std::net::IpAddr::V4(v4) => v4.is_private(),
        _ => false,
    };
    if !private || path.len() != 32 || !path.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("not a local address".into());
    }
    let url = format!("http://{host}/{path}");
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(8)))
            .build()
            .new_agent();
        agent
            .get(&url)
            .call()
            .map_err(|e| e.to_string())?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(crate) fn is_web_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// Open a link in the default browser (device-flow page, bookmark cards).
#[tauri::command]
pub(crate) async fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !is_web_url(&url) {
        return Err("url not allowed".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Page HTML for link previews (og:* tags). curl keeps the webview's cookies and CORS out of it; the
/// body is cut at 300k chars, plenty for <head>.
#[tauri::command]
pub(crate) async fn fetch_url(url: String) -> Result<String, String> {
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

#[cfg(test)]
mod login_tests {
    #[test]
    fn only_the_device_flow_endpoints() {
        use super::login_url_ok as ok;
        assert!(ok("https://github.com/login/device/code"));
        assert!(ok("https://github.com/login/oauth/access_token"));
        assert!(ok("https://github.acme.com/login/device/code"));
        assert!(ok("https://octocorp.ghe.com:8443/login/oauth/access_token"));
        assert!(!ok("http://github.com/login/device/code"));
        assert!(!ok("https://github.com/login/device/code?x=1"));
        assert!(!ok("https://github.com/api/v3/user"));
        assert!(!ok("https://user@evil.com/login/device/code"));
        assert!(!ok("https://localhost/login/device/code"));
    }
}

// ---- a YouTube video played in a note ---------------------------------------------------------
/// YouTube's player refuses to play for a page with no http(s) address to name as its referrer (error 153), and the
/// Mac app's page is tauri://. A page on the loopback holds the player instead; its address is the referrer.
static PLAYER: std::sync::OnceLock<u16> = std::sync::OnceLock::new();

/// The player page for `GET /yt/<11-letter id>[?start=<seconds>]`; None for anything else.
pub(crate) fn player_page(target: &str) -> Option<String> {
    let rest = target.strip_prefix("/yt/")?;
    let (id, query) = rest.split_once('?').unwrap_or((rest, ""));
    let id_ok = id.len() == 11 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    let start = query.strip_prefix("start=").unwrap_or("");
    if !id_ok || !start.bytes().all(|b| b.is_ascii_digit()) || (!query.is_empty() && start.is_empty()) {
        return None;
    }
    let at = if start.is_empty() { String::new() } else { format!("?start={start}") };
    Some(format!(
        "<!doctype html><meta charset=utf-8><style>html,body{{margin:0;height:100%;background:#000}}iframe{{border:0;width:100%;height:100%;display:block}}</style>\
<iframe src=\"https://www.youtube-nocookie.com/embed/{id}{at}\" title=\"YouTube\" allow=\"autoplay; encrypted-media; picture-in-picture; fullscreen\" allowfullscreen referrerpolicy=\"strict-origin-when-cross-origin\"></iframe>"
    ))
}

fn serve_players(listener: std::net::TcpListener) {
    use std::io::{Read, Write};
    for mut conn in listener.incoming().flatten() {
        let _ = conn.set_read_timeout(Some(std::time::Duration::from_secs(5)));
        let mut buf = [0u8; 2048];
        let n = conn.read(&mut buf).unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]);
        let page = head.strip_prefix("GET ").and_then(|r| r.split(' ').next()).and_then(player_page);
        let reply = match page {
            Some(p) => format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{p}", p.len()),
            None => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        };
        let _ = conn.write_all(reply.as_bytes());
    }
}

/// The loopback port the player pages are served on, the server started the first time it is asked for.
pub(crate) fn player_port() -> Result<u16, String> {
    if let Some(p) = PLAYER.get() {
        return Ok(*p);
    }
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    if PLAYER.set(port).is_ok() {
        std::thread::spawn(move || serve_players(listener));
    }
    Ok(*PLAYER.get().unwrap())
}

#[tauri::command]
pub(crate) fn youtube_port() -> Result<u16, String> {
    player_port()
}

#[cfg(test)]
mod player_tests {
    use super::{player_page, player_port};

    #[test]
    fn only_a_video_id_and_a_start() {
        assert!(player_page("/yt/dQw4w9WgXcQ").unwrap().contains("youtube-nocookie.com/embed/dQw4w9WgXcQ\""));
        assert!(player_page("/yt/dQw4w9WgXcQ?start=42").unwrap().contains("/embed/dQw4w9WgXcQ?start=42\""));
        for bad in ["/yt/short", "/yt/dQw4w9WgXc\"", "/yt/dQw4w9WgXcQ?start=4x", "/yt/dQw4w9WgXcQ?x=1", "/other", "/yt/../../etc"] {
            assert!(player_page(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn served_on_the_loopback() {
        use std::io::{Read, Write};
        let port = player_port().unwrap();
        assert_eq!(player_port().unwrap(), port, "one server, asked twice");
        let get = |path: &str| {
            let mut c = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            c.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).unwrap();
            let mut s = String::new();
            c.read_to_string(&mut s).unwrap();
            s
        };
        let ok = get("/yt/dQw4w9WgXcQ?start=7");
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("/embed/dQw4w9WgXcQ?start=7"), "{ok}");
        assert!(get("/").starts_with("HTTP/1.1 404"));
        if std::env::var_os("EVE_HOLD_PLAYER").is_some() {
            println!("player port {port}");
            std::thread::sleep(std::time::Duration::from_secs(90));
        }
    }
}
