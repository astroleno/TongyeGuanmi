import { useLayoutEffect, useState } from 'react';

export function shouldPrimePhoneFixedStage(
  navigationType?: PerformanceNavigationTiming['type'],
  directEntry = false
): boolean {
  return !directEntry
    && (navigationType === undefined || navigationType === 'navigate');
}

function currentNavigationType(): PerformanceNavigationTiming['type'] | undefined {
  if (typeof window === 'undefined') return undefined;
  const navigation = window.performance
    .getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type;
}

/** Registers the viewport-sized fixed stage only after one visible Hero frame. */
export function usePhoneFixedStageRegistration(canRegister: boolean): boolean {
  const [registered, setRegistered] = useState(
    () => !shouldPrimePhoneFixedStage(
      currentNavigationType(),
      typeof window !== 'undefined' && window.location.hash.length > 0
    )
  );

  useLayoutEffect(() => {
    if (registered || !canRegister) return;
    let registrationFrame: number | undefined;
    const committedPrimeFrame = window.requestAnimationFrame(() => {
      registrationFrame = window.requestAnimationFrame(() => {
        setRegistered(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(committedPrimeFrame);
      if (registrationFrame !== undefined) {
        window.cancelAnimationFrame(registrationFrame);
      }
    };
  }, [canRegister, registered]);

  return registered;
}
