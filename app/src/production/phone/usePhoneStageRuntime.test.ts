import { describe, expect, it } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story-state';
import { selectPhoneCinematicSnapshot } from './phone-story-runtime';
import { phoneSnapshotOwnsAod } from './usePhoneStageRuntime';

describe('phone stage AOD resource selection', () => {
  it('derives AOD ownership only from the immutable snapshot projection', () => {
    const aod = createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'aod-animation'
    });
    const running = reducePhoneStorySnapshot(aod, {
      type: 'RUN_STARTED',
      authorityId: 'a',
      sessionId: 'aod-method',
      generation: 1,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 400,
      inputEpoch: 1
    }).snapshot;

    expect(phoneSnapshotOwnsAod(selectPhoneCinematicSnapshot(aod))).toBe(true);
    expect(phoneSnapshotOwnsAod(selectPhoneCinematicSnapshot(running))).toBe(true);
    expect(phoneSnapshotOwnsAod(selectPhoneCinematicSnapshot(createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'method-top'
    })))).toBe(false);
    expect(phoneSnapshotOwnsAod(selectPhoneCinematicSnapshot(createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'figure2-animation'
    })))).toBe(false);
  });
});
