import type { SceneId } from '../../story/types';
import { phoneRunTuple, type PhoneRunId } from './phone-story-runs';
import type {
  PhoneStorySnapshot
} from './phone-story/machine';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';

export type PhoneScrollViewport = Readonly<{
  actualY: number;
  viewportWidth: number;
  viewportHeight: number;
  visualViewportOffsetTop: number;
}>;

export type PhoneScrollCorridorSample = Readonly<{
  actualY?: number;
  scene?: SceneId;
  run?: PhoneRunId;
  direction?: -1 | 0 | 1;
  progress?: number;
  /** Presentation strategy is a sampled fact, never a second controller. */
  reducedMotion?: boolean;
}>;

export type PhoneLandingReason =
  | 'forward'
  | 'reverse'
  | 'direct-entry'
  | 'rollback';

export type PhoneScrollCorridor = Readonly<{
  id: string;
  scenes: readonly SceneId[];
  sample(viewport: PhoneScrollViewport): PhoneScrollCorridorSample | null;
  boundary(run: PhoneRunId, direction: PhoneTransitionDirection): number | null;
  landing(
    scene: SceneId,
    reason: PhoneLandingReason,
    direction: PhoneTransitionDirection
  ): number | null;
}>;

export type PhoneScrollCorridorLease = Readonly<{ dispose(): void }>;

export type PhoneScrollCorridorRegistry = Readonly<{
  register(corridor: PhoneScrollCorridor): PhoneScrollCorridorLease;
  sample(
    snapshot: PhoneStorySnapshot,
    viewport: PhoneScrollViewport
  ): Readonly<{ corridor: string; sample: PhoneScrollCorridorSample }> | null;
  boundary(
    snapshot: PhoneStorySnapshot,
    run: PhoneRunId,
    direction: PhoneTransitionDirection
  ): number | null;
  landing(
    snapshot: PhoneStorySnapshot,
    scene: SceneId,
    reason: PhoneLandingReason,
    direction: PhoneTransitionDirection,
    run?: PhoneRunId | null
  ): number | null;
  clear(): void;
}>;

function scenesForSnapshot(snapshot: PhoneStorySnapshot): readonly SceneId[] {
  if (snapshot.status === 'stable') return [snapshot.scene];
  return [
    snapshot.projection.semanticScene,
    snapshot.projection.navigationScene,
    ...(snapshot.projection.stageScene ? [snapshot.projection.stageScene] : [])
  ];
}

function firstForScenes(
  corridors: Iterable<PhoneScrollCorridor>,
  scenes: readonly SceneId[]
): PhoneScrollCorridor | null {
  for (const corridor of corridors) {
    if (scenes.some((scene) => corridor.scenes.includes(scene))) return corridor;
  }
  return null;
}

function firstForRun(
  corridors: Iterable<PhoneScrollCorridor>,
  run: PhoneRunId,
  direction: PhoneTransitionDirection
): PhoneScrollCorridor | null {
  const [, from, to] = phoneRunTuple(run);
  let fallback: PhoneScrollCorridor | null = null;
  for (const corridor of corridors) {
    if (corridor.boundary(run, direction) !== null) return corridor;
    if (!fallback && corridor.scenes.includes(from) && corridor.scenes.includes(to)) {
      fallback = corridor;
    }
  }
  return fallback;
}

export function createPhoneScrollCorridorRegistry(): PhoneScrollCorridorRegistry {
  const corridors = new Map<string, PhoneScrollCorridor>();
  const selected = (snapshot: PhoneStorySnapshot) => firstForScenes(
    corridors.values(),
    scenesForSnapshot(snapshot)
  );

  return {
    register(corridor) {
      const prior = corridors.get(corridor.id);
      if (prior && prior !== corridor) {
        throw new Error(`Duplicate phone scroll corridor: ${corridor.id}`);
      }
      corridors.set(corridor.id, corridor);
      return {
        dispose() {
          if (corridors.get(corridor.id) === corridor) corridors.delete(corridor.id);
        }
      };
    },
    sample(snapshot, viewport) {
      const corridor = selected(snapshot);
      if (!corridor) return null;
      const sample = corridor.sample(viewport);
      return sample ? { corridor: corridor.id, sample } : null;
    },
    boundary(snapshot, run, direction) {
      let boundary = selected(snapshot)?.boundary(run, direction);
      if (boundary == null) {
        corridors.forEach((corridor) => {
          boundary ??= corridor.boundary(run, direction);
        });
      }
      return boundary ?? null;
    },
    landing(snapshot, scene, reason, direction, requestedRun) {
      const run = requestedRun ?? (
        snapshot.status === 'transaction' ? snapshot.session.operation.run : null
      );
      const corridor = run
        ? firstForRun(corridors.values(), run, direction)
        : firstForScenes(corridors.values(), [scene]) ?? selected(snapshot);
      return corridor?.landing(scene, reason, direction) ?? null;
    },
    clear() {
      corridors.clear();
    }
  };
}
