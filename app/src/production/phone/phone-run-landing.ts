import type { PhoneRunAnchorPolicy } from './phone-story-runs';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';

export type PhoneRunLandingRequest = Readonly<{
  policy: PhoneRunAnchorPolicy;
  direction: PhoneTransitionDirection;
  currentY: number;
  boundaryY: number;
  /** Final target marker measured by the selected corridor. */
  targetY?: number | undefined;
  compositeY?: number | undefined;
}>;

function exhaustivePolicy(policy: never): never {
  throw new Error(`Unknown phone anchor policy: ${policy}`);
}

/**
 * Converts a corridor measurement into a committed landing without allowing a
 * generic target-top fallback to erase authored semantic/composite anchors.
 */
export function resolvePhoneRunLanding({
  policy,
  direction,
  currentY,
  boundaryY,
  targetY,
  compositeY
}: PhoneRunLandingRequest): number {
  switch (policy) {
    case 'front-corridor':
      return Math.max(0, targetY ?? boundaryY);
    case 'aod-semantic-edge':
      // The boundary starts and reverses AOD, but a completed forward run
      // must land its native Method target before its final proof/commit.
      if (direction === 1 && targetY !== undefined) {
        return Math.max(0, targetY);
      }
      return Math.max(0, boundaryY);
    case 'authored-boundary':
      return Math.max(0, targetY ?? (
        direction === 1 ? boundaryY : Math.min(currentY, boundaryY)
      ));
    case 'preserve-composite':
      return Math.max(0, compositeY ?? currentY);
    default:
      return exhaustivePolicy(policy);
  }
}
