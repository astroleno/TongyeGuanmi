import {
  FRONT_HALF_CHECKPOINT_IDS,
  type FrontHalfCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import type { PhoneScrollRunId } from './phone-story-runs';
import type { PhoneStageSceneId } from './types';

export const PHONE_STAGE_STOPS = Object.freeze({
  heroMotionEnd: 0.16,
  heroPatternEnd: 0.25,
  patternMotionStart: 0.29,
  patternMotionEnd: 0.47,
  patternStarStart: 0.52,
  patternStarEnd: 0.61,
  starAodStart: 0.71,
  starAodEnd: 0.80,
  aodAutoplayStart: 0.985
});

export type PhoneStageOwnershipKey =
  | 'hold-hero'
  | 'handoff-hero-pattern'
  | 'hold-pattern'
  | 'handoff-pattern-star'
  | 'hold-star'
  | 'handoff-star-aod'
  | 'hold-aod';

/**
 * This timeline is emitted as a shared production chunk. Keep its frame
 * positional so the shell and every lazy consumer cannot disagree on mangled
 * object-property names.
 */
export type PhoneStageFrame = readonly [
  progress: number,
  checkpoint: FrontHalfCheckpointId,
  navigationScene: PhoneStageSceneId,
  heroProgress: number,
  patternProgress: number,
  starProgress: number,
  heroPatternProgress: number,
  patternStarProgress: number,
  starAodProgress: number,
  shouldStartAodAutoplay: boolean,
  ownershipKey: PhoneStageOwnershipKey
];

export type PhoneFrontRailSample = Readonly<{
  scene?: PhoneStageSceneId;
  run?: PhoneScrollRunId;
  progress: number;
  direction: -1 | 0 | 1;
}>;

/**
 * Positional transport for the independently minified timeline and lazy
 * stage chunks. Keep the named object entirely inside this module.
 */
export type PhoneFrontRailSampleTuple = readonly [
  scene: PhoneStageSceneId | null,
  run: PhoneScrollRunId | null,
  direction: -1 | 0 | 1,
  progress: number
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const PHONE_POST_METHOD_DIRECT_ENTRY_SCENES = new Set<SceneId>([
  'figure2-animation',
  'figure2-proof',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
]);

/** A downstream hash starts at its requested chapter, not inside AOD autoplay. */
export function phoneDirectEntryCompletesAod(
  scene: SceneId | undefined
): boolean {
  return Boolean(scene && PHONE_POST_METHOD_DIRECT_ENTRY_SCENES.has(scene));
}

export function phoneRangeProgress(value: number, start: number, end: number): number {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  return clamp((value - start) / (end - start));
}

/**
 * The Route B rail only maps document distance to semantic presentation state.
 * Scene-specific DOM work stays inside adapters and named transitions.
 */
export function phoneStageFrame(rawProgress: number, reducedMotion = false): PhoneStageFrame {
  const progress = clamp(rawProgress);
  const stops = PHONE_STAGE_STOPS;
  const heroProgress = phoneRangeProgress(progress, 0, stops.heroMotionEnd);
  const heroPatternProgress = phoneRangeProgress(progress, stops.heroMotionEnd, stops.heroPatternEnd);
  const patternProgress = phoneRangeProgress(progress, stops.patternMotionStart, stops.patternMotionEnd);
  const patternStarProgress = phoneRangeProgress(progress, stops.patternStarStart, stops.patternStarEnd);
  const starAodProgress = phoneRangeProgress(progress, stops.starAodStart, stops.starAodEnd);
  const starProgress = progress >= stops.patternStarStart ? 1 : 0;

  if (reducedMotion) {
    if (progress < stops.heroPatternEnd) {
      return [progress, 'hero-entered', 'hero', 1, 0, 0, 0, 0, 0, false, 'hold-hero'];
    }
    if (progress < stops.patternStarEnd) {
      return [progress, 'pattern-complete', 'pattern', 1, 1, 0, 1, 0, 0, false, 'hold-pattern'];
    }
    if (progress < stops.starAodEnd) {
      return [progress, 'star-map-reading', 'star-map', 1, 1, 1, 1, 1, 0, false, 'hold-star'];
    }
    return [progress, 'aod-stage', 'aod-animation', 1, 1, 1, 1, 1, 1, false, 'hold-aod'];
  }

  if (progress < stops.heroMotionEnd) {
    return [progress, 'hero-entered', 'hero', heroProgress, 0, 0, 0, 0, 0, false, 'hold-hero'];
  }
  if (progress < stops.heroPatternEnd) {
    return [
      progress, 'hero-to-pattern', 'hero', 1, 0, 0,
      heroPatternProgress, 0, 0, false, 'handoff-hero-pattern'
    ];
  }
  if (progress < stops.patternStarStart) {
    return [progress, 'pattern-complete', 'pattern', 1, patternProgress, 0, 1, 0, 0, false, 'hold-pattern'];
  }
  if (progress < stops.patternStarEnd) {
    return [
      progress, 'pattern-to-star-map', 'pattern', 1, 1, starProgress,
      1, patternStarProgress, 0, false, 'handoff-pattern-star'
    ];
  }
  if (progress < stops.starAodStart) {
    return [progress, 'star-map-reading', 'star-map', 1, 1, starProgress, 1, 1, 0, false, 'hold-star'];
  }
  if (progress < stops.starAodEnd) {
    return [
      progress, 'star-map-to-aod', 'star-map', 1, 1, starProgress,
      1, 1, starAodProgress, false, 'handoff-star-aod'
    ];
  }
  return [
    progress,
    progress >= stops.aodAutoplayStart ? 'aod-autoplay' : 'aod-stage',
    'aod-animation',
    1,
    1,
    starProgress,
    1,
    1,
    1,
    progress >= stops.aodAutoplayStart,
    'hold-aod'
  ];
}

/**
 * Positional transport for the independently minified timeline and lazy
 * stage chunks. Keep the named sample object out of the production boundary.
 */
export function phoneFrontRailSampleTuple(
  rawProgress: number,
  direction: -1 | 0 | 1,
  reducedMotion = false
): PhoneFrontRailSampleTuple {
  const frame = phoneStageFrame(rawProgress, reducedMotion);
  switch (frame[10]) {
    case 'handoff-hero-pattern':
      return [null, 'hero-pattern-scroll', direction, frame[6]];
    case 'handoff-pattern-star':
      return [null, 'pattern-star-scroll', direction, frame[7]];
    case 'handoff-star-aod':
      return [null, 'star-aod-scroll', direction, frame[8]];
    default:
      return [frame[2], null, direction, frame[0]];
  }
}

/** Converts front rail geometry into the one semantic sample the authority consumes. */
export function phoneFrontRailSample(
  rawProgress: number,
  direction: -1 | 0 | 1,
  reducedMotion = false
): PhoneFrontRailSample {
  const [scene, run, sampledDirection, progress] = phoneFrontRailSampleTuple(
    rawProgress,
    direction,
    reducedMotion
  );
  return {
    ...(scene === null ? {} : { scene }),
    ...(run === null ? {} : { run }),
    direction: sampledDirection,
    progress
  };
}

export function frontHalfCheckpointIndex(id: FrontHalfCheckpointId): number {
  return FRONT_HALF_CHECKPOINT_IDS.indexOf(id);
}

/**
 * AOD owns its media clock after the rail reaches the autoplay trigger.
 * Method becomes a semantic handoff only once its adapter has a non-zero
 * entrance value, keeping this timeline independent of AOD-local timing.
 */
export function phoneAodCheckpointForMethodProgress(methodProgress: number): FrontHalfCheckpointId {
  return clamp(methodProgress) > 0.001 ? 'aod-to-method' : 'aod-autoplay';
}

export function phoneAodCompletionCheckpoint(direction: 1 | -1): FrontHalfCheckpointId {
  return direction === 1 ? 'method-intro' : 'aod-stage';
}
