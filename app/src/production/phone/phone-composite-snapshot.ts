import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneExecutionToken } from './phone-story-state';
import type { PhoneCinematicSnapshot } from './phone-story-runtime';

function sceneIndex(scene: SceneId): number {
  return (canonicalSceneIds as readonly SceneId[]).indexOf(scene);
}

function rollbackEndpoint(
  [, , , , , , , direction]: PhoneCinematicSnapshot
): 0 | 1 {
  return direction === 1 ? 0 : 1;
}

/**
 * Each continuation owns one contiguous canonical interval. An active run
 * names its visual dependency directly; otherwise the stable scene in that
 * interval selects the lazy adapter closure.
 */
export function phoneCompositeAdapterScene<Scene extends SceneId>(
  snapshot: PhoneCinematicSnapshot,
  fallback: Scene,
  first: SceneId,
  last: SceneId,
  visual: Scene | null
): Scene {
  if (visual !== null) return visual;
  const index = sceneIndex(snapshot[0]);
  return index >= sceneIndex(first) && index <= sceneIndex(last)
    ? snapshot[0] as Scene
    : fallback;
}

/** The authority's active second leg is the sole source of media identity. */
export function phoneCompositeVisualExecution(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId
): PhoneExecutionToken | null {
  const [
    ,
    ,
    ,
    authorityId,
    sessionId,
    generation,
    activeRun,
    direction,
    legIndex,
    phase
  ] = snapshot;
  if (
    activeRun !== run
    || legIndex !== 1
    || phase !== 'animating'
    || sessionId === null
    || generation === null
    || direction === null
  ) return null;
  return [authorityId, sessionId, generation, legIndex, direction];
}

/** Decoder warm-up follows the same dependency closure as the active run. */
export function phoneCompositeVisualPrewarm(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  surface: string
): boolean {
  const [, sourceSurface, receiverSurface, , , , activeRun] = snapshot;
  return activeRun !== null
    ? activeRun === run
    : sourceSurface === surface || receiverSurface === surface;
}

/** Stable endpoints, active legs, and rollbacks all derive from one snapshot. */
export function phoneCompositeMediaProgress(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  target: SceneId
): number {
  const [semanticScene, , , , , , activeRun, , legIndex, phase, progress] = snapshot;
  if (activeRun === run && legIndex !== null && phase !== null && progress !== null) {
    if (phase.startsWith('rollback-')) {
      return rollbackEndpoint(snapshot);
    }
    return legIndex === 1 ? progress : 0;
  }
  const completed = sceneIndex(semanticScene) >= sceneIndex(target);
  return completed ? 1 : 0;
}

export type PhoneCompositeVisualProjection = readonly [
  execution: PhoneExecutionToken | null,
  prewarm: boolean,
  mediaProgress: number
];

/** One render-ready tuple keeps consumers from recomputing the same snapshot. */
export function phoneCompositeVisualProjection(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  surface: string,
  target: SceneId
): PhoneCompositeVisualProjection {
  return [
    phoneCompositeVisualExecution(snapshot, run),
    phoneCompositeVisualPrewarm(snapshot, run, surface),
    phoneCompositeMediaProgress(snapshot, run, target)
  ];
}

export function phoneDocumentTop(element: HTMLElement | null): number | null {
  if (!element) return null;
  return Math.max(0, window.scrollY + element.getBoundingClientRect().top);
}

export function phoneSnapshotProjectsSurface(
  source: string | null,
  receiver: string,
  id: string
): boolean {
  return source === id || receiver === id;
}

export function phoneClampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}
