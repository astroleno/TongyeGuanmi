import { useCallback, useRef, type RefCallback, type RefObject } from 'react';

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
