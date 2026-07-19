import type { PhoneSceneAdapterId, PhoneTransitionAdapterId } from '../types';

export const frontHalfPhoneSceneIds = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top'
] as const satisfies readonly PhoneSceneAdapterId[];

export const frontHalfPhoneTransitionIds = [
  'hero-pattern',
  'pattern-star-map',
  'star-map-aod',
  'aod-method-top'
] as const satisfies readonly PhoneTransitionAdapterId[];
