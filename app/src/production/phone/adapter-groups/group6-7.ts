import type { SceneId, SegmentId } from '../../../story/types';

export type Group67PhoneSceneId =
  | 'ph-animation'
  | 'education'
  | 'crane-animation'
  | 'contact';

export type Group67PhoneTransitionId =
  | 'lab-ph'
  | 'ph-education'
  | 'education-crane'
  | 'crane-contact';

export const group67PhoneSceneIds = [
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const satisfies readonly Group67PhoneSceneId[] & readonly SceneId[];

export const group67PhoneTransitionIds = [
  'lab-ph',
  'ph-education',
  'education-crane',
  'crane-contact'
] as const satisfies readonly Group67PhoneTransitionId[] & readonly SegmentId[];

export const group67PhoneAdapterIds = [
  ...group67PhoneSceneIds,
  ...group67PhoneTransitionIds
] as const;

export const group67NextAdapterByScene: Readonly<Partial<Record<
  Group67PhoneSceneId,
  Readonly<{
    scene: Group67PhoneSceneId;
    transition: Group67PhoneTransitionId;
  }>
>>> = {
  'ph-animation': {
    scene: 'education',
    transition: 'ph-education'
  },
  education: {
    scene: 'crane-animation',
    transition: 'education-crane'
  },
  'crane-animation': {
    scene: 'contact',
    transition: 'crane-contact'
  }
};
