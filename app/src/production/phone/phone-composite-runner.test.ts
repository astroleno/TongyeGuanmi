import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenePresentationAdapterHandle } from '../../story/presentation';
import {
  createPhoneCompositeRunner
} from './phone-composite-runner';
import type {
  PhoneOrchestratedRunSession,
  PhoneRunCapability,
  PhoneStoryRuntimeEngine as PhoneStoryOrchestrator
} from './phone-story/runtime/engine';
import type { PhoneRenderedPresentationFrame } from './phone-story/presentation';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneExecutionToken } from './phone-story/runtime';
import {
  createPhoneCapabilityRegistry
} from './phone-transition-readiness';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

const runnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
  'utf8'
);

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
): PhoneSceneAdapterHandle {
  return {
    root: () => root,
    update: vi.fn(),
    enter: vi.fn(),
    leave: vi.fn(),
    prepareTargetPresentation: prepare,
    presentPresentation: vi.fn(),
    disposePresentation: vi.fn()
  };
}

function transition(options: Readonly<{
  reportFirstFrame?: boolean;
}> = {}): PhoneTransitionAdapterHandle {
  let onPresentedFrame: ((frame?: PhoneRenderedPresentationFrame) => void)
    | undefined;
  let token: PhoneRenderedPresentationFrame['token'] | null = null;
  let frameSequence = 0;
  const present = () => {
    if (options.reportFirstFrame !== false && token) {
      onPresentedFrame?.({
        token,
        frameSequence: ++frameSequence,
        observedAt: 100,
        origin: 'segment-first-frame'
      });
    }
  };
  return {
    begin: vi.fn((_request, reportFrame) => {
      token = _request[5] ?? null;
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

function testStartMedia(context: Readonly<{
  identity: PhoneExecutionToken;
  config: Readonly<{ media: PhoneTransitionAdapterHandle }>;
  prepareReverseMediaFirstFrame: () => void;
}>): void {
  if (context.identity[4] === 1) context.config.media.enter?.();
  else context.prepareReverseMediaFirstFrame();
}

function session(
  direction: 1 | -1 = 1,
  initialLeg = direction === 1 ? 0 : 1,
  identity: Readonly<{
    authorityId?: string;
    sessionId?: string;
    generation?: number;
  }> = {}
) {
  const active = { value: true };
  let leg = initialLeg;
  const authorityId = identity.authorityId ?? 'phone-authority-composite';
  const sessionId = identity.sessionId ?? 'phone-session-composite';
  const generation = identity.generation ?? 7;
  let release: Parameters<PhoneOrchestratedRunSession['provideRelease']>[0] | undefined;
  const value: PhoneOrchestratedRunSession = {
    authorityId,
    sessionId,
    generation,
    get leg() {
      return leg;
    },
    direction,
    valid: () => active.value,
    reportPresentationFrame: vi.fn(() => true),
    reportPresentationProof: vi.fn(),
    reportPresentationReadiness: vi.fn(),
    presentationProofToken: vi.fn((kind, subject) => ({
      authorityId,
      sessionId,
      generation,
      leg,
      revision: 1,
      subject,
      kind
    })),
    presentationFrameToken: vi.fn((kind, subject) => ({
      authorityId,
      sessionId,
      generation,
      leg,
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
    reportEndpointCommit: vi.fn((endpoint: 'source' | 'receiver') => {
      if (endpoint !== 'receiver') return;
      if (direction === 1 && leg === 0) leg = 1;
      else if (direction === -1 && leg === 1) leg = 0;
    }),
    reportTargetPresented: vi.fn(),
    reportPresentationCommitted: vi.fn(),
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
  const subscribers = new Set<() => void>();
  const orchestrator = {
    registerRunCapability(
      _run: PhoneRunId,
      _ownerId: string,
      registered: PhoneRunCapability
    ) {
      capability = registered;
      return { dispose: vi.fn() };
    },
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return {
        dispose() {
          subscribers.delete(callback);
        }
      };
    }
  } as unknown as PhoneStoryOrchestrator;
  return {
    orchestrator,
    capability: () => {
      if (!capability) throw new Error('run capability not registered');
      return capability;
    },
    notify() {
      for (const callback of subscribers) callback();
    }
  };
}

function installWindow() {
  vi.stubGlobal('window', {
    scrollY: 240,
    scrollTo: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn()
  });
}

function installControlledWindow() {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const scrollTo = vi.fn();
  vi.stubGlobal('window', {
    scrollY: 240,
    scrollTo,
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
    scrollTo,
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
  reducedMotion = false,
  entry = transition()
) {
  const prior = scene(element());
  const visual = scene(element());
  const final = scene(element());
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
    position: (_scene, direction) => direction === 1 ? 120 : 100,
    targetLanding: (_scene, _strategy, direction) => direction === 1 ? 260 : 80,
    startMedia: testStartMedia
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

type Group45CapabilityId =
  | 'brand'
  | 'figure3-animation'
  | 'services'
  | 'brand-figure3'
  | 'figure3-services';
type Group45Visual = 'figure3-animation';

function group45Runner(reducedMotion = false) {
  const prior = scene(element());
  const visual = scene(element());
  const final = scene(element());
  const entry = transition();
  const media = transition();
  const capabilities = createPhoneCapabilityRegistry<
    Group45CapabilityId,
    ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
  >();
  capabilities.register('brand', 'brand', prior);
  capabilities.register('figure3-animation', 'figure3', visual);
  capabilities.register('services', 'services', final);
  capabilities.register('brand-figure3', 'brand-figure3', entry);
  capabilities.register('figure3-services', 'figure3-services', media);
  const registered = orchestratorCapability();
  const runner = createPhoneCompositeRunner<
    Group45Visual,
    Group45CapabilityId,
    ScenePresentationAdapterHandle | PhoneTransitionAdapterHandle
  >({
    ownerId: 'group45',
    visualScenes: ['figure3-animation'],
    orchestrator: registered.orchestrator,
    capabilities,
    reducedMotion,
    timeoutMs: 1000,
    runForVisual: () => 'brand-services',
    config: () => ({ prior, visual, final, entry, media }),
    directConfig: () => ({ visual, final, media }),
    position: (_scene, direction) => direction === 1 ? 120 : 100,
    targetLanding: (_scene, _strategy, direction) => (
      direction === 1 ? 260 : 80
    ),
    startMedia: testStartMedia
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

function group67ReducedRunner(
  landingFor: (direction: 1 | -1) => number = (direction) => (
    direction === 1 ? 260 : 80
  )
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
    reducedMotion: true,
    timeoutMs: 1_000,
    runForVisual: () => 'lab-education',
    config: () => ({ prior, visual, final, entry, media }),
    directConfig: () => ({ visual, final, media }),
    position: (_scene, direction) => direction === 1 ? 120 : 100,
    targetLanding: (_scene, _strategy, direction) => landingFor(direction),
    startMedia: testStartMedia
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

function group45Frame(
  activeSession: ReturnType<typeof session>,
  leg = activeSession.leg
): PhoneRenderedPresentationFrame {
  return {
    token: {
      authorityId: activeSession.authorityId,
      sessionId: activeSession.sessionId,
      generation: activeSession.generation,
      leg,
      revision: 1,
      subject: 'group45:figure3',
      kind: 'packed-canvas-frame'
    },
    frameSequence: 1,
    observedAt: 100,
    origin: 'segment-first-frame'
  };
}

function group45StaticFrame(
  activeSession: ReturnType<typeof session>,
  subject: 'native:brand' | 'native:services'
): PhoneRenderedPresentationFrame {
  return {
    token: {
      authorityId: activeSession.authorityId,
      sessionId: activeSession.sessionId,
      generation: activeSession.generation,
      leg: activeSession.leg,
      revision: 1,
      subject,
      kind: 'static-poster'
    },
    frameSequence: 1,
    observedAt: 100
  };
}

function group67StaticFrame(
  activeSession: ReturnType<typeof session>,
  subject: 'native:education' | 'native:lab'
): PhoneRenderedPresentationFrame {
  return {
    token: {
      authorityId: activeSession.authorityId,
      sessionId: activeSession.sessionId,
      generation: activeSession.generation,
      leg: activeSession.leg,
      revision: 1,
      subject,
      kind: 'static-poster'
    },
    frameSequence: 1,
    observedAt: 100,
    origin: 'leaf-static-poster'
  };
}

function rawFrame(
  identity: PhoneExecutionToken,
  frameSequence = 1
): PhoneRenderedPresentationFrame {
  const token = identity[5];
  if (!token) throw new Error('Expected an exact leaf token');
  return {
    token,
    frameSequence,
    observedAt: 100,
    origin: 'segment-first-frame'
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('phone composite runner snapshot execution', () => {
  it('[framework admission closure] has one manifest-driven raw proof route and no compatibility settle writer', () => {
    expect(runnerSource).toContain('phoneRunLegAdmissionTuple(');
    expect(runnerSource).toContain('phoneDirectEntryAdmissionTuple(');
    expect(runnerSource).toContain('options.targetLanding(');
    expect(runnerSource).toContain('reportRawFrame(resource, frame)');
    for (const forbidden of [
      'rawFrameProof:',
      'rawFrameProofFor',
      'reducedStaticSubject',
      'reducedAdmissionTargetPosition',
      'settleFrozenCompatibility',
      'reportRenderedFrame(',
      'presentationProofToken(',
      'config.visual.enter?.()',
      'config.visual.reverse?.()',
      'if (options.startMedia)'
    ]) {
      expect(runnerSource).not.toContain(forbidden);
    }
  });

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
      position: () => 240,
      targetLanding: () => 240,
      startMedia: testStartMedia
    });
    const activeSession = session(1, 1);

    expect(registered.capability().startAtLeg?.(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(media.enter).toHaveBeenCalledOnce();
    });

    const identity = runner.execution('ph-animation');
    if (!identity) throw new Error('Expected active direct-media identity');
    expect(identity.slice(0, 5)).toEqual(activeSession.identity());
    expect(capabilities.retained()).toEqual([
      'ph-animation',
      'education',
      'ph-education'
    ]);
    runner.reportMediaFrame('ph-animation', rawFrame(identity));
    runner.completeMedia('ph-animation', identity);

    expect(activeSession.provideRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGeometry: expect.any(Function),
        releaseResources: expect.any(Function)
      })
    );
    activeSession.flushRelease();
    expect(capabilities.retained()).toEqual([]);
  });

  it('[Group45 cutover] forwards an exact Figure3 physical frame without rebuilding its proof', async () => {
    installWindow();
    const runtime = group45Runner();
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('figure3-animation');
    if (!identity) throw new Error('Expected active Figure3 media admission');
    const frame = group45Frame(activeSession);

    runtime.runner.reportMediaFrame('figure3-animation', frame);

    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(frame);
    expect(activeSession.presentationProofToken).not.toHaveBeenCalled();
  });

  it('[Group45 reverse hard cutover] reclaims Figure3 as the visible source before requesting its decoder frame', async () => {
    installWindow();
    const runtime = group45Runner();
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });

    const identity = runtime.runner.execution('figure3-animation');
    if (!identity) throw new Error('Expected active Figure3 media admission');
    expect(runtime.media.begin).toHaveBeenCalledWith(identity);
    expect(activeSession.reportEndpoints).toHaveBeenLastCalledWith(
      runtime.visual.root(),
      runtime.final.root()
    );
    expect(runtime.media.render).toHaveBeenCalledWith(.996);
    const endpointClaim = vi.mocked(activeSession.reportEndpoints)
      .mock.invocationCallOrder.at(-1);
    const reverse = vi.mocked(runtime.media.reverse!)
      .mock.invocationCallOrder.at(0);
    expect(endpointClaim).toBeLessThan(reverse ?? Number.POSITIVE_INFINITY);
  });

  it('[Group45 cutover] drops Figure3 progress and completion until admission proof is accepted', async () => {
    installWindow();
    const runtime = group45Runner();
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('figure3-animation');
    if (!identity) throw new Error('Expected active Figure3 media admission');
    const rendersAtAdmission = vi.mocked(runtime.media.render).mock.calls.length;

    runtime.runner.progressMedia('figure3-animation', identity, .2);
    runtime.runner.completeMedia('figure3-animation', identity);

    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(runtime.media.render).toHaveBeenCalledTimes(rendersAtAdmission);
    expect(activeSession.reportFailure).not.toHaveBeenCalled();
    expect(runtime.runner.execution('figure3-animation')).toEqual(identity);
  });

  it('[Group45 reduced cutover] waits for an exact post-paint frame instead of settling synchronously', async () => {
    installWindow();
    const runtime = group45Runner(true);
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });

    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(activeSession.reportEndpointCommit).not.toHaveBeenCalled();

    const identity = runtime.runner.execution('figure3-animation');
    if (!identity) throw new Error('Expected reduced Figure3 admission to remain active');
    const frame = group45StaticFrame(activeSession, 'native:brand');
    runtime.runner.reportMediaFrame('figure3-animation', frame);

    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(frame);
    expect(activeSession.reportAnimationComplete).not.toHaveBeenCalled();
  });

  it('[Group45 reduced cutover] places the native target before requesting its static post-paint proof', async () => {
    const clock = installControlledWindow();
    const runtime = group45Runner(true);
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });

    const presentTarget = runtime.prior.presentPresentation;
    if (!presentTarget) throw new Error('Expected the native target to expose static presentation');
    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledWith(80);
    expect(clock.scrollTo).not.toHaveBeenCalled();
    expect(presentTarget).not.toHaveBeenCalled();

    clock.flush(100);

    const call = vi.mocked(presentTarget).mock.calls.at(0);
    if (!call) throw new Error('Expected the reduced target leaf to receive a proof binding');
    expect(call[0]).toMatchObject({
      subject: 'native:brand',
      kind: 'static-poster'
    });
    call[1](group45StaticFrame(activeSession, 'native:brand'));
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(
      group45StaticFrame(activeSession, 'native:brand')
    );
    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(activeSession.reportAnimationComplete).not.toHaveBeenCalled();
  });

  it('[Group67 reduced cutover] forwards only the target leaf static proof in both directions', async () => {
    for (const [direction, targetName, subject, landing] of [
      [1, 'final', 'native:education', 260],
      [-1, 'prior', 'native:lab', 80]
    ] as const) {
      const clock = installControlledWindow();
      const runtime = group67ReducedRunner();
      const activeSession = session(direction);

      expect(runtime.registered.capability().start(direction, activeSession)).toBe(true);
      await vi.waitFor(() => {
        expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
      });

      const target = runtime[targetName];
      const presentTarget = target.presentPresentation;
      if (!presentTarget) throw new Error('Expected a native static target');
      expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledWith(landing);
      expect(activeSession.reportProgress).not.toHaveBeenCalled();
      expect(activeSession.reportEndpointCommit).not.toHaveBeenCalled();
      expect(activeSession.animate).not.toHaveBeenCalled();
      expect(activeSession.reportAnimationComplete).not.toHaveBeenCalled();

      clock.flush(100);
      clock.flush(116);
      const call = vi.mocked(presentTarget).mock.calls.at(0);
      if (!call) throw new Error('Expected target post-paint binding');
      expect(call[0]).toMatchObject({ subject, kind: 'static-poster' });

      const exact = group67StaticFrame(activeSession, subject);
      call[1](exact);
      expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(exact);

      call[1]({
        ...exact,
        token: { ...exact.token, revision: exact.token.revision + 1 }
      });
      expect(activeSession.reportPresentationFrame).toHaveBeenCalledTimes(1);
    }
  });

  it('[Group67 reduced cutover] remeasures the native reading landing after candidate layout before binding its static leaf', async () => {
    const clock = installControlledWindow();
    const landings = [260, 896];
    let measurement = 0;
    const runtime = group67ReducedRunner(() => (
      landings[Math.min(measurement++, landings.length - 1)]!
    ));
    const activeSession = session(1);

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });
    const presentTarget = runtime.final.presentPresentation;
    if (!presentTarget) throw new Error('Expected Education to expose a static leaf');
    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledTimes(1);
    expect(activeSession.requestReducedTargetLayout).toHaveBeenLastCalledWith(260);
    expect(presentTarget).not.toHaveBeenCalled();

    // The candidate projection can move a sticky/native document anchor. The
    // runner must remeasure that physical layout before the leaf may paint.
    clock.flush(100);
    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledTimes(2);
    expect(activeSession.requestReducedTargetLayout).toHaveBeenLastCalledWith(896);
    expect(presentTarget).not.toHaveBeenCalled();

    clock.flush(116);
    expect(presentTarget).toHaveBeenCalledOnce();
  });

  it('[Group67 reduced cutover] re-arms an exact static leaf only when its rejected frame observes a moved native landing', async () => {
    const clock = installControlledWindow();
    const landings = [260, 260, 1_104];
    let measurement = 0;
    const runtime = group67ReducedRunner(() => (
      landings[Math.min(measurement++, landings.length - 1)]!
    ));
    const activeSession = session(1);

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });
    const presentTarget = runtime.final.presentPresentation;
    if (!presentTarget) throw new Error('Expected Education to expose a static leaf');

    clock.flush(100);
    clock.flush(116);
    const firstCall = vi.mocked(presentTarget).mock.calls.at(0);
    if (!firstCall) throw new Error('Expected the first Education static binding');
    const exact = {
      ...group67StaticFrame(activeSession, 'native:education'),
      token: firstCall[0]
    };
    vi.mocked(activeSession.reportPresentationFrame)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    firstCall[1](exact);

    // A candidate role can move a native document anchor after the runner's
    // pre-bind remeasure. Only that observed landing change authorizes a
    // fresh layout request and a re-arm; the machine transaction and raw
    // immutable token remain the same.
    expect(activeSession.requestReducedTargetLayout).toHaveBeenCalledTimes(3);
    expect(activeSession.requestReducedTargetLayout).toHaveBeenLastCalledWith(1_104);
    expect(presentTarget).toHaveBeenCalledOnce();
    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    expect(activeSession.reportEndpointCommit).not.toHaveBeenCalled();

    clock.flush(132);
    const secondCall = vi.mocked(presentTarget).mock.calls.at(1);
    if (!secondCall) throw new Error('Expected the re-armed Education static binding');
    expect(secondCall[0]).toBe(firstCall[0]);
    secondCall[1](exact);
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledTimes(2);
    runtime.runner.dispose();
    expect(runtime.final.disposePresentation).toHaveBeenLastCalledWith(firstCall[0]);
  });

  it('[Group67 reduced cutover] rolls an unreported static leaf back through the machine timeout', async () => {
    vi.useFakeTimers();
    const clock = installControlledWindow();
    const runtime = group67ReducedRunner();
    const activeSession = session(1);

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });
    clock.flush(100);
    clock.flush(116);

    const presentEducation = runtime.final.presentPresentation;
    if (!presentEducation) {
      throw new Error('Expected Education to expose a static leaf presenter');
    }
    const binding = vi.mocked(presentEducation).mock.calls.at(0);
    if (!binding) throw new Error('Expected the unreleased Education leaf binding');
    expect(activeSession.reportFailure).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(activeSession.reportFailure).toHaveBeenCalledOnce();
    expect(runtime.final.disposePresentation).toHaveBeenLastCalledWith(binding[0]);
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('[Group67 reduced cutover] retires an aborted Education leaf callback before the same authority starts its next candidate', async () => {
    const clock = installControlledWindow();
    const runtime = group67ReducedRunner();
    const first = session(1, 0, {
      authorityId: 'group67-repeat-authority',
      sessionId: 'group67-repeat-first',
      generation: 41
    });

    expect(runtime.registered.capability().start(1, first)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });
    clock.flush(100);
    clock.flush(116);
    expect(runtime.final.presentPresentation).toHaveBeenCalledOnce();
    const presentEducation = runtime.final.presentPresentation;
    if (!presentEducation) {
      throw new Error('Expected Education to expose its leaf presentation adapter');
    }
    const firstCall = vi.mocked(presentEducation)
      .mock.calls.at(0);
    if (!firstCall) {
      throw new Error('Expected the first Education static binding');
    }

    first.reportFailure();
    runtime.registered.notify();
    expect(first.reportFailure).toHaveBeenCalledOnce();
    expect(runtime.final.disposePresentation).toHaveBeenCalledWith(firstCall[0]);

    const second = session(1, 0, {
      authorityId: 'group67-repeat-authority',
      sessionId: 'group67-repeat-second',
      generation: 42
    });
    expect(runtime.registered.capability().start(1, second)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledTimes(2);
    });
    clock.flush(200);
    clock.flush(216);
    expect(runtime.final.presentPresentation).toHaveBeenCalledTimes(2);
    const secondCall = vi.mocked(presentEducation)
      .mock.calls.at(1);
    if (!secondCall) throw new Error('Expected the second Education static binding');

    firstCall[1](group67StaticFrame(first, 'native:education'));
    expect(second.reportPresentationFrame).not.toHaveBeenCalled();

    secondCall[1](group67StaticFrame(second, 'native:education'));
    expect(second.reportPresentationFrame).toHaveBeenCalledWith(
      group67StaticFrame(second, 'native:education')
    );
  });

  it('[Group45 cutover] retires a timed-out admission before the same authority starts a new session', async () => {
    vi.useFakeTimers();
    installWindow();
    const runtime = group45Runner();
    const first = session(-1, 1, {
      authorityId: 'group45-repeat-authority',
      sessionId: 'group45-repeat-first',
      generation: 41
    });

    expect(runtime.registered.capability().start(-1, first)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(first.reportFailure).toHaveBeenCalledOnce();
    expect(runtime.capabilities.retained()).toEqual([]);

    const second = session(-1, 1, {
      authorityId: 'group45-repeat-authority',
      sessionId: 'group45-repeat-second',
      generation: 42
    });
    expect(runtime.registered.capability().start(-1, second)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledTimes(2);
    });
    const identity = runtime.runner.execution('figure3-animation');
    if (!identity) throw new Error('Expected the retry to own a fresh session');
    const frame = group45Frame(second);
    runtime.runner.reportMediaFrame('figure3-animation', frame);

    expect(second.reportPresentationFrame).toHaveBeenCalledWith(frame);
  });

  it('[R5] reports at most one accepted physical first frame for each active leg', async () => {
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
      position: () => 240,
      targetLanding: () => 240,
      startMedia: testStartMedia
    });
    const activeSession = session(1, 1);

    expect(registered.capability().startAtLeg?.(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(media.enter).toHaveBeenCalledOnce();
    });
    const identity = runner.execution('ph-animation');
    if (!identity) throw new Error('Expected the active direct-media identity');

    const frame = rawFrame(identity);
    runner.reportMediaFrame('ph-animation', frame);
    runner.reportMediaFrame('ph-animation', frame);

    expect(activeSession.reportPresentationFrame).toHaveBeenCalledTimes(1);
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(frame);
  });

  it('keeps forward ink and media under the same authority session', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner();
    const activeSession = session(1, 0);

    expect(runtime.registered.capability().start(1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      const call = vi.mocked(runtime.entry.begin).mock.calls.at(0);
      expect(call?.[0].slice(0, 5)).toEqual(activeSession.identity());
      expect(call?.[1]).toEqual(expect.any(Function));
    });
    clock.flush(0);
    clock.flush(700);
    expect(activeSession.leg).toBe(1);
    clock.flush(701);
    expect(runtime.media.enter).toHaveBeenCalledOnce();

    const identity = runtime.runner.execution('ph-animation');
    if (!identity) throw new Error('Expected forward media identity');
    expect(identity.slice(0, 5)).toEqual(activeSession.identity());
    runtime.runner.reportMediaFrame('ph-animation', rawFrame(identity));
    runtime.runner.completeMedia('ph-animation', identity);
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
    expect(runtime.media.render).toHaveBeenCalledWith(.996);
    const identity = runtime.runner.execution('ph-animation');
    if (!identity) throw new Error('Expected reverse media identity');
    expect(identity.slice(0, 5)).toEqual(activeSession.identity());
    runtime.runner.reportMediaFrame('ph-animation', rawFrame(identity));
    runtime.runner.completeMedia('ph-animation', identity);

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

  it('[R5] fails a silent reverse ink first-frame gate instead of stranding the transaction', async () => {
    vi.useFakeTimers();
    const clock = installControlledWindow();
    const silentEntry = transition({ reportFirstFrame: false });
    const runtime = fullRunner(false, silentEntry);
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('ph-animation');
    if (!identity) throw new Error('Expected reverse media identity');
    runtime.runner.reportMediaFrame('ph-animation', rawFrame(identity));
    runtime.runner.completeMedia('ph-animation', identity);

    clock.flush(0);
    expect(silentEntry.prepareFirstFrame).toHaveBeenCalledWith(-1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(activeSession.reportFailure).toHaveBeenCalledOnce();
    expect(runtime.capabilities.retained()).toEqual([]);
  });

  it('[R5] drops media completion before its token-bound physical proof is accepted', async () => {
    installWindow();
    const runtime = fullRunner();
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.media.reverse).toHaveBeenCalledOnce();
    });
    const identity = runtime.runner.execution('ph-animation');
    if (!identity) throw new Error('Expected reverse media identity');

    runtime.runner.completeMedia('ph-animation', identity);

    expect(activeSession.reportFailure).not.toHaveBeenCalled();
    expect(runtime.media.commitEndpoint).toHaveBeenLastCalledWith(0);
    expect(runtime.entry.reverse).not.toHaveBeenCalled();
    expect(runtime.runner.execution('ph-animation')).toEqual(identity);
    expect(runtime.capabilities.retained()).not.toEqual([]);
    runtime.runner.dispose();
  });

  it('holds a reduced reverse candidate until its manifest target leaf reports an exact post-paint frame', async () => {
    const clock = installControlledWindow();
    const runtime = fullRunner(true);
    const activeSession = session(-1, 1);

    expect(runtime.registered.capability().start(-1, activeSession)).toBe(true);
    await vi.waitFor(() => {
      expect(runtime.visual.prepareTargetPresentation).toHaveBeenCalledOnce();
    });
    expect(runtime.visual.leave).not.toHaveBeenCalled();
    clock.flush(100);
    clock.flush(116);
    const present = runtime.prior.presentPresentation;
    if (!present) throw new Error('Expected Lab static target presenter');
    const call = vi.mocked(present).mock.calls.at(0);
    if (!call) throw new Error('Expected Lab static target binding');
    const frame = group67StaticFrame(activeSession, 'native:lab');
    call[1](frame);
    expect(activeSession.reportPresentationFrame).toHaveBeenCalledWith(frame);
    expect(activeSession.reportProgress).not.toHaveBeenCalled();
    runtime.runner.dispose();
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
      position: () => 240,
      targetLanding: () => 240,
      startMedia: testStartMedia
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
