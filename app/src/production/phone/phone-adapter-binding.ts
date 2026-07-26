import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type RefCallback,
  type RefObject
} from 'react';
import type {
  PhoneCapabilityRegistration,
  PhoneCapabilityRegistry
} from './phone-transition-readiness';

export function phoneAdapterHandleChanged<T>(previous: T | null, next: T | null): boolean {
  return previous !== next;
}

/**
 * Forwarded adapter handles arrive during commit, after the shell render that
 * requested a lazy module. Publishing that assignment schedules a second
 * shell render, so transition props never remain stuck at null endpoints.
 */
export function usePhoneAdapterHandleRef<T>(
  onBound: () => void
): readonly [RefObject<T | null>, RefCallback<T>] {
  const handleRef = useRef<T | null>(null);
  const bind = useCallback((next: T | null) => {
    if (!phoneAdapterHandleChanged(handleRef.current, next)) return;
    handleRef.current = next;
    if (next) onBound();
  }, [onBound]);
  return [handleRef, bind];
}

export function usePhoneCapabilityBinding<
  Id extends string,
  Handle
>(
  registry: PhoneCapabilityRegistry<Id, Handle>,
  owner: string,
  onBound: () => void
) {
  const registrations = useRef(new Map<Id, PhoneCapabilityRegistration>());
  const bind = useCallback(<Bound extends Handle>(
    id: Id,
    target: MutableRefObject<Bound | null>,
    handle: Bound | null
  ) => {
    if (target.current === handle) return false;
    target.current = handle;
    const previous = registrations.current.get(id);
    if (handle) {
      registrations.current.set(
        id,
        registry.register(id, `${owner}:${id}`, handle)
      );
    } else {
      registrations.current.delete(id);
    }
    previous?.dispose();
    onBound();
    return true;
  }, [onBound, owner, registry]);
  useEffect(() => () => {
    for (const registration of registrations.current.values()) {
      registration.dispose();
    }
    registrations.current.clear();
  }, []);
  return bind;
}
