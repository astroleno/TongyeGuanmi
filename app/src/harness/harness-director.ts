import { useSyncExternalStore } from 'react';
import { canUseDOM } from '../runtime/browser-guard';
import { createDirectorRuntime } from '../runtime/director.actor';

export const directorRuntime = createDirectorRuntime();

export function useDirectorSnapshot() {
  return useSyncExternalStore(
    directorRuntime.subscribe,
    directorRuntime.getState,
    directorRuntime.getState
  );
}

declare global {
  interface Window {
    __story?: ReturnType<typeof createDirectorRuntime>;
  }
}

if (canUseDOM()) {
  window.__story = directorRuntime;
}
