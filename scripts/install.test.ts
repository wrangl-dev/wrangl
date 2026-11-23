import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A release shaped like GitHub's API answer, with the names tauri-action gives the installers.
const base = 'https://github.com/wrangl-dev/wrangl/releases/download/v0.2.0';
const names = [
  'Wrangl_0.2.0_aarch64.dmg',
  'Wrangl_0.2.0_x64.dmg',
  'Wrangl_0.2.0_amd64.AppImage',
  'Wrangl_0.2.0_amd64.AppImage.sig',
  'Wrangl_0.2.0_amd64.deb',
  'Wrangl_0.2.0_x64-setup.exe',
  'Wrangl_0.2.0_x64_en-US.msi',
  'latest.json',
];
const release = {
  tag_name: 'v0.2.0',
  assets: names.map((name) => ({ name, browser_download_url: `${base}/${name}` })),
};

const dir = mkdtempSync(join(tmpdir(), 'wrangl-install-'));
const fixture = join(dir, 'release.json');
writeFileSync(fixture, JSON.stringify(release, null, 2));

const env = { ...process.env, WRANGL_DRY_RUN: '1', WRANGL_RELEASE_JSON: fixture };
const has = (cmd: string) => spawnSync(cmd, ['-c', 'exit 0'], { shell: false }).status === 0;
const hasBash = has('bash');
const hasPwsh =
  spawnSync('powershell', ['-NoProfile', '-Command', 'exit 0']).status === 0 ||
  spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;

/** Run install.sh as if on `os`/`arch`, by shadowing `uname`. */
function runSh(os: string, arch: string) {
  const fake = join(dir, `bin-${os}-${arch}`);
  spawnSync('bash', ['-c', `mkdir -p '${fake}'`]);
  writeFileSync(
    join(fake, 'uname'),
    `#!/usr/bin/env bash\n[ "$1" = "-s" ] && echo ${os} || echo ${arch}\n`,
    { mode: 0o755 },
  );
  return spawnSync('bash', ['scripts/install.sh'], {
    env: { ...env, PATH: `${fake}:${process.env.PATH}` },
    encoding: 'utf8',
  });
}

describe.skipIf(!hasBash)('install.sh', () => {
  it('picks the Apple Silicon and Intel disk images', () => {
    expect(runSh('Darwin', 'arm64').stdout.trim()).toBe(`${base}/Wrangl_0.2.0_aarch64.dmg`);
    expect(runSh('Darwin', 'x86_64').stdout.trim()).toBe(`${base}/Wrangl_0.2.0_x64.dmg`);
  });

  it('picks the AppImage on Linux x64, not its signature', () => {
    expect(runSh('Linux', 'x86_64').stdout.trim()).toBe(`${base}/Wrangl_0.2.0_amd64.AppImage`);
  });

  it('says clearly when there is no build', () => {
    const arm = runSh('Linux', 'aarch64');
    expect(arm.status).not.toBe(0);
    expect(arm.stderr).toContain('no Linux build for aarch64');
    const win = runSh('MINGW64_NT', 'x86_64');
    expect(win.stderr).toContain('install.ps1');
  });
});

describe.skipIf(!hasPwsh)('install.ps1', () => {
  it('picks the per-user Windows installer', () => {
    const shell =
      spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0 ? 'pwsh' : 'powershell';
    const out = spawnSync(
      shell,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/install.ps1'],
      { env, encoding: 'utf8' },
    );
    expect(out.stderr).toBe('');
    expect(out.stdout.trim()).toBe(`${base}/Wrangl_0.2.0_x64-setup.exe`);
  });
});
