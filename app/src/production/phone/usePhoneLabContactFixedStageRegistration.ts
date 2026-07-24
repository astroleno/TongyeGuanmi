import { useLayoutEffect, useState } from 'react';

export function shouldPrimePhoneLabContactFixedStage(
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

/**
 * Register the one Unit 6 fixed host only after a committed native Lab frame.
 * This is the cold-Safari staging policy proven by the production phone shell.
 */
export function usePhoneLabContactFixedStageRegistration(
  canRegister: boolean,
  directEntry = false
): boolean {
  const [registered, setRegistered] = useState(
    () => !shouldPrimePhoneLabContactFixedStage(
      currentNavigationType(),
      directEntry
    )
  );

  useLayoutEffect(() => {
    if (registered || !canRegister) return;
    let registrationFrame: number | undefined;
    const committedLabFrame = window.requestAnimationFrame(() => {
      registrationFrame = window.requestAnimationFrame(() => {
        setRegistered(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(committedLabFrame);
      if (registrationFrame !== undefined) {
        window.cancelAnimationFrame(registrationFrame);
      }
    };
  }, [canRegister, registered]);

  return registered;
}
