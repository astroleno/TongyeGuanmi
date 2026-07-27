import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneCinematicSnapshot } from './phone-story-runtime';
import {
  phoneCompositeAdapterScene,
  phoneCompositeMediaProgress,
  phoneCompositeVisualExecution,
  phoneCompositeVisualProjection,
  phoneCompositeVisualPrewarm
} from './phone-composite-snapshot';
import type { PhoneCompositeVisualProjection } from './phone-composite-snapshot';

export type PhoneLabContactVisualScene =
  | 'ph-animation'
  | 'crane-animation';

type Group67SemanticScene =
  | 'lab'
  | PhoneLabContactVisualScene
  | 'education'
  | 'contact';

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

/**
 * Lazy-module focus is a snapshot selector, not a continuation-owned scene.
 * Direct entry therefore resolves the same dependency closure as a physical
 * Group67 transition.
 */
export function phoneLabContactAdapterScene(
  snapshot: PhoneCinematicSnapshot,
  fallback: Group67SemanticScene = 'lab'
): Group67SemanticScene {
  const [, , , , , , run] = snapshot;
  const visual = run === 'lab-education'
    ? 'ph-animation'
    : run === 'education-contact' ? 'crane-animation' : null;
  return phoneCompositeAdapterScene(snapshot, fallback, 'lab', 'contact', visual);
}

/**
 * The route authority supplies the one immutable media identity after its
 * second composite leg is animating. PH and Crane capture that value at
 * start; they never re-label an asynchronous callback with a newer session.
 */
export function phoneLabContactVisualExecution(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneLabContactVisualScene
){
  return phoneCompositeVisualExecution(snapshot, phoneLabContactRunForVisual(scene));
}

function surfaceForVisual(scene: PhoneLabContactVisualScene): string {
  return scene === 'ph-animation' ? 'group67:ph' : 'group67:crane';
}

export function phoneLabContactVisualProjection(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneLabContactVisualScene
): PhoneCompositeVisualProjection {
  return phoneCompositeVisualProjection(
    snapshot,
    phoneLabContactRunForVisual(scene),
    surfaceForVisual(scene),
    scene === 'ph-animation' ? 'education' : 'contact'
  );
}

/** Decoder warm-up follows the same dependency closure as the active run. */
export function phoneLabContactVisualPrewarm(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneLabContactVisualScene
): boolean {
  return phoneCompositeVisualPrewarm(
    snapshot,
    phoneLabContactRunForVisual(scene),
    surfaceForVisual(scene)
  );
}

/**
 * All Group67 entry/media progress is a deterministic read model of the one
 * authority snapshot. There is no local stage or active-run view.
 */
export function phoneLabContactMediaProgress(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneLabContactVisualScene
): number {
  return phoneCompositeMediaProgress(
    snapshot,
    phoneLabContactRunForVisual(scene),
    scene === 'ph-animation' ? 'education' : 'contact'
  );
}
