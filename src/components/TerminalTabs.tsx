import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { TerminalView } from './TerminalView';

interface Tab {
  key: number;
  title: string;
  cwd?: string;
  exited: boolean;
}

interface Props {
  /** The panel is open. Closed panels keep their shells running. */
  visible: boolean;
  /** Folder new tabs start in (the active project). */
  cwd?: string;
  onHide: () => void;
}

/** Terminal tabs. Every tab stays mounted so switching or hiding never restarts a shell. */
export function TerminalTabs({ visible, cwd, onHide }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState(0);
  const nextKey = useRef(1);

  const add = useCallback(() => {
    const key = nextKey.current++;
    setTabs((t) => [...t, { key, title: `Terminal ${key}`, cwd, exited: false }]);
    setActiveKey(key);
  }, [cwd]);

  // The first time the panel opens, start a terminal in the current project.
  const opened = useRef(false);
  useEffect(() => {
    if (visible && !opened.current) {
      opened.current = true;
      add();
    }
  }, [visible, add]);

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
    <section className="terminals" aria-label="Terminal" hidden={!visible}>
      <div className="tabbar">
        <div className="tabs" role="tablist">
          {tabs.map((tab) => (
            <div key={tab.key} className="tab" data-active={tab.key === activeKey}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.key === activeKey}
                className="tab-label"
                title={tab.cwd}
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
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
          <button type="button" className="tab-add" aria-label="New terminal" onClick={add}>
            <Icon name="plus" size={13} />
          </button>
        </div>
        <button type="button" className="icon-button" aria-label="Hide terminal" onClick={onHide}>
          <Icon name="close" size={13} />
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
            active={visible && tab.key === activeKey}
            cwd={tab.cwd}
            onExit={() => markExited(tab.key)}
          />
        ))}
      </div>
    </section>
  );
}
