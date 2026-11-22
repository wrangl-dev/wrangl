import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { killPty, ptyAvailable, resizePty, spawnPty, writePty } from '../lib/pty';

interface Props {
  /** Only the active tab is visible; hidden tabs keep their shell running. */
  active: boolean;
  onExit: (code: number | null) => void;
  /** Folder the shell starts in; the home folder when missing. */
  cwd?: string;
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** One xterm.js view bound to one shell. The shell lives as long as the view is mounted. */
export function TerminalView({ active, onExit, cwd }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: cssColor('--mono', 'monospace'),
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: cssColor('--bg', '#0b0d10'),
        foreground: cssColor('--text', '#e6e9ed'),
        cursor: cssColor('--accent', '#c8ff3d'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let id: string | null = null;
    let disposed = false;
    const input = term.onData((data) => {
      if (id) writePty(id, data).catch(() => {});
    });
    const resized = term.onResize(({ cols, rows }) => {
      if (id) resizePty(id, cols, rows).catch(() => {});
    });

    const start = async () => {
      if (!(await ptyAvailable())) {
        term.write('Terminals need the Wrangl desktop app or the wrangl-web dev server.\r\n');
        return;
      }
      const newId = await spawnPty({ cols: term.cols, rows: term.rows, cwd }, (event) => {
        // A view that was unmounted killed its own shell; that exit is not news for the tab.
        if (disposed) return;
        if (event.kind === 'data') term.write(event.data);
        else {
          term.write(
            `\r\n[process exited${event.code === null ? '' : ` with code ${event.code}`}]\r\n`,
          );
          id = null;
          onExitRef.current(event.code);
        }
      });
      if (disposed) killPty(newId).catch(() => {});
      else id = newId;
    };
    start().catch((e: unknown) => {
      if (!disposed) term.write(`\r\nCould not start a shell: ${String(e)}\r\n`);
    });

    const observer = new ResizeObserver(() => {
      if (el.offsetParent !== null) fit.fit();
    });
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resized.dispose();
      if (id) killPty(id).catch(() => {});
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    fitRef.current?.fit();
    termRef.current?.focus();
  }, [active]);

  return <div ref={host} className="terminal-view" hidden={!active} />;
}
