import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenePresentationAdapterHandle } from '../../story/presentation';
import {
  createPhoneCompositeRunner
} from './phone-composite-runner';
import type {
  PhoneOrchestratedRunSession,
  PhoneRunCapability,
  PhoneStoryOrchestrator
} from './phone-story-orchestrator';
import type { PhoneRunId } from './phone-story-runs';
import {
  createPhoneCapabilityRegistry
} from './phone-transition-readiness';
import type { PhoneTransitionAdapterHandle } from './types';

type CapabilityId =
  | 'lab'
  | 'ph-animation'
  | 'education'
  | 'lab-ph'
  | 'ph-education';
type Visual = 'ph-animation';

function element(): HTMLElement {
  return {
    dataset: {},
    style: {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
      getPropertyValue: vi.fn(() => '')
    },
    getBoundingClientRect: () => ({ top: 0 }),
    closest: () => null
  } as unknown as HTMLElement;
}

function scene(
  root: HTMLElement,
  prepare = vi.fn(async () => undefined)
): ScenePresentationAdapterHandle {
  return {
    root: () => root,
    update: vi.fn(),
    enter: vi.fn(),
    leave: vi.fn(),
    prepareTargetPresentation: prepare
  };
}

function transition(): PhoneTransitionAdapterHandle {
  let onPresentedFrame: (() => void) | undefined;
  const present = () => onPresentedFrame?.();
  return {
    begin: vi.fn((_request, reportFrame) => {
      onPresentedFrame = reportFrame;
    }),
    prepareFirstFrame: vi.fn(() => present()),
    render: vi.fn(() => present()),
    commitEndpoint: vi.fn(),
    releaseEndpoint: vi.fn(),
    enter: vi.fn(),
    reverse: vi.fn()
  };
}

function session(
  direction: 1 | -1 = 1,
  initialLeg = direction === 1 ? 0 : 1
) {
  const active = { value: true };
  let leg = initialLeg;
  let release: Parameters<PhoneOrchestratedRunSession['provideRelease']>[0] | undefined;
  const value: PhoneOrchestratedRunSession = {
    authorityId: 'phone-authority-composite',
    sessionId: 'phone-session-composite',
    generation: 7,
    get leg() {
      return leg;
    },
    direction,
    valid: () => active.value,
    reportPresentedFrame: vi.fn(),
    reportPresentationEvidence: vi.fn(),
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
    reportEndpointCommit: vi.fn((endpoint: 'source' | 'receiver') => {
      if (endpoint !== 'receiver') return;
      if (direction === 1 && leg === 0) leg = 1;
      else if (direction === -1 && leg === 1) leg = 0;
    }),
    reportTargetPresented: vi.fn(),
    reportStablePresentationVerified: vi.fn(),
    reportEndpointRelease: vi.fn(),
    provideRelease: vi.fn((nextRelease) => {
      release = nextRelease;
    }),
    reportAnimationComplete: vi.fn(),
    reportFailure: vi.fn(() => {
      active.value = false;
    })
  };
  return Object.assign(value, {
    identity() {
      return [
        value.authorityId,
        value.sessionId,
        value.generation,
        value.leg,
        value.direction
      ] as const;
    },
    flushRelease() {
      active.value = false;
      release?.releaseGeometry();
      release?.releaseResources();
    }
  });
}

function orchestratorCapability() {
  let capability: PhoneRunCapability | undefined;
  const orchestrator = {
    registerRunCapability(
      _run: PhoneRunId,
      _ownerId: string,
      registered: PhoneRunCapability
    ) {
      capability = registered;
      return { dispose: vi.fn() };
    }
  } as unknown as PhoneStoryOrchestrator;
  return {
    orchestrator,
    capability: () => {
      if (!capability) throw new Error('run capability not registered');
      return capability;
    }
  };
}

function installWindow() {
  vi.stubGlobal('window', {
    scrollY: 240,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn()
  });
}

function installControlledWindow() {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('window', {
    scrollY: 240,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frame = ++sequence;
      frames.set(frame, callback);
      return frame;
    }),
    cancelAnimationFrame: vi.fn((frame: number) => {
      frames.delete(frame);
    })
  });
  return {
    flush(now: number) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    }
  };
}

function fullCapabilities(
  prior: ScenePresentationAdapterHandle,
  visual: ScenePresentationAdapterHandle,
  final: ScenePresentationAdapterHandle,
  entry: PhoneTransitionAdapterHandle,
  media: PhoneTransitionAdapterHandle
) {
  const capabilities = createPhoneCapabilityRegistry<
    CapabilityId,
    ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
  >();
  capabilities.register('lab', 'lab', prior);
  capabilities.register('ph-animation', 'ph', visual);
  capabilities.register('education', 'education', final);
  capabilities.register('lab-ph', 'lab-ph', entry);
  capabilities.register('ph-education', 'ph-education', media);
  return capabilities;
}

