import { describe, expect, it } from 'vitest';
import { FRONT_HALF_CHECKPOINT_IDS } from '../../story/semantic-checkpoints';
import { PHONE_STAGE_STOPS, frontHalfCheckpointIndex, phoneStageFrame } from './phone-stage-timeline';

describe('phone stage timeline', () => {
  it('maps the accepted forward Route B stops to named checkpoints', () => {
    const trace = [
      phoneStageFrame(0).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.heroMotionEnd + 0.01).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.heroPatternEnd + 0.01).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarStart + 0.01).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.patternStarEnd + 0.01).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.starAodStart + 0.01).checkpoint,
      phoneStageFrame(PHONE_STAGE_STOPS.starAodEnd + 0.01).checkpoint,
      phoneStageFrame(1).checkpoint
    ];
    expect(trace).toEqual([
      'hero-entered',
      'hero-to-pattern',
      'pattern-complete',
      'pattern-to-star-map',
      'star-map-reading',
      'star-map-to-aod',
      'aod-stage',
      'aod-autoplay'
    ]);
  });

  it('has strictly ordered stage stops and preserves the reverse checkpoint ordering', () => {
    const stops = Object.values(PHONE_STAGE_STOPS);
    expect(stops).toEqual([...stops].sort((left, right) => left - right));
    const reverse = [1, 0.8, 0.7, 0.6, 0.5, 0.2, 0]
      .map((progress) => phoneStageFrame(progress).checkpoint)
      .map(frontHalfCheckpointIndex);
    expect(reverse).toEqual([...reverse].sort((left, right) => right - left));
    expect(frontHalfCheckpointIndex('method-intro')).toBe(FRONT_HALF_CHECKPOINT_IDS.length - 1);
  });

  it('uses static endpoints for reduced motion without changing semantic order', () => {
    expect(phoneStageFrame(0.3, true)).toMatchObject({
      checkpoint: 'pattern-complete',
      ownership: { visible: ['pattern'] }
    });
    expect(phoneStageFrame(0.9, true)).toMatchObject({
      checkpoint: 'aod-stage',
      ownership: { visible: ['aod-animation'] }
    });
  });
});
