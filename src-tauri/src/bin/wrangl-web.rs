//! `wrangl-web`: run Wrangl's commands for a browser, for development and testing.
//!
//! ```text
//! cargo run --bin wrangl-web -- [--port 4220] [--dist ../dist]
//! ```
//! Open the Vite dev UI (`bun run web:dev`, port 1420) or, with `--dist`, the built UI on this port.

use std::path::PathBuf;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let mut port = wrangl_lib::web::DEFAULT_PORT;
    let mut dist: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => {
                port = args
                    .next()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or_else(|| exit("--port needs a number"));
            }
            "--dist" => {
                dist = Some(
                    args.next()
                        .map(PathBuf::from)
                        .unwrap_or_else(|| exit("--dist needs a folder")),
                );
            }
            "-h" | "--help" => {
                println!("wrangl-web [--port 4220] [--dist ../dist]");
                return;
            }
            other => exit(&format!("unknown argument {other}")),
        }
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap_or_else(|e| exit(&format!("could not start the runtime: {e}")));
    if let Err(e) = runtime.block_on(wrangl_lib::web::serve(port, dist)) {
        exit(&format!("could not listen on 127.0.0.1:{port}: {e}"));
    }
}

fn exit(message: &str) -> ! {
    eprintln!("wrangl-web: {message}");
    std::process::exit(2);
}
