// Tiny pub/sub so the hero's 3D chain can react to blocks seen by the ticker.
type Listener = (grew: number) => void;

const listeners = new Set<Listener>();

export function subscribeToNewBlocks(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitNewBlocks(grew: number): void {
  listeners.forEach((fn) => fn(grew));
}
