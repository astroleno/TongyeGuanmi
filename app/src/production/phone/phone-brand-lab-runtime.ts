import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type {
  PhoneExecutionIdentity
} from './phone-story-state';
import type { PhoneCinematicSnapshot } from './phone-story-runtime';

export type PhoneBrandLabVisualScene =
  | 'figure3-animation'
  | 'ttg-animation';

export type PhoneBrandLabCompositeFrame = Readonly<{
  entryProgress: number;
  mediaProgress: number;
}>;

function sceneIndex(scene: SceneId): number {
  return (canonicalSceneIds as readonly SceneId[]).indexOf(scene);
}

function isGroup45Scene(scene: SceneId): scene is
  | 'brand'
  | PhoneBrandLabVisualScene
  | 'services'
  | 'lab' {
  return scene === 'brand'
    || scene === 'figure3-animation'
    || scene === 'services'
    || scene === 'ttg-animation'
    || scene === 'lab';
}

function rollbackEndpoint(
  [, , , , , , , direction]: PhoneCinematicSnapshot
): 0 | 1 {
  return direction === 1 ? 0 : 1;
}

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
  const [semanticScene, , , , , , run] = snapshot;
  const visual = run === 'brand-services'
    ? 'figure3-animation'
    : run === 'services-lab' ? 'ttg-animation' : null;
  if (visual) return visual;
  return isGroup45Scene(semanticScene)
    ? semanticScene
    : fallback;
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
): PhoneExecutionIdentity | null {
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
  const run = phoneBrandLabRunForVisual(scene);
  if (
    activeRun !== run
    || legIndex !== 1
    || phase !== 'animating'
    || sessionId === null
    || generation === null
    || direction === null
  ) return null;
  return {
    authorityId,
    sessionId,
    generation,
    leg: legIndex,
    direction
  };
}

function surfaceForVisual(scene: PhoneBrandLabVisualScene): string {
  return scene === 'figure3-animation' ? 'group45:figure3' : 'group45:ttg';
}

/** Decoder warm-up follows the same dependency closure as the authority run. */
export function phoneBrandLabVisualPrewarm(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
): boolean {
  const [, sourceSurface, receiverSurface, , , , run] = snapshot;
  if (run !== null) return run === phoneBrandLabRunForVisual(scene);
  const surface = surfaceForVisual(scene);
  return sourceSurface === surface || receiverSurface === surface;
}

/**
 * Group 45 has no independent run view. Stable endpoints, active composite
 * legs, and rollback endpoints are all deterministic projections of the one
 * route-local snapshot.
 */
export function phoneBrandLabCompositeFrame(
  snapshot: PhoneCinematicSnapshot,
  scene: PhoneBrandLabVisualScene
): PhoneBrandLabCompositeFrame {
  const [semanticScene, , , , , , activeRun, , legIndex, phase, progress] = snapshot;
  const run = phoneBrandLabRunForVisual(scene);
  if (activeRun === run && legIndex !== null && phase !== null && progress !== null) {
    if (phase.startsWith('rollback-')) {
      const endpoint = rollbackEndpoint(snapshot);
      return { entryProgress: endpoint, mediaProgress: endpoint };
    }
    return {
      entryProgress: legIndex === 0
        ? progress
        : 1,
      mediaProgress: legIndex === 1
        ? progress
        : 0
    };
  }
  const target = scene === 'figure3-animation' ? 'services' : 'lab';
  const completed = sceneIndex(semanticScene) >= sceneIndex(target);
  return {
    entryProgress: completed ? 1 : 0,
    mediaProgress: completed ? 1 : 0
  };
}
