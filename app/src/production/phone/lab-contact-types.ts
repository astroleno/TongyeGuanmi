import type {
  PhoneSceneAdapterComponent,
  PhoneTransitionAdapterComponent
} from './types';

/**
 * Temporary acceptance-only contract for the independently migrated Lab →
 * Contact slice. Unit 7 owns promotion into the shared PhoneStoryShell
 * registry after the preceding story groups are physically accepted.
 */
export const labContactPhoneSceneAdapterIds = [
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const;

export const labContactPhoneTransitionAdapterIds = [
  'lab-ph',
  'ph-education',
  'education-crane',
  'crane-contact'
] as const;

export type LabContactSceneId = (typeof labContactPhoneSceneAdapterIds)[number];
export type LabContactTransitionId = (typeof labContactPhoneTransitionAdapterIds)[number];

export type LabContactPhoneSceneAdapterModule = Readonly<{
  id: LabContactSceneId;
  Component: PhoneSceneAdapterComponent;
}>;

export type LabContactPhoneTransitionAdapterModule = Readonly<{
  id: LabContactTransitionId;
  Component: PhoneTransitionAdapterComponent;
}>;
