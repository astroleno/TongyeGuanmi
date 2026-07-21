import type { PhoneSceneAdapterId, PhoneTransitionAdapterId } from '../types';

/** Method remains in the frozen front half; this group begins at Figure2. */
export const gradeAPhoneSceneIds = [
  'figure2-animation',
  'figure2-proof'
] as const satisfies readonly PhoneSceneAdapterId[];

export const gradeAPhoneTransitionIds = [
  'method-bottom-figure2',
  'figure2-distance-expand',
  'figure2-proof-brand'
] as const satisfies readonly PhoneTransitionAdapterId[];

export const gradeAPhoneAdapterIds = [
  ...gradeAPhoneSceneIds,
  ...gradeAPhoneTransitionIds
] as const;
