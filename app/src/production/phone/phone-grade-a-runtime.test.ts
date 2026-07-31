import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneGradeARunner,
  phoneGradeABoundaryProgress,
  phoneGradeARunForBoundary,
  type PhoneGradeABoundaryCapability
} from './phone-grade-a-runtime';
import type {
  PhoneOrchestratedRunSession,
  PhoneRunCapability,
  PhoneStoryRuntimeEngine as PhoneStoryOrchestrator
} from './phone-story/runtime/engine';
import type { PhoneRunId } from './phone-story-runs';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneStorySnapshot,
  type PresentationToken
} from './phone-story/machine';
import type {
  PhonePresentationAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

function element(): HTMLElement {
  return { dataset: {} } as HTMLElement;
}

const gradeAExecutionToken = [
  'phone-authority-grade-a',
  'phone-session-grade-a',
  9,
  0,
  1
] as const;

function transition(
  prepare = vi.fn(async () => undefined)
): PhoneTransitionAdapterHandle {
  let onPresentedFrame: (() => void) | undefined;
  return {
    begin: vi.fn((_request, reportFrame) => {
      onPresentedFrame = reportFrame;
    }),
    prepareFirstFrame: vi.fn(() => onPresentedFrame?.()),
    prepare,
    render: vi.fn(),
    commitEndpoint: vi.fn(),
    releaseEndpoint: vi.fn(),
    enter: vi.fn(),
    reverse: vi.fn()
  };
}

function session(onCommit?: () => void, onAbort?: () => void) {
  const active = { value: true };
  let release: Parameters<PhoneOrchestratedRunSession['provideRelease']>[0] | undefined;
  const value: PhoneOrchestratedRunSession = {
    authorityId: 'phone-authority-grade-a',
    sessionId: 'phone-session-grade-a',
    generation: 9,
    leg: 0,
    direction: 1,
    valid: () => active.value,
    reportRenderedFrame: vi.fn(() => true),
    reportPresentationFrame: vi.fn(() => true),
    reportPresentationProof: vi.fn(),
    reportPresentationReadiness: vi.fn(),
    presentationProofToken: vi.fn((kind, subject) => ({
      authorityId: 'phone-authority-grade-a',
      sessionId: 'phone-session-grade-a',
      generation: 9,
      leg: 0,
      revision: 1,
      subject,
      kind
    })),
    presentationFrameToken: vi.fn((kind, subject) => ({
      authorityId: 'phone-authority-grade-a',
      sessionId: 'phone-session-grade-a',
      generation: 9,
      leg: 0,
      revision: 1,
      subject,
      kind
    })),
    requestReducedTargetLayout: vi.fn(() => true),
    reportProgress: vi.fn(),
    animate: vi.fn((start, end, durationMs, render, complete) => {
      let startedAt = -1;
      const tick = (now: number) => {
        if (!active.value) return;
        if (startedAt < 0) startedAt = now;
        const unit = Math.min(
          1,
          Math.max(0, (now - startedAt) / (durationMs ?? 600))
        );
        render(start + (end - start) * unit);
        if (unit >= 1) complete();
        else window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    }),
    reportEndpoints: vi.fn(),
    reportEndpointCommit: vi.fn(),
    reportTargetPresented: vi.fn(),
    reportPresentationCommitted: vi.fn(),
    reportEndpointRelease: vi.fn(),
    provideRelease: vi.fn((nextRelease) => { release = nextRelease; }),
    reportAnimationComplete: vi.fn(),
    reportFailure: vi.fn(() => {
      onAbort?.();
      active.value = false;
    })
  };
  return Object.assign(value, {
    flushRelease() {
      onCommit?.();
      active.value = false;
      release?.releaseGeometry();
      release?.releaseResources();
    }
  });
}

function orchestratorCapabilities() {
  const capabilities = new Map<PhoneRunId, PhoneRunCapability>();
  const orchestrator = {
    registerRunCapability(
      run: PhoneRunId,
      _ownerId: string,
      capability: PhoneRunCapability
    ) {
      capabilities.set(run, capability);
      return { dispose: vi.fn() };
    }
  } as unknown as PhoneStoryOrchestrator;
  return { orchestrator, capabilities };
}

function installControlledClock() {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id))
  });
  return {
    flush(now: number) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    }
  };
}