function fullRunner(
  reducedMotion = false
) {
  const prior = scene(element());
  const visual = scene(element());
  const final = scene(element());
  const entry = transition();
  const media = transition();
  const capabilities = fullCapabilities(prior, visual, final, entry, media);
  const registered = orchestratorCapability();
  const runner = createPhoneCompositeRunner<
    Visual,
    CapabilityId,
    ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
  >({
    ownerId: 'group67',
    visualScenes: ['ph-animation'],
    orchestrator: registered.orchestrator,
    capabilities,
    reducedMotion,
    timeoutMs: 1000,
    runForVisual: () => 'lab-education',
    config: () => ({ prior, visual, final, entry, media }),
    directConfig: () => ({ visual, final, media }),
    position: (_scene, direction) => direction === 1 ? 120 : 100
  });
  return {
    prior,
    visual,
    final,
    entry,
    media,
    capabilities,
    registered,
    runner
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('phone composite runner snapshot execution', () => {
  it('prepares a direct media leg under one captured identity', async () => {
    installWindow();
    const visual = scene(element());
    const final = scene(element());
    const media = transition();
    const capabilities = createPhoneCapabilityRegistry<
      CapabilityId,
      ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
    >();
    capabilities.register('ph-animation', 'ph', visual);
    capabilities.register('education', 'education', final);
    capabilities.register('ph-education', 'ph-education', media);
    const registered = orchestratorCapability();
    const runner = createPhoneCompositeRunner<
      Visual,
      CapabilityId,
      ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
    >({
      ownerId: 'group67',
      visualScenes: ['ph-animation'],
      orchestrator: registered.orchestrator,
      capabilities,
      reducedMotion: false,
      timeoutMs: 1000,
      runForVisual: () => 'lab-education',
      config: () => null,
      directConfig: () => ({ visual, final, media }),
      position: () => 240
    });
    const activeSession = session(1, 1);

    expect(registered.capability().startAtLeg?.(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(media.enter).toHaveBeenCalledOnce();
    });

    const identity = runner.execution('ph-animation');
    expect(identity).toEqual(activeSession.identity());
    expect(capabilities.retained()).toEqual([
      'ph-animation',
      'education',
      'ph-education'
    ]);
    runner.completeMedia('ph-animation', identity!);

    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
    activeSession.flushRelease();
    expect(capabilities.retained()).toEqual([]);
  });

  it('keeps forward ink and media under the same authority session', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session(1, 0);

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.entry.begin).toHaveBeenCalledWith(
        activeSession.identity(),
        expect.any(Function)
      );
    });
    clock.flush(0);
    clock.flush(700);
    expect(activeSession.leg).toBe(1);
    clock.flush(701);
    expect(runtime.media.enter).toHaveBeenCalledOnce();

    const identity = runtime.runner.execution('ph-animation');
    expect(identity).toEqual(activeSession.identity());
    runtime.runner.completeMedia('ph-animation', identity!);
    expect(runtime.media.commitEndpoint).toHaveBeenLastCalledWith(1);
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('runs reverse media before reverse ink and preserves the returned identity', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('ph-animation');
    expect(identity).toEqual(activeSession.identity());
    runtime.runner.completeMedia('ph-animation', identity!);

    expect(activeSession.leg).toBe(0);
    clock.flush(0);
    expect(runtime.entry.reverse).toHaveBeenCalledOnce();
    clock.flush(1);
    clock.flush(701);
    expect(runtime.visual.update).toHaveBeenLastCalledWith(0);
    expect(runtime.visual.leave).toHaveBeenCalledOnce();
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('releases a reverse-prepared visual at the reduced-motion terminal endpoint', async () => {
    installWindow();
    const runtime = fullRunner(true);
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.leave).toHaveBeenCalledOnce();
    });
    expect(runtime.visual.update).toHaveBeenLastCalledWith(0);
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('rejects stale media evidence instead of relabeling it with current state', async () => {
    installWindow();
    const runtime = fullRunner();
    const activeSession = session(-1, 1);
    runtime.registered.capability().start(-1, activeSession);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('ph-animation');
    expect(identity).not.toBeNull();
    const stale = [
      identity![0],
      identity![1],
      identity![2] + 1,
      identity![3],
      identity![4]
    ] as const;
    runtime.runner.progressMedia('ph-animation', stale, .8);
    runtime.runner.completeMedia('ph-animation', stale);

    expect(activeSession.reportProgress).not.toHaveBeenCalledWith(.8);
    expect(activeSession.reportEndpointCommit).not.toHaveBeenCalledWith('receiver');
  });

  it('rolls a preparation failure back to the source endpoint and releases retention', async () => {
    installWindow();
    const visual = scene(
      element(),
      vi.fn(async () => {
        throw new Error('presented frame unavailable');
      })
    );
    const final = scene(element());
    const media = transition();
    const capabilities = createPhoneCapabilityRegistry<
      CapabilityId,
      ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
    >();
    capabilities.register('ph-animation', 'ph', visual);
    capabilities.register('education', 'education', final);
    capabilities.register('ph-education', 'ph-education', media);
    const registered = orchestratorCapability();
    createPhoneCompositeRunner<
      Visual,
      CapabilityId,
      ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
    >({
      ownerId: 'group67',
      visualScenes: ['ph-animation'],
      orchestrator: registered.orchestrator,
      capabilities,
      reducedMotion: false,
      timeoutMs: 1000,
      runForVisual: () => 'lab-education',
      config: () => null,
      directConfig: () => ({ visual, final, media }),
      position: () => 240
    });
    const activeSession = session(1, 1);
    registered.capability().startAtLeg?.(1, activeSession);

    await vi.waitFor(() => {
      expect(activeSession.reportFailure).toHaveBeenCalledOnce();
    });
    expect(media.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(media.releaseEndpoint).toHaveBeenCalledOnce();
    expect(visual.update).toHaveBeenLastCalledWith(0);
    expect(capabilities.retained()).toEqual([]);
  });
});
