import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import type {
  PhoneStoryAuthority,
  PhoneStoryRuntimePort,
  PhoneStorySnapshot
} from './phone-story/runtime';

const PhoneStoryRuntimeContext =
  createContext<PhoneStoryRuntimePort | null>(null);

export function PhoneStoryRuntimeProvider({
  authority,
  children
}: Readonly<{
  authority: PhoneStoryAuthority;
  children: ReactNode;
}>) {
  return (
    <PhoneStoryRuntimeContext.Provider value={authority.port}>
      {children}
    </PhoneStoryRuntimeContext.Provider>
  );
}

export function usePhoneStoryRuntimePort(): PhoneStoryRuntimePort {
  const port = useOptionalPhoneStoryRuntimePort();
  if (!port) {
    throw new Error('Phone story runtime is unavailable');
  }
  return port;
}

/** Driver-only bridge for explicitly registering a transient effect element. */
export function useOptionalPhoneStoryRuntimePort(): PhoneStoryRuntimePort | null {
  return useContext(PhoneStoryRuntimeContext);
}

/**
 * Reads the authority's single immutable snapshot through React's external
 * store protocol. Components may derive display-only data from it, but never
 * publish an alternative scene, lock, or cursor state.
 */
export function usePhoneStorySnapshot(): PhoneStorySnapshot {
  const port = usePhoneStoryRuntimePort();
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
