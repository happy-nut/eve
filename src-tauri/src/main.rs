// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `eve <command>` in a terminal (cli.rs), or `eve mcp` started by a Claude app as its notes server
  // (mcp.rs): no window, no Tauri
  if let Some(code) = eve_lib::cli::main(std::env::args().skip(1).collect()) {
    std::process::exit(code);
  }
  eve_lib::run();
}
