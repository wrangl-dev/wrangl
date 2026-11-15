import { useEffect, useRef } from 'react';

import { subscribeToNewBlocks } from '../../lib/chain-feed';

/** Background 3D chain. three.js is imported on the client after mount, never during SSR. */
export function HeroChainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let teardown = () => {};
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    import('../../lib/chain-scene')
      .then(({ createChainScene }) => {
        if (cancelled) return;
        const handle = createChainScene(canvas, { reducedMotion });
        if (!handle) {
          canvas.style.display = 'none'; // no WebGL
          return;
        }
        const unsubscribe = subscribeToNewBlocks(handle.addBlocks);
        teardown = () => {
          unsubscribe();
          handle.dispose();
        };
      })
      .catch(() => {
        canvas.style.display = 'none';
      });

    return () => {
      cancelled = true;
      teardown();
    };
  }, []);

  return <canvas id="chain3d" ref={ref} aria-hidden="true"></canvas>;
}
