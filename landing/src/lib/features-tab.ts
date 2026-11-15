import { useSyncExternalStore } from 'react';

export type FeaturesTab = 'wrangl' | 'crypto';

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('hashchange', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('hashchange', fn);
  };
}

const getSnapshot = (): FeaturesTab => (window.location.hash === '#crypto' ? 'crypto' : 'wrangl');
const getServerSnapshot = (): FeaturesTab => 'wrangl';

/** Active tab, driven by the URL hash (#wrangl or #crypto). Server render always shows Wrangl. */
export function useFeaturesTab(): FeaturesTab {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setFeaturesTab(tab: FeaturesTab) {
  window.history.replaceState(null, '', '#' + tab);
  listeners.forEach((fn) => fn());
}
