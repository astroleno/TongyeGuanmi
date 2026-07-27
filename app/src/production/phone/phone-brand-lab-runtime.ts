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

export type PhoneBrandLabVisualScene =
  | 'figure3-animation'
  | 'ttg-animation';

export function phoneBrandLabRunForVisual(
  scene: PhoneBrandLabVisualScene
): PhoneRunId {
  return scene === 'figure3-animation' ? 'brand-services' : 'services-lab';
}

/**
 * The lazy module/cache focus is a snapshot selector. It is deliberately not
 * a local "current scene": a direct cinematic entry therefore resolves the
 * same dependency closure as an input-started transaction.
 */
export function phoneBrandLabAdapterScene(
  snapshot: PhoneCinematicSnapshot,
  fallback: 'brand' | PhoneBrandLabVisualScene | 'services' | 'lab' = 'brand'
): 'brand' | PhoneBrandLabVisualScene | 'services' | 'lab' {
  const [, , , , , , run] = snapshot;
  const visual = run === 'brand-services'
    ? 'figure3-animation'
    : run === 'services-lab' ? 'ttg-animation' : null;
  return phoneCompositeAdapterScene(snapshot, fallback, 'brand', 'lab', visual);
}

/**
 * Time-owned media starts only after the authority has entered its second
 * composite leg. The returned identity is passed to Figure3/TTG and captured
 * by their asynchronous callbacks at start, so stale decoder evidence cannot
 * label itself with a later snapshot.
 */
export function phoneBrandLabVisualExecution(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
){
  return phoneCompositeVisualExecution(snapshot, phoneBrandLabRunForVisual(scene));
}

function surfaceForVisual(scene: PhoneBrandLabVisualScene): string {
  return scene === 'figure3-animation' ? 'group45:figure3' : 'group45:ttg';
}

export function phoneBrandLabVisualProjection(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
): PhoneCompositeVisualProjection {
  return phoneCompositeVisualProjection(
    snapshot,
    phoneBrandLabRunForVisual(scene),
    surfaceForVisual(scene),
    scene === 'figure3-animation' ? 'services' : 'lab'
  );
}

/** Decoder warm-up follows the same dependency closure as the authority run. */
export function phoneBrandLabVisualPrewarm(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
): boolean {
  return phoneCompositeVisualPrewarm(
    snapshot,
    phoneBrandLabRunForVisual(scene),
    surfaceForVisual(scene)
  );
}

/**
 * Group 45 has no independent run view. Stable endpoints, active composite
 * legs, and rollback endpoints are all deterministic projections of the one
 * route-local snapshot.
 */
export function phoneBrandLabMediaProgress(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
): number {
  return phoneCompositeMediaProgress(
    snapshot,
    phoneBrandLabRunForVisual(scene),
    scene === 'figure3-animation' ? 'services' : 'lab'
  );
}
