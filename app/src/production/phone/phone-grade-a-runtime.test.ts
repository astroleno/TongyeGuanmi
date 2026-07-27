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
  PhoneStoryOrchestrator
} from './phone-story-orchestrator';
import type { PhoneRunId } from './phone-story-runs';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneStorySnapshot
} from './phone-story-state';
import type { PhoneTransitionAdapterHandle } from './types';

function element(): HTMLElement {
  return { dataset: {} } as HTMLElement;
}

const gradeAExecutionIdentity = {
  authorityId: 'phone-authority-grade-a',
  sessionId: 'phone-session-grade-a',
  generation: 9,
  leg: 0,
  direction: 1
} as const;

function transition(
  prepare = vi.fn(async () => undefined)
): PhoneTransitionAdapterHandle {
  return {
    begin: vi.fn(),
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
    reportPresentedFrame: vi.fn(),
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
  it('prepares and commits a forward boundary under the orchestrator session', async () => {
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
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(adapter.begin).toHaveBeenCalledWith({
      identity: gradeAExecutionIdentity
    });
    expect(adapter.prepare).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(adapter.enter).toHaveBeenCalledTimes(1);
    expect(adapter.commitEndpoint).toHaveBeenNthCalledWith(1, 0);
    expect(adapter.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.reportPresentedFrame).toHaveBeenCalledTimes(1);
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

  it('latches the first crossing and resumes when the boundary becomes ready', async () => {
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

    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });
    expect(adapter.begin).toHaveBeenCalledWith({
      identity: gradeAExecutionIdentity
    });
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
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(prepareReceiver).toHaveBeenCalledWith({
      progress: 1,
      direction: -1,
      runId: 'phone-session-grade-a:9',
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
