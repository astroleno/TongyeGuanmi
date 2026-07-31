import type { PhoneStorySnapshot } from './phone-story/runtime';

/** Structural stable-hold guard used by runtime and regression contracts. */
export function isStablePhonePresentation(
  snapshot: PhoneStorySnapshot
): boolean {
  return snapshot.status === 'stable'
    && snapshot.session === null
    && snapshot.projection.commitState === 'stable';
}

export function assertStablePhonePresentation(
  snapshot: PhoneStorySnapshot
): void {
  if (!isStablePhonePresentation(snapshot)) {
    throw new Error('Phone stable presentation must be a sessionless stable projection');
  }
}
