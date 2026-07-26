import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';

export type PhoneLabContactVisualScene =
  | 'ph-animation'
  | 'crane-animation';

export function phoneLabContactRunForVisual(
  scene: PhoneLabContactVisualScene
): PhoneRunId {
  return scene === 'ph-animation' ? 'lab-education' : 'education-contact';
}

export function phoneGroup67RunSource(
  scene: PhoneLabContactVisualScene,
  direction: 1 | -1
): Extract<SceneId, 'lab' | 'education' | 'contact'> {
  if (scene === 'ph-animation') {
    return direction === 1 ? 'lab' : 'education';
  }
  return direction === 1 ? 'education' : 'contact';
}
