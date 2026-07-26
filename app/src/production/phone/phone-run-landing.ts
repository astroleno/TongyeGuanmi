import type { PhoneTransitionDirection } from './phone-transition-coordinator';

/**
 * Landing policy belongs to the one story orchestrator. Adapters report only
 * their natural boundary coordinate; a reverse run preserves any already
 * presented overshoot while a forward run lands on the target boundary.
 */
export function resolvePhoneRunLanding(
  currentY: number,
  boundaryY: number,
  direction: PhoneTransitionDirection
): number {
  return Math.max(0, direction === 1 ? boundaryY : Math.min(currentY, boundaryY));
}
