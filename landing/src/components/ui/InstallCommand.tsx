import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useState } from 'react';

import { INSTALL_PS1_URL, INSTALL_SH_URL } from '../../lib/links';
import { cn } from '../../lib/utils';

// One-liners for people who skip the .dmg/.exe. Files fetched by curl,
// PowerShell or npm carry no quarantine mark, so the unsigned app opens
// without the "can't be verified" prompt.
const methods = [
  { id: 'unix', label: 'macOS / Linux', command: `curl -fsSL ${INSTALL_SH_URL} | bash` },
  { id: 'windows', label: 'Windows', command: `irm ${INSTALL_PS1_URL} | iex` },
  { id: 'npm', label: 'npm', command: 'npx @wrangl-dev/wrangl' },
] as const;

type MethodId = (typeof methods)[number]['id'];

export function InstallCommand() {
  const [active, setActive] = useState<MethodId>('unix');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (/Win/i.test(navigator.userAgent)) setActive('windows');
  }, []);

  const method = methods.find((m) => m.id === active) ?? methods[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(method.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the command stays selectable.
    }
  };

  return (
    <div className="w-full max-w-xl font-mono text-sm">
      <div role="tablist" aria-label="Install from the terminal" className="flex gap-4 text-gray-500">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === active}
            onClick={() => {
              setActive(m.id);
              setCopied(false);
            }}
            className={cn(
              'border-b py-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
              m.id === active ? 'border-white text-white' : 'border-transparent hover:text-gray-300',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start gap-2 rounded-sm border border-white/15 bg-white/[0.03] py-2 pr-2 pl-3">
        <span aria-hidden="true" className="text-gray-600 select-none">
          {active === 'windows' ? '>' : '$'}
        </span>
        <code className="min-w-0 flex-1 break-all text-gray-200">{method.command}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy install command'}
          className="shrink-0 rounded-sm p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
