import { useCallback, useRef, useState } from 'react';
import { TerminalView } from './TerminalView';

interface Tab {
  key: number;
  title: string;
  exited: boolean;
}

const tabFor = (key: number): Tab => ({ key, title: `Terminal ${key}`, exited: false });

/** Terminal tabs. Every tab stays mounted so switching never restarts a shell. */
export function TerminalTabs() {
  const [tabs, setTabs] = useState<Tab[]>([tabFor(1)]);
  const [activeKey, setActiveKey] = useState(1);
  const nextKey = useRef(2);

  const add = useCallback(() => {
    const tab = tabFor(nextKey.current++);
    setTabs((t) => [...t, tab]);
    setActiveKey(tab.key);
  }, []);

  const close = useCallback(
    (key: number) => {
      const index = tabs.findIndex((t) => t.key === key);
      const rest = tabs.filter((t) => t.key !== key);
      setTabs(rest);
      if (key === activeKey && rest.length > 0) {
        setActiveKey(rest[Math.max(0, index - 1)].key);
      }
    },
    [tabs, activeKey],
  );

  const markExited = useCallback((key: number) => {
    setTabs((t) => t.map((tab) => (tab.key === key ? { ...tab, exited: true } : tab)));
  }, []);

  return (
    <section className="terminals" aria-label="Terminal">
      <div className="tabbar" role="tablist">
        {tabs.map((tab) => (
          <div key={tab.key} className="tab" data-active={tab.key === activeKey}>
            <button
              type="button"
              role="tab"
              aria-selected={tab.key === activeKey}
              className="tab-label"
              onClick={() => setActiveKey(tab.key)}
            >
              {tab.title}
              {tab.exited && <span className="muted"> (exited)</span>}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${tab.title}`}
              onClick={() => close(tab.key)}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="tab-add" aria-label="New terminal" onClick={add}>
          +
        </button>
      </div>

      <div className="terminal-stack">
        {tabs.length === 0 && (
          <div className="empty">
            <button type="button" onClick={add}>
              New terminal
            </button>
          </div>
        )}
        {tabs.map((tab) => (
          <TerminalView
            key={tab.key}
            active={tab.key === activeKey}
            onExit={() => markExited(tab.key)}
          />
        ))}
      </div>
    </section>
  );
}
