import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story-state';
import { phoneSnapshotOwnsAod } from './usePhoneStageRuntime';

const stageRuntimeSource = readFileSync(
  new URL('./usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);

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

    expect(phoneSnapshotOwnsAod(aod)).toBe(true);
    expect(phoneSnapshotOwnsAod(running)).toBe(true);
    expect(phoneSnapshotOwnsAod(createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'method-top'
    }))).toBe(false);
    expect(phoneSnapshotOwnsAod(createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'figure2-animation'
    }))).toBe(false);
  });

  it('captures an AOD execution identity at start instead of retagging late media callbacks', () => {
    expect(stageRuntimeSource).toContain('aodAdapter.startAutoplay(direction, identity)');
    expect(stageRuntimeSource).toContain('const completeAod = (identity: PhoneExecutionIdentity)');
    expect(stageRuntimeSource).not.toContain('identityForAod(snapshotRef.current, direction)');
  });
});
