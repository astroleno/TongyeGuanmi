import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenePresentationAdapterHandle } from '../../story/presentation';
import {
  createPhoneCompositeRunner,
  type PhoneCompositeRunView
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

function element(top: number | (() => number) = 0): HTMLElement {
  const properties = new Map<string, string>();
  return {
    dataset: {},
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
      getPropertyValue: (name: string) => properties.get(name) ?? ''
    },
    getBoundingClientRect: () => ({
      top: typeof top === 'function' ? top() : top
    }),
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
  return {
    begin: vi.fn(),
    render: vi.fn(),
    commitEndpoint: vi.fn(),
    releaseEndpoint: vi.fn(),
    enter: vi.fn(),
    reverse: vi.fn()
  };
}

function session() {
  const active = { value: true };
  let release: Parameters<PhoneOrchestratedRunSession['provideRelease']>[0] | undefined;
  const value: PhoneOrchestratedRunSession = {
    authorityId: 'phone-authority-composite',
    sessionId: 'phone-session-direct',
    generation: 7,
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
      active.value = false;
    })
  };
  return Object.assign(value, {
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

function installWindow(): void {
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

function fullRunner({
  reducedMotion = false,
  priorRoot = element(),
  acquireReverseEntry
}: Readonly<{
  reducedMotion?: boolean;
  priorRoot?: HTMLElement;
  acquireReverseEntry?: () => Readonly<{ releaseGeometry(): void }>;
}> = {}) {
  const prior = scene(priorRoot);
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
    config: () => ({
      prior,
      visual,
      final,
      entry,
      media
    }),
    directConfig: () => ({ visual, final, media }),
    position: (_scene, direction) => direction === 1 ? 120 : 100,
    onRunState: vi.fn(),
    onRunBegin: vi.fn(),
    onMediaActive: vi.fn(),
    ...(acquireReverseEntry ? { acquireReverseEntry } : {})
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

describe('phone composite runner direct media lifecycle', () => {
  it('prepares and plays only the canonical media leg under the same session', async () => {
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
    const states: Array<PhoneCompositeRunView<Visual> | null> = [];
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
      directConfig: () => ({
        visual,
        final,
        media
      }),
      position: () => 240,
      onRunState: (run) => states.push(run),
      onRunBegin: vi.fn(),
      onMediaActive: vi.fn()
    });
    const activeSession = session();

    expect(
      registered.capability().startAtLeg?.(1, activeSession)
    ).toBe(true);
    await vi.waitFor(() => {
      expect(media.enter).toHaveBeenCalledTimes(1);
    });

    expect(capabilities.retained()).toEqual([
      'ph-animation',
      'education',
      'ph-education'
    ]);
    expect(visual.prepareTargetPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: 0,
        direction: 1,
        runId: 'phone-session-direct:7'
      })
    );
    expect(media.begin).toHaveBeenCalledWith({ identity: activeSession });
    expect(media.commitEndpoint).toHaveBeenNthCalledWith(1, 0);
    expect(activeSession.reportPresentedFrame).toHaveBeenCalledTimes(2);
    expect(activeSession).not.toHaveProperty('moveTo');
    expect(states.at(-1)).toMatchObject({
      scene: 'ph-animation',
      step: 'media'
    });

    runner.completeMedia('ph-animation', 1);

    expect(media.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
    activeSession.flushRelease();
    expect(capabilities.retained()).toEqual([]);
  });

  it('rolls preparation failure back without committing the downstream hold', async () => {
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
    const retries: boolean[] = [];
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
      directConfig: () => ({
        visual,
        final,
        media
      }),
      position: () => 240,
      onRunState: (_run, retry) => retries.push(retry),
      onRunBegin: vi.fn(),
      onMediaActive: vi.fn()
    });
    const activeSession = session();

    registered.capability().startAtLeg?.(1, activeSession);
    await vi.waitFor(() => {
      expect(activeSession.reportFailure).toHaveBeenCalledTimes(1);
    });

    expect(activeSession.provideRelease).not.toHaveBeenCalled();
    expect(media.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(media.releaseEndpoint).toHaveBeenCalledTimes(1);
    expect(visual.update).toHaveBeenLastCalledWith(0);
    expect(retries.at(-1)).toBe(true);
    expect(capabilities.retained()).toEqual([]);
  });
});

