import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import type { PhoneStoryAuthority } from './phone-story-runtime';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';
import type { PhoneStorySnapshot } from './phone-story-state';

const PhoneStoryOrchestratorContext =
  createContext<PhoneStoryRuntimePort | null>(null);

export function PhoneStoryOrchestratorProvider({
  authority,
  children
}: Readonly<{
  authority: PhoneStoryAuthority;
  children: ReactNode;
}>) {
  return (
    <PhoneStoryOrchestratorContext.Provider value={authority.port}>
      {children}
    </PhoneStoryOrchestratorContext.Provider>
  );
}

export function usePhoneStoryOrchestrator(): PhoneStoryRuntimePort {
  const port = useContext(PhoneStoryOrchestratorContext);
  if (!port) {
    throw new Error('Phone story orchestrator is unavailable');
  }
  return port;
}

/**
 * Reads the authority's single immutable snapshot through React's external
 * store protocol. Components may derive display-only data from it, but never
 * publish an alternative scene, lock, or cursor state.
 */
export function usePhoneStorySnapshot(): PhoneStorySnapshot {
  const port = usePhoneStoryOrchestrator();
  return useSyncExternalStore(
    (notify) => {
      const lease = port.subscribe(notify);
      return () => lease.dispose();
    },
    port.getSnapshot,
    port.getSnapshot
  );
}

export function usePhoneStorySelector<T>(
  selector: (snapshot: PhoneStorySnapshot) => T
): T {
  return selector(usePhoneStorySnapshot());
}
