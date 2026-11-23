---

title: Install
description: Install Wrangl on macOS, Windows or Linux with one command, or download a file from the latest release.
---

# Install

One command installs the newest release from GitHub. Run it again later to update, or let the app update itself.

## macOS

```bash
curl -fsSL https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.sh | bash
```

Picks the Apple silicon or Intel build, copies `Wrangl.app` to `/Applications` (or `~/Applications` if that is not writable) and clears the quarantine flag. Wrangl is not notarized yet; if you install a `.dmg` by hand and macOS refuses to open it, run:

```bash
xattr -dr com.apple.quarantine "/Applications/Wrangl.app"
```

## Windows

In PowerShell:

```powershell
irm https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.ps1 | iex
```

Downloads the 64-bit setup and runs it for your user, no admin rights needed. Windows on ARM runs the x64 build.

## Linux

```bash
curl -fsSL https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.sh | bash
```

Saves the AppImage as `~/.local/bin/wrangl.AppImage` and adds a `wrangl` command and a menu entry. Builds are x86_64 only and need WebKitGTK 2.40 or later (Debian 12, Ubuntu 24.04). There are also `.deb` and `.rpm` files on the release page.

## Files instead of a script

Every build is on the [latest release](https://github.com/wrangl-dev/wrangl/releases/latest):

| System               | File                                       |
| -------------------- | ------------------------------------------ |
| macOS, Apple silicon | `Wrangl_<version>_aarch64.dmg`             |
| macOS, Intel         | `Wrangl_<version>_x64.dmg`                 |
| Windows              | `Wrangl_<version>_x64-setup.exe` or `.msi` |
| Linux                | `.AppImage`, `.deb`, `.rpm`                |

## Updates

Wrangl checks for a newer signed release. When there is one, an update button appears in the status bar; click it to install and restart.

## Uninstall

- **macOS:** delete `Wrangl.app` from Applications.
- **Windows:** Settings → Apps → Installed apps → Wrangl → Uninstall.
- **Linux:** delete `~/.local/bin/wrangl.AppImage`, `~/.local/bin/wrangl` and `~/.local/share/applications/wrangl.desktop`.