function boundary(
  id: 0 | 1 | 2,
  adapter: PhoneTransitionAdapterHandle,
  from: HTMLElement,
  to: HTMLElement
): PhoneGradeABoundaryCapability {
  return {
    id,
    ready: () => true,
    position: (direction) => direction === 1 ? 100 + id : 200 + id,
    transition: () => adapter,
    from: () => from,
    to: () => to
  };
}

function snapshot(scene: 'method-top' | 'figure2-animation' | 'figure2-proof' | 'brand') {
  return createPhoneStorySnapshot({
    authorityId: 'phone-authority-grade-a',
    scene
  });
}

function runSnapshot(
  scene: 'method-top' | 'figure2-animation' | 'figure2-proof' | 'brand',
  run: PhoneRunId,
  direction: 1 | -1
): PhoneStorySnapshot {
  return reducePhoneStorySnapshot(snapshot(scene), {
    type: 'RUN_STARTED',
    authorityId: 'phone-authority-grade-a',
    sessionId: `phone-session-${run}`,
    generation: 1,
    leg: 0,
    direction,
    run,
    anchorY: 0,
    inputEpoch: 1
  }).snapshot;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('canonical Grade A runtime projection', () => {
  it('maps each authored boundary to one canonical run', () => {
    expect(phoneGradeARunForBoundary(0)).toBe('method-figure2');
    expect(phoneGradeARunForBoundary(1)).toBe('figure2-proof');
    expect(phoneGradeARunForBoundary(2)).toBe('proof-brand');
  });

  it('derives stable endpoints from the canonical hold without completion latches', () => {
    const method = snapshot('method-top');
    const figure2 = snapshot('figure2-animation');
    const proof = snapshot('figure2-proof');
    const brand = snapshot('brand');

    expect([0, 1, 2].map((id) => (
      phoneGradeABoundaryProgress(method, id as 0 | 1 | 2)
    ))).toEqual([0, 0, 0]);
    expect([0, 1, 2].map((id) => (
      phoneGradeABoundaryProgress(figure2, id as 0 | 1 | 2)
    ))).toEqual([1, 0, 0]);
    expect([0, 1, 2].map((id) => (
      phoneGradeABoundaryProgress(proof, id as 0 | 1 | 2)
    ))).toEqual([1, 1, 0]);
    expect([0, 1, 2].map((id) => (
      phoneGradeABoundaryProgress(brand, id as 0 | 1 | 2)
    ))).toEqual([1, 1, 1]);
  });

  it('uses canonical forward progress unchanged during a timed run', () => {
    const run = runSnapshot('figure2-animation', 'figure2-proof', 1);
    expect(phoneGradeABoundaryProgress(run, 1)).toBe(0);
  });

  it('uses canonical reverse progress unchanged during a timed run', () => {
    const run = runSnapshot('figure2-proof', 'figure2-proof', -1);
    expect(phoneGradeABoundaryProgress(run, 1)).toBe(1);
  });
});

describe('canonical Grade A run lifecycle', () => {
  it('[Proof↔Brand reduced cutover] advertises the reduced strategy for all three explicitly migrated Grade A boundaries', () => {
    const registered = orchestratorCapabilities();
    const adapter = transition();
    const staticTarget = {
      presentPresentation: vi.fn(),
      disposePresentation: vi.fn()
    };
    const migratedBoundary = (id: 0 | 1 | 2): PhoneGradeABoundaryCapability => ({
      ...boundary(id, adapter, element(), element()),
      reducedStaticTarget: () => staticTarget,
      reducedStaticSubject: (direction: 1 | -1) => {
        if (id === 0) return direction === 1
          ? 'grade-a:figure2'
          : 'native:method';
        if (id === 1) return direction === 1
          ? 'grade-a:proof'
          : 'grade-a:figure2';
        return direction === 1 ? 'native:brand' : 'grade-a:proof';
      }
    });
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [
        migratedBoundary(0),
        migratedBoundary(1),
        migratedBoundary(2)
      ],
      reducedMotion: true,
      timeoutMs: 1_000
    });

    expect(registered.capabilities.get('method-figure2')?.reducedMotion).toBe(true);
    expect(registered.capabilities.get('figure2-proof')?.reducedMotion).toBe(true);
    expect(registered.capabilities.get('proof-brand')?.reducedMotion).toBe(true);
  });

  it.each([
    [1, 1, 'grade-a:proof'],
    [1, -1, 'grade-a:figure2'],
    [2, 1, 'native:brand'],
    [2, -1, 'grade-a:proof']
  ] as const)(
    '[Grade A reduced cutovers] boundary %s forwards the exact %s target leaf frame without any generic proof or playback',
    async (id, direction, subject) => {
    const registered = orchestratorCapabilities();
    const adapter = transition();
    let boundToken: PresentationToken | null = null;
    let report: ((frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void) | null = null;
    const staticTarget = {
      presentPresentation: vi.fn((token: PresentationToken, nextReport: typeof report) => {
        boundToken = token;
        report = nextReport;
      }),
      disposePresentation: vi.fn()
    };
    const staticBoundary = {
      ...boundary(id, adapter, element(), element()),
      reducedTargetPosition: () => 188 + id,
      reducedStaticTarget: () => staticTarget,
      reducedStaticSubject: () => subject
    } as PhoneGradeABoundaryCapability;
    const runner = createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [staticBoundary],
      reducedMotion: true,
      timeoutMs: 1_000
    });
    const activeSession = session();

    expect(
      registered.capabilities.get(phoneGradeARunForBoundary(id))?.start(direction, activeSession)
    ).toBe(true);
    await Promise.resolve();

    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledWith(188 + id);
    expect(staticTarget.presentPresentation).toHaveBeenCalledOnce();
    expect(boundToken).toMatchObject({
      authorityId: 'phone-authority-grade-a',
      sessionId: 'phone-session-grade-a',
      generation: 9,
      leg: 0,
      revision: 1,
      subject,
      kind: 'static-poster'
    });
    expect(activeSession.reportRenderedFrame).not.toHaveBeenCalled();
    expect(activeSession.presentationProofToken).not.toHaveBeenCalled();
    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(activeSession.animate).not.toHaveBeenCalled();
    expect(activeSession.reportEndpointCommit).not.toHaveBeenCalled();
    expect(activeSession.reportAnimationComplete).not.toHaveBeenCalled();

    if (!boundToken || !report) {
      throw new Error('Expected the reduced Proof/Figure2 target leaf to receive one token-bound callback');
    }
    const acceptedToken = boundToken as PresentationToken;
    const acceptedReport = report as unknown as (frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void;
    acceptedReport({
      token: { ...acceptedToken },
      frameSequence: 1,
      observedAt: 41,
      origin: 'leaf-static-poster'
    });
    expect(activeSession.reportPresentationFrame).not.toHaveBeenCalled();
    acceptedReport({
      token: acceptedToken,
      frameSequence: 2,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith({
      token: acceptedToken,
      frameSequence: 2,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });

    runner.dispose();
    expect(staticTarget.disposePresentation).toHaveBeenCalledWith(acceptedToken);
  });

  it('[Proof↔Brand reduced cutover] retires the released Brand callback before a fresh admission starts', async () => {
    type StaticLeafReport = Parameters<
      PhonePresentationAdapterHandle['presentPresentation']
    >[1];
    const registered = orchestratorCapabilities();
    const adapter = transition();
    const bindings: Array<Readonly<{
      token: PresentationToken;
      report: StaticLeafReport;
    }>> = [];
    const staticTarget = {
      presentPresentation: vi.fn((token: PresentationToken, report: StaticLeafReport) => {
        bindings.push({ token, report });
      }),
      disposePresentation: vi.fn()
    };
    const runner = createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [{
        ...boundary(2, adapter, element(), element()),
        reducedTargetPosition: () => 190,
        reducedStaticTarget: () => staticTarget,
        reducedStaticSubject: () => 'native:brand'
      }],
      reducedMotion: true,
      timeoutMs: 1_000
    });
    const firstSession = session();
    const capability = registered.capabilities.get('proof-brand');

    expect(capability?.start(1, firstSession)).toBe(true);
    await Promise.resolve();
    const firstBinding = bindings[0];
    if (!firstBinding) throw new Error('Expected first Brand static binding');

    firstSession.flushRelease();
    expect(staticTarget.disposePresentation).toHaveBeenCalledWith(
      firstBinding.token
    );
    firstBinding.report({
      token: firstBinding.token,
      frameSequence: 1,
      observedAt: 61,
      origin: 'leaf-static-poster'
    });
    expect(firstSession.reportPresentationFrame).not.toHaveBeenCalled();

    const nextSession = session();
    expect(capability?.start(1, nextSession)).toBe(true);
    await Promise.resolve();
    const nextBinding = bindings[1];
    if (!nextBinding) throw new Error('Expected fresh Brand static binding');
    expect(nextBinding.token).not.toBe(firstBinding.token);

    firstBinding.report({
      token: firstBinding.token,
      frameSequence: 2,
      observedAt: 62,
      origin: 'leaf-static-poster'
    });
    expect(nextSession.reportPresentationFrame).not.toHaveBeenCalled();

    nextBinding.report({
      token: nextBinding.token,
      frameSequence: 1,
      observedAt: 63,
      origin: 'leaf-static-poster'
    });
    expect(nextSession.reportPresentationFrame).toHaveBeenCalledWith({
      token: nextBinding.token,
      frameSequence: 1,
      observedAt: 63,
      origin: 'leaf-static-poster'
    });

    runner.dispose();
  });

  it('[Method↔Figure2 reduced cutover] forwards the immutable Figure2 static leaf frame without a synthetic proof or playback', async () => {
    const registered = orchestratorCapabilities();
    const adapter = transition();
    let boundToken: PresentationToken | null = null;
    let report: ((frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void) | null = null;
    const staticTarget = {
      presentPresentation: vi.fn((token: PresentationToken, nextReport: typeof report) => {
        boundToken = token;
        report = nextReport;
      }),
      disposePresentation: vi.fn()
    };
    const staticBoundary = {
      ...boundary(0, adapter, element(), element()),
      reducedTargetPosition: () => 144,
      reducedStaticTarget: () => staticTarget,
      reducedStaticSubject: (direction: 1 | -1) => (
        direction === 1 ? 'grade-a:figure2' : 'native:method'
      )
    } as PhoneGradeABoundaryCapability;
    const runner = createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [staticBoundary],
      reducedMotion: true,
      timeoutMs: 1_000
    });
    const activeSession = session();

    expect(
      registered.capabilities.get('method-figure2')?.start(1, activeSession)
    ).toBe(true);
    await Promise.resolve();

    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledWith(144);
    expect(staticTarget.presentPresentation).toHaveBeenCalledOnce();
    expect(boundToken).toEqual({
      authorityId: 'phone-authority-grade-a',
      sessionId: 'phone-session-grade-a',
      generation: 9,
      leg: 0,
      revision: 1,
      subject: 'grade-a:figure2',
      kind: 'static-poster'
    });
    expect(activeSession.reportRenderedFrame).not.toHaveBeenCalled();
    expect(activeSession.presentationProofToken).not.toHaveBeenCalled();
    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(activeSession.animate).not.toHaveBeenCalled();
    expect(activeSession.reportEndpointCommit).not.toHaveBeenCalled();
    expect(activeSession.reportAnimationComplete).not.toHaveBeenCalled();

    if (!boundToken || !report) {
      throw new Error('Expected the reduced Figure2 target leaf to receive one token-bound callback');
    }
    // Vitest invokes the leaf callback through the runner, which TypeScript's
    // synchronous control-flow analysis cannot observe across this mock.
    const acceptedToken = boundToken as PresentationToken;
    const acceptedReport = report as unknown as (frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void;
    acceptedReport({
      token: { ...acceptedToken },
      frameSequence: 1,
      observedAt: 41,
      origin: 'leaf-static-poster'
    });
    expect(activeSession.reportPresentationFrame).not.toHaveBeenCalled();

    acceptedReport({
      token: acceptedToken,
      frameSequence: 2,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith({
      token: acceptedToken,
      frameSequence: 2,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });

    runner.dispose();
    expect(staticTarget.disposePresentation).toHaveBeenCalledWith(acceptedToken);
  });

  it('prepares and commits a forward boundary under the orchestrator session', async () => {
    const clock = installControlledClock();
    const from = element();
    const to = element();
    const adapter = transition();
    const registered = orchestratorCapabilities();
    const lifecycle: string[] = [];
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [boundary(2, adapter, from, to)],
      reducedMotion: true,
      timeoutMs: 1000
    });
    const activeSession = session(() => lifecycle.push('commit'));

    expect(
      registered.capabilities.get('proof-brand')?.start(1, activeSession)
    ).toBe(true);
    await vi.waitFor(() => expect(adapter.enter).toHaveBeenCalledTimes(1));
    clock.flush(0);
    clock.flush(600);
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(adapter.begin).toHaveBeenCalledWith(
      gradeAExecutionToken,
      expect.any(Function)
    );
    expect(adapter.prepare).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(adapter.enter).toHaveBeenCalledTimes(1);
    expect(adapter.commitEndpoint).toHaveBeenNthCalledWith(1, 0);
    expect(adapter.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.reportRenderedFrame).toHaveBeenCalledTimes(1);
    expect(activeSession.reportProgress).toHaveBeenLastCalledWith(1);
    expect(activeSession).not.toHaveProperty('moveTo');
    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
    expect(activeSession.reportEndpoints).toHaveBeenCalledWith(from, to);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('receiver');
    activeSession.flushRelease();
    expect(activeSession.reportEndpointRelease).toHaveBeenCalledTimes(1);
    expect(lifecycle).toEqual(['commit']);
  });

  it('[R5] rolls back instead of advancing a Grade A timeline when its frame proof is rejected', async () => {
    const from = element();
    const to = element();
    const adapter = transition();
    const registered = orchestratorCapabilities();
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [boundary(0, adapter, from, to)],
      reducedMotion: false,
      timeoutMs: 1000
    });
    const activeSession = session();
    vi.mocked(activeSession.reportRenderedFrame).mockReturnValue(false);

    registered.capabilities.get('method-figure2')?.start(1, activeSession);
    await vi.waitFor(() => {
      expect(activeSession.reportFailure).toHaveBeenCalledOnce();
    });

    expect(adapter.enter).not.toHaveBeenCalled();
    expect(activeSession.animate).not.toHaveBeenCalled();
    expect(activeSession.provideRelease).not.toHaveBeenCalled();
    expect(adapter.commitEndpoint).toHaveBeenLastCalledWith(0);
  });

  it('latches the first crossing and resumes when the boundary becomes ready', async () => {
    const clock = installControlledClock();
    const from = element();
    const to = element();
    const adapter = transition();
    const registered = orchestratorCapabilities();
    const listeners = new Set<() => void>();
    let ready = false;
    const delayedBoundary = {
      ...boundary(1, adapter, from, to),
      ready: () => ready,
      subscribeReady(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [delayedBoundary],
      reducedMotion: true,
      timeoutMs: 1000
    });
    const activeSession = session();

    expect(
      registered.capabilities.get('figure2-proof')?.canStart(1)
    ).toBe(true);
    expect(
      registered.capabilities.get('figure2-proof')?.start(1, activeSession)
    ).toBe(true);
    expect(adapter.begin).not.toHaveBeenCalled();

    ready = true;
    for (const listener of listeners) listener();

    await vi.waitFor(() => expect(adapter.enter).toHaveBeenCalledTimes(1));
    clock.flush(0);
    clock.flush(600);
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });
    expect(adapter.begin).toHaveBeenCalledWith(
      gradeAExecutionToken,
      expect.any(Function)
    );
    expect(adapter.prepare).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it('uses the authored 1500ms Figure2-to-Proof clock instead of default ink timing', async () => {
    const clock = installControlledClock();
    const from = element();
    const to = element();
    const adapter = transition();
    const registered = orchestratorCapabilities();
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [{ ...boundary(1, adapter, from, to), durationMs: 1500 }],
      reducedMotion: false,
      timeoutMs: 4000
    });
    const activeSession = session();

    registered.capabilities.get('figure2-proof')?.start(1, activeSession);
    await vi.waitFor(() => expect(adapter.enter).toHaveBeenCalledTimes(1));

    clock.flush(0);
    clock.flush(1499);
    expect(activeSession.provideRelease).not.toHaveBeenCalled();
    clock.flush(1500);
    expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
  });

  it('leaves native landing selection to the orchestrator controller', async () => {
    const clock = installControlledClock();
    const from = element();
    const to = element();
    const adapter = transition();
    let receiverAligned = false;
    adapter.enter = vi.fn(() => {
      receiverAligned = true;
    });
    const registered = orchestratorCapabilities();
    const capability = boundary(2, adapter, from, to);
    const position = vi.fn((direction: 1 | -1) => (
      direction === 1 ? 102 : receiverAligned ? 102 : 202
    ));
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [{ ...capability, position }],
      reducedMotion: true,
      timeoutMs: 1000
    });
    const activeSession = session();

    registered.capabilities.get('proof-brand')?.start(1, activeSession);
    await vi.waitFor(() => expect(adapter.enter).toHaveBeenCalledTimes(1));
    clock.flush(0);
    clock.flush(600);
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(position).not.toHaveBeenCalled();
    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
  });

  it('commits reverse to the canonical upstream endpoint', async () => {
    const clock = installControlledClock();
    const from = element();
    const to = element();
    const prepareTransition = vi.fn(async () => undefined);
    const adapter = transition(prepareTransition);
    const prepareReceiver = vi.fn(async () => undefined);
    const registered = orchestratorCapabilities();
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [{
        ...boundary(1, adapter, from, to),
        prepareReceiver
      }],
      reducedMotion: true,
      timeoutMs: 1000
    });
    const activeSession = session();

    expect(
      registered.capabilities.get('figure2-proof')?.start(-1, activeSession)
    ).toBe(true);
    await vi.waitFor(() => expect(adapter.reverse).toHaveBeenCalledTimes(1));
    clock.flush(0);
    clock.flush(600);
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(prepareReceiver).toHaveBeenCalledWith({
      progress: 1,
      direction: -1,
      runId: 'phone-session-grade-a:9',
      presentationToken: {
        authorityId: 'phone-authority-grade-a',
        sessionId: 'phone-session-grade-a',
        generation: 9,
        leg: 0,
        revision: 1,
        subject: 'grade-a:ink',
        kind: 'effect-frame'
      },
      signal: expect.any(AbortSignal)
    });
    expect(adapter.prepare).toHaveBeenCalledWith(-1, expect.any(AbortSignal));
    expect(prepareReceiver.mock.invocationCallOrder[0]).toBeLessThan(
      prepareTransition.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(adapter.reverse).toHaveBeenCalledTimes(1);
    expect(adapter.commitEndpoint).toHaveBeenNthCalledWith(1, 1);
    expect(adapter.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(activeSession.reportProgress).toHaveBeenLastCalledWith(0);
    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
    expect(activeSession.reportEndpoints).toHaveBeenCalledWith(to, from);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('receiver');
    activeSession.flushRelease();
    expect(activeSession.reportEndpointRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls a reverse preparation failure back to its downstream source', async () => {
    const from = element();
    const to = element();
    const adapter = transition(vi.fn(async () => {
      throw new Error('preparation failed');
    }));
    const registered = orchestratorCapabilities();
    createPhoneGradeARunner({
      orchestrator: registered.orchestrator,
      boundaries: [boundary(0, adapter, from, to)],
      reducedMotion: false,
      timeoutMs: 1000
    });
    const activeSession = session();

    registered.capabilities.get('method-figure2')?.start(-1, activeSession);
    await vi.waitFor(() => {
      expect(activeSession.reportFailure).toHaveBeenCalledTimes(1);
    });

    expect(activeSession.provideRelease).not.toHaveBeenCalled();
    expect(adapter.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(adapter.releaseEndpoint).toHaveBeenCalledTimes(1);
    expect(activeSession.reportEndpoints).toHaveBeenCalledWith(to, from);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('source');
    expect(activeSession.reportEndpointRelease).toHaveBeenCalledTimes(1);
  });
});
