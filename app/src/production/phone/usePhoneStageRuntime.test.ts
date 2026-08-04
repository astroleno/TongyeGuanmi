import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story/machine';
import { selectPhoneCinematicSnapshot } from './phone-story/runtime';
import {
  phoneSnapshotOwnsAod,
  phoneSnapshotOwnsMethod
} from './usePhoneStageRuntime';

const stageRuntimeSource = readFileSync(
  new URL('./usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);
const aodLeafSource = readFileSync(
  new URL('./scenes/PhoneAod.tsx', import.meta.url),
  'utf8'
);

describe('phone stage AOD resource selection', () => {
  it('[front playback hard cutover] keeps front animation clocks in one machine capability, not sampled scroll progress', () => {
    expect(stageRuntimeSource).toContain('registerPhoneRuntimeFrontStageCapability(');
    expect(stageRuntimeSource).not.toContain("'hero-pattern-scroll'");
    expect(stageRuntimeSource).not.toContain("'pattern-star-scroll'");
    expect(stageRuntimeSource).not.toContain('phoneStageFrame(stageProgress, options.reducedMotion)');
  });

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

  it('[AOD first-intent cutover] does not activate Method leaf effects before its authored cue', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'aod-method-cue-authority',
      scene: 'aod-animation'
    });
    const prepared = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'aod-method-cue-session',
      generation: 1,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 800,
      inputEpoch: 1
    }).snapshot;
    expect(phoneSnapshotOwnsMethod(
      selectPhoneCinematicSnapshot(prepared),
      (progress) => Math.max(0, (progress - .8) / .2)
    )).toBe(false);

    if (prepared.status !== 'transaction') {
      throw new Error('Expected an AOD transaction');
    }
    const session = prepared.session;
    const proof = {
      token: {
        authorityId: prepared.authorityId,
        sessionId: session.sessionId,
        generation: session.generation,
        leg: session.operation.legIndex,
        revision: session.presentationRevision,
        subject: 'front:aod',
        kind: 'packed-canvas-frame' as const
      },
      frameSequence: 1,
      observedAt: 10,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: 'method' as const
    };
    const playConfirmed = reducePhoneStorySnapshot(prepared, {
      type: 'AOD_PLAY_CONFIRMED',
      authorityId: prepared.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction
    }).snapshot;
    const animating = reducePhoneStorySnapshot(playConfirmed, {
      type: 'AOD_FIRST_FRAME_PRESENTED',
      authorityId: prepared.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction,
      proof
    }).snapshot;
    if (animating.status !== 'transaction') {
      throw new Error('Expected an animating AOD transaction');
    }
    const running = animating.session;
    const beforeCue = reducePhoneStorySnapshot(animating, {
      type: 'AOD_PROGRESS_OBSERVED',
      authorityId: animating.authorityId,
      sessionId: running.sessionId,
      generation: running.generation,
      leg: running.operation.legIndex,
      direction: running.operation.direction,
      progress: .8
    }).snapshot;
    expect(phoneSnapshotOwnsMethod(
      selectPhoneCinematicSnapshot(beforeCue),
      (progress) => Math.max(0, (progress - .8) / .2)
    )).toBe(false);

    if (beforeCue.status !== 'transaction') {
      throw new Error('Expected an AOD transaction at its cue');
    }
    const cue = beforeCue.session;
    const afterCue = reducePhoneStorySnapshot(beforeCue, {
      type: 'AOD_PROGRESS_OBSERVED',
      authorityId: beforeCue.authorityId,
      sessionId: cue.sessionId,
      generation: cue.generation,
      leg: cue.operation.legIndex,
      direction: cue.operation.direction,
      progress: .81
    }).snapshot;
    expect(phoneSnapshotOwnsMethod(
      selectPhoneCinematicSnapshot(afterCue),
      (progress) => Math.max(0, (progress - .8) / .2)
    )).toBe(true);
  });

  it('[terminal/direct admission surface lease] keeps Method registered across renderer and loader revisions', () => {
    const registration = stageRuntimeSource.indexOf(
      "registerPhoneRuntimeSurface(\n        options.orchestrator,\n        'native:method'"
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

  it('[Method↔AOD admission lease] keeps the front boundary and AOD runner out of renderer rebinds', () => {
    const frontRailRegistration = stageRuntimeSource.indexOf(
      "'front-rail'"
    );
    const effectStart = stageRuntimeSource.lastIndexOf(
      '  useLayoutEffect(() => {',
      frontRailRegistration
    );
    const dependencyStart = stageRuntimeSource.indexOf(
      '\n  }, [',
      frontRailRegistration
    );
    const dependencyEnd = stageRuntimeSource.indexOf(']);', dependencyStart) + 3;
    const admissionEffect = stageRuntimeSource.slice(effectStart, dependencyEnd);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(admissionEffect).toContain('registerPhoneRuntimeSampledScrollCorridor(');
    expect(admissionEffect).toContain('registerPhoneRuntimeAodCapability(');
    // A leaf handle can temporarily disappear while React rebinds a renderer.
    // That must never remove the Method → AOD input boundary or its one runner.
    expect(admissionEffect).not.toContain('options.adapterRevision');
  });

  it('[AOD first-intent cutover] derives its geometry boundary from the stable semantic edge', () => {
    expect(stageRuntimeSource).not.toContain('aodAutoplayStart');
    expect(stageRuntimeSource.match(/stagePosition\(PHONE_STAGE_STOPS\.starAodEnd\)/g))
      .toHaveLength(1);
    expect(stageRuntimeSource).toContain('const aodSemanticPosition = () =>');
    expect(stageRuntimeSource).toContain(
      'window.scrollY + method.getBoundingClientRect().top'
    );
  });

  it('[AOD first-intent cutover] admits playback through the one runner bridge', () => {
    expect(stageRuntimeSource.match(/aodAdapter\.startAutoplay\(/g)).toHaveLength(1);
    expect(aodLeafSource).not.toMatch(/\n\s*enter\(\)\s*\{/);
    expect(aodLeafSource).not.toMatch(/\n\s*leave\(\)\s*\{/);
    expect(aodLeafSource).not.toMatch(/\n\s*reverse\(\)\s*\{/);
  });

  it('[P0 AOD session ownership] starts only from the current runtime transaction and has no gesture-lease retry writer', () => {
    const registration = stageRuntimeSource.slice(
      stageRuntimeSource.indexOf('registerPhoneRuntimeAodCapability('),
      stageRuntimeSource.indexOf('progressHandlerRef.current = observeAodMediaProgress;')
    );

    expect(registration).not.toContain('snapshotRef.current');
    expect(stageRuntimeSource).not.toContain('attachPhoneMediaGestureLease');
    expect(stageRuntimeSource).not.toContain('retryAodFromGesture');
  });
});
