import { useLayoutEffect, useState } from 'react';

import { terminalLog, tabNames, type AgentStatus, type LogLine } from '../../data/terminal-log';
import { cn } from '../../lib/utils';

const LAST = terminalLog.length - 1;
const HEADER_CHAR_MS = 22;
const FINAL_CHAR_MS = 48;

const glyph: Record<AgentStatus, string> = { running: '●', waiting: '○', done: '✓' };
const glyphTone: Record<AgentStatus, string> = {
  running: 'text-white',
  waiting: 'text-white',
  done: 'text-gray-500',
};

/** Delay before the next line, rows speed up as the list grows. */
function rowDelay(index: number) {
  return Math.max(45, 150 - index * 6);
}

function Cursor() {
  return <span className="term-cursor" aria-hidden="true" />;
}

function TextLine({ line, typed, cursor }: { line: Extract<LogLine, { kind: 'text' }>; typed: number; cursor: boolean }) {
  return (
    <p
      className={cn(
        'whitespace-pre-wrap',
        line.tone === 'bright' && 'text-white',
        line.tone === 'dim' && 'text-gray-500',
        !line.tone && 'text-gray-300',
      )}
    >
      {line.text.slice(0, typed)}
      {cursor && <Cursor />}
      <span className="invisible">{line.text.slice(typed)}</span>
    </p>
  );
}

function RowLine({ line }: { line: Extract<LogLine, { kind: 'row' }> }) {
  return (
    <p className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-baseline gap-x-0 sm:grid-cols-[1.5rem_13ch_8ch_minmax(0,1fr)_9ch] sm:gap-x-3">
      <span aria-hidden="true" className={glyphTone[line.status]}>
        {glyph[line.status]}
      </span>
      <span className="col-start-2 flex min-w-0 gap-3 sm:contents">
        <span className="w-[13ch] shrink-0 truncate text-white sm:w-auto">{line.project}</span>
        <span className="hidden text-gray-400 sm:block">{line.agent}</span>
        <span className="min-w-0 truncate text-gray-300">{line.task}</span>
        <span className={cn('hidden sm:block sm:text-right', line.status === 'done' ? 'text-gray-500' : 'text-white')}>
          {line.status}
        </span>
      </span>
      <span className="sr-only">
        {line.agent}, {line.status}
      </span>
    </p>
  );
}

export function HeroTerminal({ reducedMotion }: { reducedMotion: boolean }) {
  // The prerendered (and reduced-motion) state is the finished log.
  const [step, setStep] = useState({ line: terminalLog.length, char: 0 });
  // Until the effect runs, `html.term-armed` (set by an inline script in index.html when
  // motion is allowed) hides the prerendered log so it does not flash before typing starts.
  const [started, setStarted] = useState(false);

  useLayoutEffect(() => {
    setStarted(true);
    if (reducedMotion) {
      setStep({ line: terminalLog.length, char: 0 });
      return;
    }

    let timer: number;
    let line = 0;
    let char = 0;
    setStep({ line, char });

    const tick = () => {
      const current = terminalLog[line];
      let delay: number;
      if (current.kind === 'text') {
        char += 1;
        if (char >= current.text.length) {
          line += 1;
          char = 0;
          delay = 140;
        } else {
          delay = line === LAST ? FINAL_CHAR_MS : HEADER_CHAR_MS;
        }
      } else {
        line += 1;
        delay = rowDelay(line);
      }
      setStep({ line, char });
      if (line < terminalLog.length) timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 350);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <div className="overflow-hidden rounded-md border border-white/20 bg-graphite font-mono text-[13px] leading-[1.75] sm:text-[15px]">
      {/* title bar */}
      <div className="flex items-center gap-4 border-b border-white/15 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 border border-white/40" />
          <i className="h-2.5 w-2.5 border border-white/40" />
          <i className="h-2.5 w-2.5 border border-white/40" />
        </span>
        <span className="text-xs text-gray-400">wrangl</span>
      </div>
      {/* tab strip */}
      <div className="flex overflow-hidden border-b border-white/15 text-xs whitespace-nowrap" aria-hidden="true">
        {tabNames.map((name, i) => (
          <span
            key={name}
            className={cn(
              'border-r border-white/15 px-4 py-2',
              i === 0 ? 'bg-ink text-white shadow-[inset_0_1px_0_#fff]' : 'text-gray-500',
            )}
          >
            {name}
          </span>
        ))}
        <span className="px-4 py-2 text-gray-500">+</span>
      </div>
      {/* log */}
      <div
        className="term-log bg-ink px-4 py-5 sm:px-6 sm:py-6"
        data-started={started ? '' : undefined}
        role="log"
        aria-label="Agent sessions managed by Wrangl"
      >
        {terminalLog.map((line, i) => {
          const revealed = i < step.line;
          const typing = i === step.line;
          return (
            <div
              key={i}
              className={cn(
                i === 2 && 'mt-4',
                line.kind === 'text' && i === LAST && 'mt-5 text-xl sm:text-3xl sm:leading-tight',
                line.kind === 'text' && line.tone === 'dim' && i === 1 && 'mb-2',
                !revealed && !typing && 'invisible',
                line.kind === 'row' && typing && 'invisible',
              )}
            >
              {line.kind === 'text' ? (
                <TextLine
                  line={line}
                  typed={revealed ? line.text.length : typing ? step.char : 0}
                  cursor={typing || (i === LAST && revealed)}
                />
              ) : (
                <RowLine line={line} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
