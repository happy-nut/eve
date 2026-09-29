// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `eve mcp`: a Claude app started us as its read-only notes server (mcp.rs); no window, no Tauri
  if std::env::args().nth(1).as_deref() == Some("mcp") {
    return eve_lib::mcp::serve();
  }
  eve_lib::run();
}
