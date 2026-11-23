import { useEffect, useState } from 'react';
import { type AvailableUpdate, checkForUpdate } from '../lib/updates';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** A status-bar button that appears when a newer Wrangl is out, and installs it. */
export function UpdateButton({ check = checkForUpdate }: { check?: typeof checkForUpdate }) {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      check().then((u) => {
        if (alive && u) setUpdate(u);
      });
    run();
    const timer = setInterval(run, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [check]);

  if (!update) return null;

  const install = () => {
    setError(null);
    setProgress('0%');
    update
      .install((done, total) =>
        setProgress(
          total ? `${Math.floor((done / total) * 100)}%` : `${Math.round(done / 1e6)} MB`,
        ),
      )
      .catch((e: unknown) => {
        setProgress(null);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <button
      type="button"
      className="status-button update-button"
      onClick={install}
      disabled={progress !== null}
      title={error ?? update.notes ?? `Install Wrangl ${update.version} and restart`}
    >
      {progress
        ? `Updating… ${progress}`
        : error
          ? 'Update failed, retry'
          : `Update to ${update.version}`}
    </button>
  );
}
