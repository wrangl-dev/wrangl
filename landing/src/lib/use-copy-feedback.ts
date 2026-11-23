import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyLabel = 'Copy' | 'Copied' | 'Select it';

/** Clipboard copy with button label feedback: Copied or Select it, back to Copy after 1.5s. */
export function useCopyFeedback() {
  const [label, setLabel] = useState<CopyLabel>('Copy');
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setLabel('Copied');
      } catch {
        setLabel('Select it');
      }
      clear();
      timer.current = window.setTimeout(() => setLabel('Copy'), 1500);
    },
    [clear],
  );

  const reset = useCallback(() => {
    clear();
    setLabel('Copy');
  }, [clear]);

  return { label, copy, reset };
}
