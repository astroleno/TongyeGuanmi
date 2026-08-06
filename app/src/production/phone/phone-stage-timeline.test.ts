import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_STAGE_SETTLE_EPSILON,
  PHONE_STAGE_STOPS,
  phoneDirectEntryCompletesAod,
  phoneFrontRailSample,
  phoneFrontRailSampleTuple,
  phoneStageFrame
} from './phone-stage-timeline';

const source = readFileSync(
  new URL('./phone-stage-timeline.ts', import.meta.url),
  'utf8'
);

describe('phone stage timeline', () => {
  it('keeps ordered geometry anchors for machine-owned front landings', () => {
    const stops = Object.values(PHONE_STAGE_STOPS);
    expect(stops).toEqual([...stops].sort((left, right) => left - right));
  });

  it('maps only stable poses and the retained Star→AOD handoff', () => {
    expect(phoneStageFrame(0).slice(1)).toEqual([
      'hero-entered', 'hero', 0, 0, 0, 0
    ]);
    expect(phoneStageFrame(PHONE_STAGE_STOPS.patternMotionStart).slice(1)).toEqual([
      'pattern-complete', 'pattern', 1, 0, 0, 0
    ]);
    expect(phoneStageFrame(PHONE_STAGE_STOPS.patternMotionEnd).slice(1)).toEqual([
      'pattern-compact', 'pattern', 1, 1, 0, 0
    ]);
    expect(phoneStageFrame(PHONE_STAGE_STOPS.patternStarEnd).slice(1)).toEqual([
      'star-map-reading', 'star-map', 1, 1, 1, 0
    ]);
    expect(phoneStageFrame(.755).slice(1)).toEqual([
      'star-map-to-aod', 'star-map', 1, 1, 1, .5
    ]);
    expect(phoneStageFrame(PHONE_STAGE_STOPS.starAodEnd).slice(1)).toEqual([
      'aod-stage', 'aod-animation', 1, 1, 1, 1
    ]);
  });

  it('uses the same physical static poses for reduced motion', () => {
    expect(phoneStageFrame(.3, true).slice(1)).toEqual([
      'pattern-complete', 'pattern', 1, 0, 0, 0
    ]);
    expect(phoneStageFrame(.9, true).slice(1)).toEqual([
      'aod-stage', 'aod-animation', 1, 1, 1, 1
    ]);
  });

  it('[front playback hard cutover] refuses to serialize Hero/Pattern scroll writers', () => {
    expect(source).not.toContain('heroPatternProgress');
    expect(source).not.toContain('patternStarProgress');
    expect(source).not.toContain('hero-pattern-scroll');
    expect(source).not.toContain('pattern-star-scroll');
    expect(phoneFrontRailSample(.205, 1)).toEqual({ progress: .205, direction: 1 });
    expect(phoneFrontRailSample(.54, -1)).toEqual({
      scene: 'star-map',
      progress: .54,
      direction: -1
    });
  });

  it('serializes only the retained Star→AOD rail run', () => {
    expect(phoneFrontRailSampleTuple(.755, -1, true)).toEqual([
      null,
      'star-aod-scroll',
      -1,
      .5,
      true
    ]);
    expect(phoneFrontRailSample(.755, -1)).toMatchObject({
      run: 'star-aod-scroll',
      direction: -1,
      progress: .5
    });
    expect(phoneFrontRailSample(PHONE_STAGE_STOPS.starAodEnd, 1)).toEqual({
      scene: 'aod-animation',
      direction: 1,
      progress: PHONE_STAGE_STOPS.starAodEnd
    });
  });

  it('snaps only browser-rounded Star→AOD endpoints', () => {
    const drift = .0002;
    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.starAodEnd - drift,
      1
    )).toEqual({
      scene: 'aod-animation',
      direction: 1,
      progress: PHONE_STAGE_STOPS.starAodEnd
    });
    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.starAodStart + drift,
      -1
    )).toEqual({
      scene: 'star-map',
      direction: -1,
      progress: PHONE_STAGE_STOPS.starAodStart - PHONE_STAGE_SETTLE_EPSILON
    });
  });

  it('[Star→AOD reverse cutover] publishes the Star Map endpoint for the static admission', () => {
    expect(phoneFrontRailSample(
      PHONE_STAGE_STOPS.starAodStart - .01,
      -1,
      true
    )).toEqual({
      scene: 'star-map',
      direction: -1,
      progress: PHONE_STAGE_STOPS.starAodStart - .01
    });
  });

  it('skips AOD autoplay for every downstream direct entry', () => {
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
});
