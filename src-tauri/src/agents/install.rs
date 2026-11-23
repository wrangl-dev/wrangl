//! Turn a registry launch into a command line, downloading native agent builds when needed.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use sha2::{Digest, Sha256};

use super::registry::{BinaryRun, Launch, PackageRun};

/// A program to start, with its arguments and extra environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandLine {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
}

/// Find `name` on `PATH`, trying Windows' executable extensions (`npx` is `npx.cmd` there).
#[must_use]
pub fn find_program(name: &str, path: Option<&std::ffi::OsStr>, windows: bool) -> Option<PathBuf> {
    let exts: Vec<String> = if windows {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(str::to_lowercase)
            .collect()
    } else {
        vec![String::new()]
    };
    for dir in std::env::split_paths(path?) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        if windows {
            let bare = dir.join(name);
            if bare.is_file() && bare.extension().is_some() {
                return Some(bare);
            }
        }
    }
    None
}

fn require(name: &str, what: &str) -> Result<PathBuf, String> {
    find_program(name, std::env::var_os("PATH").as_deref(), cfg!(windows))
        .ok_or_else(|| format!("{name} was not found. Install {what} to run this agent."))
}

fn package_line(
    tool: &str,
    what: &str,
    lead: &[&str],
    run: &PackageRun,
) -> Result<CommandLine, String> {
    let program = require(tool, what)?;
    let mut args: Vec<String> = lead.iter().map(|s| (*s).to_string()).collect();
    args.push(run.package.clone());
    args.extend(run.args.iter().cloned());
    Ok(CommandLine {
        program,
        args,
        env: run.env.clone(),
    })
}

/// The folder a native build of `agent_id`@`version` unpacks into.
#[must_use]
pub fn install_dir(root: &Path, agent_id: &str, version: &str) -> PathBuf {
    let clean = |s: &str| -> String {
        s.chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || "-_.".contains(c) {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    };
    root.join("agents")
        .join(clean(agent_id))
        .join(clean(if version.is_empty() {
            "latest"
        } else {
            version
        }))
}

/// Resolve `cmd` (like `./claude-agent-acp`) inside `dir`, refusing paths that leave it.
pub fn binary_path(dir: &Path, cmd: &str) -> Result<PathBuf, String> {
    let rel = Path::new(cmd);
    if rel.is_absolute()
        || rel.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(format!("agent command {cmd} points outside its folder"));
    }
    let mut path = dir.join(rel);
    if cfg!(windows) && !path.is_file() && path.extension().is_none() {
        path.set_extension("exe");
    }
    Ok(path)
}

/// Check a download against the registry's SHA-256, when it has one.
pub fn verify_sha256(bytes: &[u8], expected: Option<&str>) -> Result<(), String> {
    let Some(expected) = expected else {
        return Ok(());
    };
    let actual = Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(format!(
            "the agent download is corrupted (sha256 {actual}, expected {expected})"
        ))
    }
}

/// Unpack a `.zip`, `.tar.gz`/`.tgz` or bare executable into `dir`. Entries that would land
/// outside `dir` are refused.
pub fn unpack(bytes: &[u8], archive_url: &str, dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let name = archive_url
        .rsplit('/')
        .next()
        .unwrap_or("agent")
        .split('?')
        .next()
        .unwrap_or("agent");
    let lower = name.to_lowercase();
    if lower.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| format!("bad zip: {e}"))?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| format!("bad zip entry: {e}"))?;
            let Some(rel) = entry.enclosed_name() else {
                return Err(format!("zip entry {} escapes the folder", entry.name()));
            };
            let out = dir.join(rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut data = Vec::new();
            entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
            std::fs::write(&out, data).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode));
            }
        }
        Ok(())
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
        for entry in archive.entries().map_err(|e| format!("bad tar: {e}"))? {
            let mut entry = entry.map_err(|e| format!("bad tar entry: {e}"))?;
            // `unpack_in` refuses entries that would escape `dir`.
            if !entry.unpack_in(dir).map_err(|e| e.to_string())? {
                return Err("tar entry escapes the folder".into());
            }
        }
        Ok(())
    } else {
        let out = dir.join(name);
        std::fs::write(&out, bytes).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o755));
        }
        Ok(())
    }
}

async fn download(url: &str) -> Result<Vec<u8>, String> {
    if !url.starts_with("https://") {
        return Err(format!(
            "refusing to download an agent over plain http: {url}"
        ));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent(concat!("wrangl/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("could not download the agent: {e}"))?;
    Ok(response.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

async fn binary_line(
    root: &Path,
    agent_id: &str,
    version: &str,
    run: &BinaryRun,
) -> Result<CommandLine, String> {
    let dir = install_dir(root, agent_id, version);
    let program = binary_path(&dir, &run.cmd)?;
    if !program.is_file() {
        log::info!(
            "[agents] installing {agent_id} {version} from {}",
            run.archive
        );
        let bytes = download(&run.archive).await?;
        verify_sha256(&bytes, run.sha256.as_deref())?;
        let staging = dir.with_extension("partial");
        let _ = std::fs::remove_dir_all(&staging);
        unpack(&bytes, &run.archive, &staging)?;
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::rename(&staging, &dir).map_err(|e| format!("could not finish installing: {e}"))?;
    }
    let program = binary_path(&dir, &run.cmd)?;
    if !program.is_file() {
        return Err(format!("the agent archive has no {}", run.cmd));
    }
    Ok(CommandLine {
        program,
        args: run.args.clone(),
        env: run.env.clone(),
    })
}

/// The command line for `launch`, installing a native build under `root` first if needed.
/// `on_install` is told before a download starts.
pub async fn command_line(
    root: &Path,
    agent_id: &str,
    version: &str,
    launch: &Launch,
    on_install: impl FnOnce(),
) -> Result<CommandLine, String> {
    match launch {
        Launch::Npx(run) => package_line("npx", "Node.js", &["-y"], run),
        Launch::Uvx(run) => package_line("uvx", "uv (Python)", &[], run),
        Launch::Binary(run) => {
            let dir = install_dir(root, agent_id, version);
            if !binary_path(&dir, &run.cmd)?.is_file() {
                on_install();
            }
            binary_line(root, agent_id, version, run).await
        }
    }
}
