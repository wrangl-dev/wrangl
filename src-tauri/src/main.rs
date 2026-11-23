// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Agents start this same executable as their Robinhood Chain tool server.
    if std::env::args().any(|a| a == wrangl_lib::chain::mcp::MCP_FLAG) {
        if let Err(e) = wrangl_lib::chain::mcp::run_stdio() {
            eprintln!("wrangl --mcp: {e}");
            std::process::exit(1);
        }
        return;
    }
    wrangl_lib::run();
}
