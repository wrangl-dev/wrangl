use std::io::Write;

use super::install::{binary_path, find_program, install_dir, unpack, verify_sha256};

#[test]
fn finds_programs_with_windows_extensions() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("npx.cmd"), "@echo off").unwrap();
    std::fs::write(dir.path().join("node"), "").unwrap();
    let path = std::env::join_paths([dir.path()]).unwrap();

    let win = find_program("npx", Some(&path), true).expect("npx.cmd on windows");
    assert!(win.ends_with("npx.cmd"));
    assert!(find_program("node", Some(&path), false).is_some());
    assert!(find_program("uvx", Some(&path), false).is_none());
    assert!(find_program("npx", None, true).is_none());
}

#[test]
fn install_dirs_are_per_agent_and_version_and_safe() {
    let root = std::path::Path::new("/data");
    let dir = install_dir(root, "claude-acp", "0.109.1");
    assert!(dir.ends_with("agents/claude-acp/0.109.1"));
    let odd = install_dir(root, "../evil", "");
    assert!(odd.ends_with("agents/.._evil/latest"));
}

#[test]
fn agent_commands_stay_inside_their_folder() {
    let dir = tempfile::tempdir().unwrap();
    assert!(binary_path(dir.path(), "./bin/agent").is_ok());
    assert!(binary_path(dir.path(), "../agent").is_err());
    assert!(binary_path(dir.path(), "/usr/bin/agent").is_err());
}

#[test]
fn sha256_is_checked_when_the_registry_gives_one() {
    // sha256("abc")
    let abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    assert!(verify_sha256(b"abc", Some(abc)).is_ok());
    assert!(verify_sha256(b"abc", Some(&abc.to_uppercase())).is_ok());
    assert!(verify_sha256(b"abd", Some(abc))
        .unwrap_err()
        .contains("corrupted"));
    assert!(verify_sha256(b"anything", None).is_ok());
}

#[test]
fn unpacks_zip_and_tar_gz() {
    let mut zip_bytes = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut zip_bytes));
        zip.start_file("bin/agent", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"zip-agent").unwrap();
        zip.finish().unwrap();
    }
    let dir = tempfile::tempdir().unwrap();
    unpack(&zip_bytes, "https://x/agent.zip", dir.path()).unwrap();
    assert_eq!(
        std::fs::read(dir.path().join("bin/agent")).unwrap(),
        b"zip-agent"
    );

    let mut tar_gz = Vec::new();
    {
        let gz = flate2::write::GzEncoder::new(&mut tar_gz, flate2::Compression::fast());
        let mut tar = tar::Builder::new(gz);
        let mut header = tar::Header::new_gnu();
        header.set_size(9);
        header.set_mode(0o755);
        header.set_cksum();
        tar.append_data(&mut header, "agent", &b"tar-agent"[..])
            .unwrap();
        tar.into_inner().unwrap().finish().unwrap();
    }
    let dir = tempfile::tempdir().unwrap();
    unpack(&tar_gz, "https://x/agent.tar.gz", dir.path()).unwrap();
    assert_eq!(
        std::fs::read(dir.path().join("agent")).unwrap(),
        b"tar-agent"
    );

    let dir = tempfile::tempdir().unwrap();
    unpack(b"raw", "https://x/agent-linux?download=1", dir.path()).unwrap();
    assert_eq!(
        std::fs::read(dir.path().join("agent-linux")).unwrap(),
        b"raw"
    );
}
