import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRONT_HALF_CHECKPOINT_IDS } from '../../story/semantic-checkpoints';
import * as phoneStageTimeline from './phone-stage-timeline';
import {
  PHONE_STAGE_STOPS,
  PHONE_STAGE_SETTLE_EPSILON,
  frontHalfCheckpointIndex,
  phoneAodCheckpointForMethodProgress,
  phoneAodCompletionCheckpoint,
  phoneDirectEntryCompletesAod,
  phoneFrontRailSample,
  phoneFrontRailSampleTuple,
  phoneStageFrame
} from './phone-stage-timeline';

const stageTimelineSource = readFileSync(
  new URL('./phone-stage-timeline.ts', import.meta.url),
  'utf8'
);

describe('phone stage timeline', () => {
  it('maps the accepted forward Route B stops to named checkpoints', () => {
    const trace = [
      phoneStageFrame(0)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.heroMotionEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.heroPatternEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarStart + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.starAodStart + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.starAodEnd + 0.01)[1],
      phoneStageFrame(1)[1],
      phoneAodCheckpointForMethodProgress(0)
    ];
    expect(trace).toEqual([
      'hero-entered',
      'hero-to-pattern',
      'pattern-complete',
      'pattern-to-star-map',
      'star-map-reading',
      'star-map-to-aod',
      'aod-stage',
      'aod-stage',
      'aod-autoplay'
    ]);
  });

  it('has strictly ordered stage stops and preserves the reverse checkpoint ordering', () => {
    const stops = Object.values(PHONE_STAGE_STOPS);
    expect(stops).toEqual([...stops].sort((left, right) => left - right));
    const reverse = [1, 0.8, 0.7, 0.6, 0.5, 0.2, 0]
      .map((progress) => phoneStageFrame(progress)[1])
      .map(frontHalfCheckpointIndex);
    expect(reverse).toEqual([...reverse].sort((left, right) => right - left));
    expect(frontHalfCheckpointIndex('method-intro')).toBe(FRONT_HALF_CHECKPOINT_IDS.length - 1);
  });

  it('uses static endpoints for reduced motion without changing semantic order', () => {
    expect(phoneStageFrame(0.3, true).slice(1, 3)).toEqual([
      'pattern-complete',
      'pattern'
    ]);
    expect(phoneStageFrame(0.3, true)[9]).toBe('hold-pattern');
    expect(phoneStageFrame(0.9, true).slice(1, 3)).toEqual([
      'aod-stage',
      'aod-animation'
    ]);
    expect(phoneStageFrame(0.9, true)[9]).toBe('hold-aod');
    expect(phoneFrontRailSample(
      (PHONE_STAGE_STOPS.heroMotionEnd + PHONE_STAGE_STOPS.heroPatternEnd) / 2,
      1,
      true
    )).toEqual({
      scene: 'hero',
      progress: (PHONE_STAGE_STOPS.heroMotionEnd + PHONE_STAGE_STOPS.heroPatternEnd) / 2,
      direction: 1
    });
  });

  it('[Pattern↔StarMap reduced cutover] carries motion strategy only through the positional rail sample', () => {
    expect(phoneFrontRailSampleTuple(
      PHONE_STAGE_STOPS.patternStarEnd,
      1,
      true
    )).toEqual([
      'star-map',
      null,
      1,
      PHONE_STAGE_STOPS.patternStarEnd,
      true
    ]);
    expect(phoneFrontRailSampleTuple(
      PHONE_STAGE_STOPS.patternStarStart,
      -1,
      false
    ).at(-1)).toBe(false);
  });

  it('skips AOD autoplay for every Grade A and continuation direct entry', () => {
    for (const scene of [
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
    ] as const) {
      expect(phoneDirectEntryCompletesAod(scene)).toBe(true);
    }
    expect(phoneDirectEntryCompletesAod('aod-animation')).toBe(false);
    expect(phoneDirectEntryCompletesAod('method-top')).toBe(false);
    expect(phoneDirectEntryCompletesAod(undefined)).toBe(false);
  });

  it('publishes AOD media-clock and Method checkpoints outside the scroll rail', () => {
    expect(phoneAodCheckpointForMethodProgress(0)).toBe('aod-autoplay');
    expect(phoneAodCheckpointForMethodProgress(0.001)).toBe('aod-autoplay');
    expect(phoneAodCheckpointForMethodProgress(0.002)).toBe('aod-to-method');
    expect(phoneAodCompletionCheckpoint(1)).toBe('method-intro');
    expect(phoneAodCompletionCheckpoint(-1)).toBe('aod-stage');
  });

  it('[AOD first-intent cutover] keeps every post-AOD rail sample as a source hold', () => {
    expect(stageTimelineSource).not.toContain('aodAutoplayStart');
    expect(phoneStageFrame(PHONE_STAGE_STOPS.starAodEnd)[1]).toBe('aod-stage');
    expect(phoneStageFrame(1)[1]).toBe('aod-stage');
  });

  it('[Task 4] maps one front-rail geometry sample to a hold or one scroll run', () => {
    const heroPattern = phoneFrontRailSample(
      (PHONE_STAGE_STOPS.heroMotionEnd + PHONE_STAGE_STOPS.heroPatternEnd) / 2,
      1
    );
    expect(heroPattern).toMatchObject({
      run: 'hero-pattern-scroll',
      direction: 1
    });
    expect(heroPattern.progress).toBeCloseTo(0.5);
    expect(phoneFrontRailSample(PHONE_STAGE_STOPS.patternMotionStart + 0.01, 1))
      .toEqual({ scene: 'pattern', progress: PHONE_STAGE_STOPS.patternMotionStart + 0.01, direction: 1 });
    const starAod = phoneFrontRailSample(
      (PHONE_STAGE_STOPS.starAodStart + PHONE_STAGE_STOPS.starAodEnd) / 2,
      -1
    );
    expect(starAod).toMatchObject({
      run: 'star-aod-scroll',
      direction: -1
    });
    expect(starAod.progress).toBeCloseTo(0.5);
  });

  it('settles browser-rounded handoff endpoints into their stable presentation holds', () => {
    const endpointDrift = 0.0002;

    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.patternStarEnd - endpointDrift,
      1
    )).toEqual({
      scene: 'star-map',
      progress: PHONE_STAGE_STOPS.patternStarEnd,
      direction: 1
    });
    // A direct-entry alignment can move the physical scroll coordinate back
    // by a fraction of a pixel after the forward transition commits.
    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.patternStarEnd - endpointDrift,
      -1
    )).toEqual({
      scene: 'star-map',
      progress: PHONE_STAGE_STOPS.patternStarEnd,
      direction: -1
    });
    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.patternStarStart + endpointDrift,
      -1
    )).toEqual({
      scene: 'pattern',
      progress: PHONE_STAGE_STOPS.patternStarStart - PHONE_STAGE_SETTLE_EPSILON,
      direction: -1
    });
  });

  it('serializes front-rail samples positionally across lazy chunk boundaries', () => {
    const positionalSample = Reflect.get(
      phoneStageTimeline,
      'phoneFrontRailSampleTuple'
    ) as unknown;
    expect(positionalSample).toBeTypeOf('function');
    if (typeof positionalSample !== 'function') return;

    const heroPattern = positionalSample(
      (PHONE_STAGE_STOPS.heroMotionEnd + PHONE_STAGE_STOPS.heroPatternEnd) / 2,
      1
    ) as readonly unknown[];
    expect(heroPattern.slice(0, 3)).toEqual([null, 'hero-pattern-scroll', 1]);
    expect(heroPattern[3]).toBeCloseTo(0.5);

    const pattern = positionalSample(
      PHONE_STAGE_STOPS.patternMotionStart + 0.01,
      -1
    ) as readonly unknown[];
    expect(pattern.slice(0, 3)).toEqual(['pattern', null, -1]);
    expect(pattern[3]).toBeCloseTo(PHONE_STAGE_STOPS.patternMotionStart + 0.01);
  });

  it('completes the full named front-half trace without relying on scroll after AOD starts', () => {
    const trace = [
      'loader',
      phoneStageFrame(0)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.heroMotionEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.heroPatternEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarStart + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarEnd + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.starAodStart + 0.01)[1],
      phoneStageFrame(PHONE_STAGE_STOPS.starAodEnd + 0.01)[1],
      phoneAodCheckpointForMethodProgress(0),
      phoneAodCheckpointForMethodProgress(0.5),
      phoneAodCompletionCheckpoint(1)
    ];
    expect(trace).toEqual(FRONT_HALF_CHECKPOINT_IDS);
  });
});
