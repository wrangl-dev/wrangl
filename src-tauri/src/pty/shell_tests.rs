use super::shell::pick_shell;

#[test]
fn windows_uses_powershell() {
    let s = pick_shell(true, Some("/bin/zsh"));
    assert_eq!(s.program, "powershell.exe");
    assert_eq!(s.args, vec!["-NoLogo"]);
}

#[test]
fn unix_uses_shell_env_as_login_shell() {
    let s = pick_shell(false, Some("/bin/zsh"));
    assert_eq!(s.program, "/bin/zsh");
    assert_eq!(s.args, vec!["-l"]);
}

#[test]
fn unix_falls_back_to_sh_when_shell_is_unset_or_blank() {
    assert_eq!(pick_shell(false, None).program, "/bin/sh");
    assert_eq!(pick_shell(false, Some("  ")).program, "/bin/sh");
}
