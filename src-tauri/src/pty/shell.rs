//! Which shell a new terminal tab starts.

/// The program and arguments for a new terminal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellCommand {
    pub program: String,
    pub args: Vec<String>,
}

/// Pick the shell: PowerShell on Windows, the user's `$SHELL` (login) elsewhere.
#[must_use]
pub fn pick_shell(windows: bool, shell_env: Option<&str>) -> ShellCommand {
    if windows {
        return ShellCommand {
            program: "powershell.exe".into(),
            args: vec!["-NoLogo".into()],
        };
    }
    let program = shell_env
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("/bin/sh")
        .to_string();
    ShellCommand {
        program,
        args: vec!["-l".into()],
    }
}

/// The shell for this machine.
#[must_use]
pub fn default_shell() -> ShellCommand {
    pick_shell(cfg!(windows), std::env::var("SHELL").ok().as_deref())
}
