import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import type { PhoneStoryOrchestrator } from './phone-story-orchestrator';
import type { PhoneStorySnapshot } from './phone-story-state';

const PhoneStoryOrchestratorContext =
  createContext<PhoneStoryOrchestrator | null>(null);

export function PhoneStoryOrchestratorProvider({
  orchestrator,
  children
}: Readonly<{
  orchestrator: PhoneStoryOrchestrator;
  children: ReactNode;
}>) {
  return (
    <PhoneStoryOrchestratorContext.Provider value={orchestrator}>
      {children}
    </PhoneStoryOrchestratorContext.Provider>
  );
}

export function usePhoneStoryOrchestrator(): PhoneStoryOrchestrator {
  const orchestrator = useContext(PhoneStoryOrchestratorContext);
  if (!orchestrator) {
    throw new Error('Phone story orchestrator is unavailable');
  }
  return orchestrator;
}

/**
 * Reads the authority's single immutable snapshot through React's external
 * store protocol. Components may derive display-only data from it, but never
 * publish an alternative scene, lock, or cursor state.
 */
export function usePhoneStorySnapshot(): PhoneStorySnapshot {
  const orchestrator = usePhoneStoryOrchestrator();
  return useSyncExternalStore(
    (notify) => {
      const lease = orchestrator.subscribe(notify);
      return () => lease.dispose();
    },
    orchestrator.getSnapshot,
    orchestrator.getSnapshot
  );
}

export function usePhoneStorySelector<T>(
  selector: (snapshot: PhoneStorySnapshot) => T
): T {
  return selector(usePhoneStorySnapshot());
}
