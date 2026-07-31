import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story/machine';
import { selectPhoneCinematicSnapshot } from './phone-story/runtime';
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

  it('[terminal/direct admission surface lease] keeps Method registered across renderer and loader revisions', () => {
    const registration = stageRuntimeSource.indexOf(
      "'native:method'"
    );
    const effectStart = stageRuntimeSource.lastIndexOf(
      '  useLayoutEffect(() => {',
      registration
    );
    const dependencyStart = stageRuntimeSource.indexOf(
      '\n  }, [',
      registration
    );
    const dependencyEnd = stageRuntimeSource.indexOf(']);', dependencyStart) + 3;
    const leaseEffect = stageRuntimeSource.slice(effectStart, dependencyEnd);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(dependencyStart).toBeGreaterThan(effectStart);
    // Renderer capabilities can rebind, but that must not dispose the
    // manifest receiver which owns an in-flight terminal/direct admission.
    // Loader readiness is unrelated to whether a mounted target leaf is
    // allowed to make its manifest receiver available to the machine.
    expect(leaseEffect).not.toContain('options.adapterRevision');
    expect(leaseEffect).not.toContain('options.enabled');
    expect(leaseEffect).toContain('options.methodRef.current?.root()');
    expect(leaseEffect).toContain(
      'options.methodRef.current?.presentPresentation?.(token, report);'
    );
  });
});