describe('phone composite runner adjacent lifecycle', () => {
  it('reports directional boundary geometry without moving the scroll owner', () => {
    installWindow();
    const runtime = fullRunner();

    expect(runtime.registered.capability().position(1)).toBe(120);
    expect(runtime.registered.capability().position(-1)).toBe(100);
  });

  it('keeps forward entry and media under one session before committing the target', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session();

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.entry.begin).toHaveBeenCalledWith({ identity: activeSession });
    });

    expect(runtime.entry.commitEndpoint).toHaveBeenNthCalledWith(1, 0);
    clock.flush(0);
    clock.flush(700);
    expect(runtime.entry.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('receiver');

    clock.flush(701);
    expect(runtime.media.begin).toHaveBeenCalledWith({ identity: activeSession });
    expect(runtime.media.commitEndpoint).toHaveBeenNthCalledWith(1, 0);
    expect(runtime.media.enter).toHaveBeenCalledTimes(1);
    expect(runtime.visual.enter).toHaveBeenCalledTimes(1);

    runtime.runner.completeMedia('ph-animation', 1);

    expect(runtime.media.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('reverses media before entry and rolls all the way back to the prior hold', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session();

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledTimes(1);
    });

    expect(runtime.media.commitEndpoint).toHaveBeenNthCalledWith(1, 1);
    runtime.runner.completeMedia('ph-animation', -1);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('receiver');

    clock.flush(0);
    expect(runtime.entry.begin).toHaveBeenCalledWith({ identity: activeSession });
    expect(runtime.entry.commitEndpoint).toHaveBeenNthCalledWith(1, 1);
    expect(runtime.entry.reverse).toHaveBeenCalledTimes(1);
    clock.flush(1);
    clock.flush(701);

    expect(runtime.entry.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(runtime.visual.update).toHaveBeenLastCalledWith(0);
    expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('releases temporary reverse document geometry without creating a durable flow offset', async () => {
    const clock = installControlledWindow();
    let documentAligned = false;
    const priorRoot = element(() => documentAligned ? 1150 : 0);
    const runtime = fullRunner({
      priorRoot,
      acquireReverseEntry: () => {
        documentAligned = true;
        return {
          releaseGeometry() {
            documentAligned = false;
          }
        };
      }
    });
    const activeSession = session();

    runtime.registered.capability().start(-1, activeSession);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledTimes(1);
    });
    runtime.runner.completeMedia('ph-animation', -1);
    clock.flush(0);
    clock.flush(1);
    clock.flush(701);

    activeSession.flushRelease();
    expect(documentAligned).toBe(false);
  });

  it('restores the composite source when the media leg fails', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session();

    runtime.registered.capability().start(1, activeSession);
    await vi.waitFor(() => {
      expect(runtime.entry.begin).toHaveBeenCalledTimes(1);
    });
    clock.flush(0);
    clock.flush(700);
    clock.flush(701);
    expect(runtime.media.enter).toHaveBeenCalledTimes(1);

    runtime.runner.failMedia('ph-animation');

    expect(activeSession.reportFailure).toHaveBeenCalledTimes(1);
    expect(activeSession.provideRelease).not.toHaveBeenCalled();
    expect(runtime.entry.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(runtime.media.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(runtime.visual.update).toHaveBeenLastCalledWith(0);
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('uses the same endpoint transaction in reduced motion', async () => {
    installWindow();
    const runtime = fullRunner({ reducedMotion: true });
    const activeSession = session();

    runtime.registered.capability().start(1, activeSession);
    await vi.waitFor(() => {
      expect(activeSession.provideRelease).toHaveBeenCalledTimes(1);
    });

    expect(runtime.entry.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(runtime.media.commitEndpoint).toHaveBeenLastCalledWith(1);
    expect(activeSession.reportEndpointCommit).toHaveBeenCalledWith('receiver');
    activeSession.flushRelease();
    expect(runtime.capabilities.retained()).toEqual([]);
  });
});
