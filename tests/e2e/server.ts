// Starts one isolated wrangl-web for the suite: a throwaway data folder, a seeded agent registry
// that lists only the scripted fake agent (already "installed", so nothing is downloaded), and
// the built UI served from the same port.

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const PORT = 4230;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const AGENT_NAME = 'E2E Agent';
const AGENT_ID = 'wrangl-e2e-agent';
const AGENT_VERSION = '1.0.0';

const repo = resolve(import.meta.dirname, '..', '..');
const windows = process.platform === 'win32';

export function serverBinary(): string {
  const name = windows ? 'wrangl-web.exe' : 'wrangl-web';
  for (const profile of ['debug', 'release']) {
    const path = join(repo, 'src-tauri', 'target', profile, name);
    if (existsSync(path)) return path;
  }
  throw new Error(
    'wrangl-web is not built. Run: cargo build --manifest-path src-tauri/Cargo.toml --bin wrangl-web',
  );
}

/** The registry, as Wrangl caches it, with one agent that runs everywhere. */
function registry(cmd: string) {
  const platforms = ['windows', 'linux', 'darwin'].flatMap((os) =>
    ['x86_64', 'aarch64'].flatMap((arch) => [`${os}-${arch}`, `${os}-${arch}-musl`]),
  );
  return {
    version: '1.0.0',
    agents: [
      {
        id: AGENT_ID,
        name: AGENT_NAME,
        version: AGENT_VERSION,
        description: 'Scripted agent for the end-to-end tests',
        distribution: {
          binary: Object.fromEntries(
            // The archive is never fetched: the agent is already in its install folder.
            platforms.map((p) => [p, { archive: 'https://invalid.example/agent.zip', cmd }]),
          ),
        },
      },
    ],
  };
}

export type Server = { data: string; project: string; stop: () => Promise<void> };

export async function startServer(): Promise<Server> {
  const dist = join(repo, 'dist', 'index.html');
  if (!existsSync(dist)) throw new Error('The UI is not built. Run: bun run web:build');
  const binary = serverBinary();

  const root = await mkdtemp(join(tmpdir(), 'wrangl-e2e-'));
  const data = join(root, 'data');
  const project = join(root, 'storefront');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'README.md'), '# storefront\n');

  // The fake agent, "installed" where Wrangl looks for native agents.
  const agentDir = join(data, 'agents', AGENT_ID, AGENT_VERSION);
  await mkdir(agentDir, { recursive: true });
  const script = join(import.meta.dirname, 'fake-agent.ts');
  const cmd = windows ? './fake-agent.cmd' : './fake-agent';
  if (windows) {
    await writeFile(join(agentDir, 'fake-agent.cmd'), `@bun "${script}" %*\r\n`);
  } else {
    await writeFile(join(agentDir, 'fake-agent'), `#!/bin/sh\nexec bun "${script}" "$@"\n`);
    await chmod(join(agentDir, 'fake-agent'), 0o755);
  }
  await writeFile(join(data, 'acp-registry.json'), JSON.stringify(registry(cmd)));

  const child: ChildProcess = spawn(
    binary,
    ['--port', String(PORT), '--dist', join(repo, 'dist')],
    {
      env: { ...process.env, WRANGL_DATA_DIR: data, RUST_LOG: process.env.RUST_LOG ?? 'warn' },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  const exited = new Promise<void>((r) => child.once('exit', () => r()));

  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangl-web exited with ${child.exitCode}`);
    try {
      if ((await fetch(BASE_URL)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`wrangl-web did not answer on ${BASE_URL}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    data,
    project,
    stop: async () => {
      child.kill();
      await exited;
      await rm(root, { recursive: true, force: true }).catch(() => {});
    },
  };
}
