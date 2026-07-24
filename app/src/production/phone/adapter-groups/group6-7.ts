import type { SceneId, SegmentId } from '../../../story/types';

/**
 * Ownership registry only. Unit 7 extends the shared loader/type union and
 * mounts these adapters lazily; keeping that change out of this batch prevents
 * it from prematurely coupling to an unfinished Unit 4/5 composition.
 */
export const group67PhoneSceneIds = [
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const satisfies readonly SceneId[];

export const group67PhoneTransitionIds = [
  'lab-ph',
  'ph-education',
  'education-crane',
  'crane-contact'
] as const satisfies readonly SegmentId[];

export const group67PhoneAdapterIds = [
  ...group67PhoneSceneIds,
  ...group67PhoneTransitionIds
] as const;
