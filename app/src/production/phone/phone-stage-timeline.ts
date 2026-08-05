import type { FrontHalfCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import type { PhoneScrollRunId } from './phone-story-runs';
import type { PhoneStageSceneId } from './types';

/**
 * These are geometry anchors only. Hero/Pattern animation time is owned by
 * the machine runner; the rail still needs the authored landing coordinates.
 */
export const PHONE_STAGE_STOPS = Object.freeze({
  patternMotionStart: 0.29,
  patternMotionEnd: 0.47,
  patternStarEnd: 0.61,
  starAodStart: 0.71,
  starAodEnd: 0.80
});

/** Browser-rounded Star↔AOD endpoints must not immediately re-sample a run. */
export const PHONE_STAGE_SETTLE_EPSILON = 0.0005;

/**
 * Small positional transport retained across the shell/lazy boundary. It
 * describes stable physical front surfaces plus the one remaining rail-owned
 * Star→AOD handoff; no Hero/Pattern Ink progress exists here anymore.
 */
export type PhoneStageFrame = readonly [
  progress: number,
  checkpoint: FrontHalfCheckpointId,
  navigationScene: PhoneStageSceneId,
  heroProgress: number,
  patternProgress: number,
  starProgress: number,
  starAodProgress: number
];

/** The only front-stage frame transport consumed by the live phone runtime. */
export type PhoneFrontSurfaceFrame = readonly [
  heroProgress: number,
  patternProgress: number,
  starProgress: number,
  starAodProgress: number
];

export type PhoneFrontRailSample = Readonly<{
  scene?: PhoneStageSceneId;
  run?: PhoneScrollRunId;
  progress: number;
  direction: -1 | 0 | 1;
}>;

/** Positional transport for independently minified shell and stage chunks. */
export type PhoneFrontRailSampleTuple = readonly [
  scene: PhoneStageSceneId | null,
  run: PhoneScrollRunId | null,
  direction: -1 | 0 | 1,
  progress: number,
  reducedMotion: boolean
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(Number.EPSILON, end - start));
}

function settledStarAodProgress(
  rawProgress: number,
  direction: -1 | 0 | 1
): number {
  const progress = clamp(rawProgress);
  const { starAodStart, starAodEnd } = PHONE_STAGE_STOPS;
  if (progress < starAodEnd && starAodEnd - progress <= PHONE_STAGE_SETTLE_EPSILON) {
    return starAodEnd;
  }
  return direction === -1
    && progress > starAodStart
    && progress - starAodStart <= PHONE_STAGE_SETTLE_EPSILON
    ? Math.max(0, starAodStart - PHONE_STAGE_SETTLE_EPSILON)
    : progress;
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

/**
 * Resolves only stable physical scene poses and Star→AOD's retained rail
 * frame. The optional motion argument is kept for lazy-call compatibility;
 * reduced motion selects the same static poses through a short transaction.
 */
export function phoneStageFrame(
  rawProgress: number,
  _reducedMotion = false
): PhoneStageFrame {
  const progress = clamp(rawProgress);
  const stops = PHONE_STAGE_STOPS;
  const [heroProgress, patternProgress, starProgress, starAodProgress] =
    phoneFrontSurfaceFrame(progress);
  if (progress >= stops.starAodEnd) {
    return [
      progress,
      'aod-stage',
      'aod-animation',
      heroProgress,
      patternProgress,
      starProgress,
      starAodProgress
    ];
  }
  if (progress >= stops.starAodStart) {
    return [
      progress,
      'star-map-to-aod',
      'star-map',
      heroProgress,
      patternProgress,
      starProgress,
      starAodProgress
    ];
  }
  if (progress >= stops.patternStarEnd) {
    return [
      progress,
      'star-map-reading',
      'star-map',
      heroProgress,
      patternProgress,
      starProgress,
      starAodProgress
    ];
  }
  if (progress >= stops.patternMotionEnd) {
    return [
      progress,
      'pattern-compact',
      'pattern',
      heroProgress,
      patternProgress,
      starProgress,
      starAodProgress
    ];
  }
  if (progress >= stops.patternMotionStart) {
    return [
      progress,
      'pattern-complete',
      'pattern',
      heroProgress,
      patternProgress,
      starProgress,
      starAodProgress
    ];
  }
  return [
    progress,
    'hero-entered',
    'hero',
    heroProgress,
    patternProgress,
    starProgress,
    starAodProgress
  ];
}

/**
 * Live rendering only needs stable front surfaces plus Star→AOD's retained
 * rail frame. Semantic checkpoint names stay in the v16 characterization
 * export above and do not cross into the production render hot path.
 */
export function phoneFrontSurfaceFrame(
  rawProgress: number
): PhoneFrontSurfaceFrame {
  const progress = clamp(rawProgress);
  const {
    patternMotionStart,
    patternMotionEnd,
    patternStarEnd,
    starAodStart,
    starAodEnd
  } =
    PHONE_STAGE_STOPS;
  return [
    progress < patternMotionStart ? 0 : 1,
    // Pattern remains expanded at the Hero→Pattern hold.  Its collapse is a
    // separate machine-owned leg ending at patternMotionEnd; projecting 1 at
    // the earlier hold makes the next collapse play twice.
    progress < patternMotionEnd ? 0 : 1,
    progress < patternStarEnd ? 0 : 1,
    progress < starAodStart ? 0 : range(progress, starAodStart, starAodEnd)
  ];
}

/**
 * The rail may publish Star→AOD only. Earlier front geometry is intentionally
 * opaque to the reducer so a coalesced Safari scroll cannot skip a machine
 * transaction or write an animation frame.
 */
export function phoneFrontRailSampleTuple(
  rawProgress: number,
  direction: -1 | 0 | 1,
  reducedMotion = false
): PhoneFrontRailSampleTuple {
  const progress = settledStarAodProgress(rawProgress, direction);
  const { starAodStart, starAodEnd } = PHONE_STAGE_STOPS;
  if (progress >= starAodStart && progress < starAodEnd) {
    return [
      null,
      'star-aod-scroll',
      direction,
      range(progress, starAodStart, starAodEnd),
      reducedMotion
    ];
  }
  if (progress >= starAodEnd) {
    return ['aod-animation', null, direction, progress, reducedMotion];
  }
  return [null, null, direction, progress, reducedMotion];
}

/** Converts geometry into the one semantic rail sample the authority consumes. */
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
