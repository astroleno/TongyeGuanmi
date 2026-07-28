import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story-state';
import { selectPhoneCinematicSnapshot } from './phone-story-runtime';
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

  it('uses its captured session callbacks instead of raw cross-chunk AOD events', () => {
    expect(stageRuntimeSource).toContain('aodAdapter.startAutoplay(direction, identity)');
    expect(stageRuntimeSource).toContain('identity !== activeAodIdentity');
    expect(stageRuntimeSource).toContain('session[6](progress)');
    expect(stageRuntimeSource).toContain("session[9]('receiver')");
    expect(stageRuntimeSource).toContain('session[10]();');
    expect(stageRuntimeSource).not.toContain("type: 'PROGRESS_REPORTED'");
    expect(stageRuntimeSource).not.toContain('identityForAod(snapshotRef.current, direction)');
  });

  it('retries a prepared AOD operation after React receives its immutable transaction snapshot', () => {
    expect(stageRuntimeSource).toContain(
      'syncPhoneRuntimeDiagnostics(options.orchestrator)'
    );
  });
});
