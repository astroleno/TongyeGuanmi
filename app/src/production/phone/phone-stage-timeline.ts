import {
  FRONT_HALF_CHECKPOINT_IDS,
  type FrontHalfCheckpointId
} from '../../story/semantic-checkpoints';
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

export type PhoneStageOwnership = Readonly<{
  key: string;
  visible: readonly PhoneStageSceneId[];
  stack: readonly PhoneStageSceneId[];
}>;

export type PhoneStageFrame = Readonly<{
  progress: number;
  checkpoint: FrontHalfCheckpointId;
  navigationScene: PhoneStageSceneId;
  heroProgress: number;
  patternProgress: number;
  starProgress: number;
  heroPatternProgress: number;
  patternStarProgress: number;
  starAodProgress: number;
  shouldStartAodAutoplay: boolean;
  ownership: PhoneStageOwnership;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
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
      return {
        progress, checkpoint: 'hero-entered', navigationScene: 'hero', heroProgress: 1,
        patternProgress: 0, starProgress: 0, heroPatternProgress: 0, patternStarProgress: 0,
        starAodProgress: 0, shouldStartAodAutoplay: false,
        ownership: { key: 'hold-hero', visible: ['hero'], stack: ['hero'] }
      };
    }
    if (progress < stops.patternStarEnd) {
      return {
        progress, checkpoint: 'pattern-complete', navigationScene: 'pattern', heroProgress: 1,
        patternProgress: 1, starProgress: 0, heroPatternProgress: 1, patternStarProgress: 0,
        starAodProgress: 0, shouldStartAodAutoplay: false,
        ownership: { key: 'hold-pattern', visible: ['pattern'], stack: ['pattern'] }
      };
    }
    if (progress < stops.starAodEnd) {
      return {
        progress, checkpoint: 'star-map-reading', navigationScene: 'star-map', heroProgress: 1,
        patternProgress: 1, starProgress: 1, heroPatternProgress: 1, patternStarProgress: 1,
        starAodProgress: 0, shouldStartAodAutoplay: false,
        ownership: { key: 'hold-star-map', visible: ['star-map'], stack: ['star-map'] }
      };
    }
    return {
      progress, checkpoint: 'aod-stage', navigationScene: 'aod-animation', heroProgress: 1,
      patternProgress: 1, starProgress: 1, heroPatternProgress: 1, patternStarProgress: 1,
      starAodProgress: 1, shouldStartAodAutoplay: false,
      ownership: { key: 'hold-aod', visible: ['aod-animation'], stack: ['aod-animation'] }
    };
  }

  if (progress < stops.heroMotionEnd) {
    return {
      progress, checkpoint: 'hero-entered', navigationScene: 'hero', heroProgress, patternProgress: 0,
      starProgress: 0, heroPatternProgress: 0, patternStarProgress: 0, starAodProgress: 0,
      shouldStartAodAutoplay: false,
      ownership: { key: 'hold-hero', visible: ['hero'], stack: ['hero'] }
    };
  }
  if (progress < stops.heroPatternEnd) {
    return {
      progress, checkpoint: 'hero-to-pattern', navigationScene: 'hero', heroProgress: 1, patternProgress: 0,
      starProgress: 0, heroPatternProgress, patternStarProgress: 0, starAodProgress: 0,
      shouldStartAodAutoplay: false,
      ownership: { key: 'handoff-hero-pattern', visible: ['hero', 'pattern'], stack: ['pattern', 'hero'] }
    };
  }
  if (progress < stops.patternStarStart) {
    return {
      progress, checkpoint: 'pattern-complete', navigationScene: 'pattern', heroProgress: 1,
      patternProgress, starProgress: 0, heroPatternProgress: 1, patternStarProgress: 0, starAodProgress: 0,
      shouldStartAodAutoplay: false,
      ownership: { key: 'hold-pattern', visible: ['pattern'], stack: ['pattern'] }
    };
  }
  if (progress < stops.patternStarEnd) {
    return {
      progress, checkpoint: 'pattern-to-star-map', navigationScene: 'pattern', heroProgress: 1,
      patternProgress: 1, starProgress, heroPatternProgress: 1, patternStarProgress, starAodProgress: 0,
      shouldStartAodAutoplay: false,
      ownership: { key: 'handoff-pattern-star-map', visible: ['pattern', 'star-map'], stack: ['star-map', 'pattern'] }
    };
  }
  if (progress < stops.starAodStart) {
    return {
      progress, checkpoint: 'star-map-reading', navigationScene: 'star-map', heroProgress: 1,
      patternProgress: 1, starProgress, heroPatternProgress: 1, patternStarProgress: 1, starAodProgress: 0,
      shouldStartAodAutoplay: false,
      ownership: { key: 'hold-star-map', visible: ['star-map'], stack: ['star-map'] }
    };
  }
  if (progress < stops.starAodEnd) {
    return {
      progress, checkpoint: 'star-map-to-aod', navigationScene: 'star-map', heroProgress: 1,
      patternProgress: 1, starProgress, heroPatternProgress: 1, patternStarProgress: 1, starAodProgress,
      shouldStartAodAutoplay: false,
      ownership: { key: 'handoff-star-map-aod', visible: ['star-map', 'aod-animation'], stack: ['star-map', 'aod-animation'] }
    };
  }
  return {
    progress,
    checkpoint: progress >= stops.aodAutoplayStart ? 'aod-autoplay' : 'aod-stage',
    navigationScene: 'aod-animation',
    heroProgress: 1,
    patternProgress: 1,
    starProgress,
    heroPatternProgress: 1,
    patternStarProgress: 1,
    starAodProgress: 1,
    shouldStartAodAutoplay: progress >= stops.aodAutoplayStart,
    ownership: { key: 'hold-aod', visible: ['aod-animation'], stack: ['aod-animation'] }
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
