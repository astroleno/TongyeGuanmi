import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createPhoneStoryRuntime,
  phoneRuntimeRunDependencies,
  registerPhoneRuntimeFrontStageCapability,
  registerPhoneRuntimeSampledScrollCorridor,
  requestPhoneRuntimeDirectEntry,
  selectPhoneCinematicSnapshot
} from './phone-story/runtime';
import type { PhoneStoryRuntimeEngine as PhoneStoryOrchestrator } from './phone-story/runtime/engine';

function root() {
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty: () => undefined,
      removeProperty: () => undefined,
      getPropertyValue: () => ''
    }
  } as unknown as HTMLElement;
}

describe('phone story runtime factory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('projects lazy cinematic consumers through a primitive snapshot tuple', () => {
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const stable = selectPhoneCinematicSnapshot(runtime.port.getSnapshot());
    expect(stable.slice(0, 11)).toEqual([
      'brand',
      null,
      'native:brand',
      runtime.authorityId,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]);
    expect(stable.slice(11)).toEqual([
      'stable',
      'brand',
      'native',
      0,
      null,
      0,
      null,
      null
    ]);

    runtime.port.dispatch({
      type: 'RUN_STARTED',
      authorityId: runtime.authorityId,
      sessionId: 'tuple-session',
      generation: 1,
      leg: 0,
      run: 'brand-services',
      direction: 1,
      anchorY: 120,
      inputEpoch: 2
    });
    const transaction = selectPhoneCinematicSnapshot(runtime.port.getSnapshot());
    expect(transaction.slice(0, 11)).toEqual([
      'brand',
      'native:brand',
      'group45:figure3',
      runtime.authorityId,
      'tuple-session',
      1,
      'brand-services',
      1,
      0,
      'preparing',
      0
    ]);
    expect(transaction).toMatchObject({
      11: 'transaction',
      12: 'brand',
      14: 120,
      15: null,
      16: 0,
      17: null,
      18: 1
    });
    runtime.dispose();
  });

  it('[proof hard cutover] exposes no synthesized rendered-frame writer', () => {
    const source = readFileSync(
      new URL('./phone-story/runtime/session.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toContain('reportRenderedFrame:');
    expect(source).not.toContain('proofForRenderedFrame({');
  });

  it('projects cinematic run legs and readiness through positional tuples', () => {
    expect(phoneRuntimeRunDependencies('lab-education', 1)).toEqual([
      'ph-animation',
      'education',
      'ph-education'
    ]);
    expect(phoneRuntimeRunDependencies('lab-education')).toEqual([
      'lab',
      'ph-animation',
      'education',
      'lab-ph',
      'ph-education'
    ]);
  });

  it('[front playback hard cutover] owns Hero, Pattern checkpoint, and Ink clocks in one capability runner', () => {
    const capabilities = new Map<string, {
      start(direction: 1 | -1, session: Record<string, unknown>): boolean | void;
    }>();
    const registerRunCapability = vi.fn((
      run: string,
      _owner: string,
      capability: { start(direction: 1 | -1, session: Record<string, unknown>): boolean | void }
    ) => {
      capabilities.set(run, capability);
      return { dispose: () => undefined };
    });
    const updates = {
      hero: vi.fn(),
      pattern: vi.fn(),
      star: vi.fn()
    };
    const effect = {
      reporter: undefined as ((frame: Record<string, unknown>) => void) | undefined,
      begin: vi.fn((_execution, reporter) => { effect.reporter = reporter; }),
      prepareFirstFrame: vi.fn(() => effect.reporter?.({
        token: token('effect-frame', 'front:ink'),
        frameSequence: 1,
        observedAt: 1,
        origin: 'segment-first-frame'
      })),
      commitEndpoint: vi.fn(),
      releaseEndpoint: vi.fn(),
      render: vi.fn(),
      enter: vi.fn(),
      reverse: vi.fn()
    };
    const pattern = {
      root: () => root(),
      update: updates.pattern,
      presentPresentation: vi.fn((presentationToken, report) => report({
        // Leaf code may cross a lazy module boundary before it reports a
        // value-identical immutable token. The runner must compare the full
        // token contract, never object identity.
        token: { ...presentationToken },
        frameSequence: 1,
        observedAt: 1,
        origin: 'leaf-static-poster'
      }))
    };
    const hero = { root: () => root(), update: updates.hero };
    const starMap = { root: () => root(), update: updates.star };
    const token = (kind: string, subject: string) => ({
      authorityId: 'front-runtime-authority',
      sessionId: 'front-runtime-session',
      generation: 1,
      leg: 0,
      revision: 1,
      kind,
      subject
    });
    const animations: Array<readonly [number, number, number | undefined]> = [];
    const session = {
      authorityId: 'front-runtime-authority',
      sessionId: 'front-runtime-session',
      generation: 1,
      leg: 0,
      direction: 1 as const,
      valid: () => true,
      presentationFrameToken: (kind: string, subject: string) => token(kind, subject),
      requestReducedTargetLayout: vi.fn(() => true),
      reportPresentationFrame: vi.fn(() => true),
      reportFailure: vi.fn(),
      reportEndpoints: vi.fn(),
      reportEndpointRelease: vi.fn(),
      provideRelease: vi.fn(),
      reportAnimationComplete: vi.fn(),
      animate: vi.fn((start, end, duration, render, complete) => {
        animations.push([start, end, duration]);
        render(start);
        render(end);
        complete();
      })
    };
    const registration = registerPhoneRuntimeFrontStageCapability(
      { registerRunCapability } as never,
      {
        position: () => 100,
        hero: () => hero as never,
        pattern: () => pattern as never,
        starMap: () => starMap as never,
        heroPattern: () => effect as never,
        patternStarMap: () => effect as never,
        reducedMotion: false
      }
    );

    expect(capabilities.get('hero-pattern')?.start(1, session)).toBe(true);
    expect(animations).toEqual([
      [0, 1 / 3, 900],
      [1 / 3, 1, 1800]
    ]);
    expect(session.reportAnimationComplete).toHaveBeenCalledTimes(1);
    expect(session.reportEndpointRelease).toHaveBeenCalledTimes(1);
    expect(session.reportPresentationFrame).toHaveBeenCalledTimes(1);

    animations.length = 0;
    expect(capabilities.get('pattern-collapse')?.start(1, session)).toBe(true);
    expect(animations).toEqual([[0, 1, 1800]]);
    expect(pattern.presentPresentation).toHaveBeenCalledTimes(1);
    expect(effect.begin).toHaveBeenCalledTimes(1);

    animations.length = 0;
    expect(capabilities.get('hero-pattern')?.start(-1, {
      ...session,
      direction: -1 as const
    })).toBe(true);
    expect(animations).toEqual([
      [1, 1 / 3, 1800],
      [1 / 3, 0, 900]
    ]);
    expect(effect.reverse).toHaveBeenCalledTimes(1);
    expect(session.reportEndpointRelease).toHaveBeenCalledTimes(2);

    registration.dispose();
  });

  it('adapts a lazy scroll sample tuple beside the runtime port', () => {
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const lease = registerPhoneRuntimeSampledScrollCorridor(
      runtime.port,
      'runtime-tuple-corridor',
      ['brand'],
      (actualY, width, height, offsetTop, snapshot) => {
        expect([width, height, offsetTop, snapshot[0]]).toEqual([
          390,
          844,
          12,
          'brand'
        ]);
        return [actualY, 'brand', 'star-aod-scroll', 1, 0.75];
      },
      () => 120,
      () => 180
    );
    const engine = runtime.port as unknown as PhoneStoryOrchestrator;

    expect(engine.scrollCorridors.sample(runtime.port.getSnapshot(), {
      actualY: 96,
      viewportWidth: 390,
      viewportHeight: 844,
      visualViewportOffsetTop: 12
    })).toEqual({
      corridor: 'runtime-tuple-corridor',
      sample: {
        actualY: 96,
        scene: 'brand',
        run: 'star-aod-scroll',
        direction: 1,
        progress: 0.75
      }
    });

    lease.dispose();
    runtime.dispose();
  });

  it('constructs side-effect free and attaches one route-local authority', () => {
    const routeRoot = root();
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    expect(routeRoot.dataset).toEqual({});
    expect(runtime.port.getSnapshot().authorityId).toBe(runtime.authorityId);

    runtime.attach();
    runtime.attach();

    expect(routeRoot.dataset.phoneAuthorityId).toBe(runtime.authorityId);
    expect(routeRoot.dataset.phoneAuthorityScope).toBe('formal');
    runtime.dispose();
  });

  it('keeps one live authority per root, clears it on dispose, and creates a new remount identity', () => {
    const routeRoot = root();
    const first = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const second = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'services',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    first.attach();
    expect(routeRoot.dataset.phoneAuthorityId).toBe(first.authorityId);
    first.dispose();
    expect(routeRoot.dataset.phoneAuthorityId).toBeUndefined();

    second.attach();
    const beforeOldEvidence = second.port.getSnapshot();
    first.port.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: first.authorityId,
      scene: 'services'
    });

    expect(first.authorityId).not.toBe(second.authorityId);
    expect(routeRoot.dataset).toMatchObject({
      phoneAuthorityId: second.authorityId,
      phoneAuthorityScope: 'formal',
      phoneCursor: 'hold:services'
    });
    expect(second.port.getSnapshot()).toBe(beforeOldEvidence);

    second.dispose();
    expect(routeRoot.dataset.phoneAuthorityId).toBeUndefined();
  });

  it('keeps formal and QA reducer traces scope-independent', () => {
    const formal = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 40,
      scrollTo: () => undefined
    });
    const qa = createPhoneStoryRuntime({
      scope: 'brand-lab',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 40,
      scrollTo: () => undefined
    });
    for (const authority of [formal, qa]) {
      authority.port.dispatch({
        type: 'HOLD_RECONCILED',
        authorityId: authority.authorityId,
        scene: 'services',
        actualY: 88
      });
    }
    const comparable = (authority: typeof formal) => {
      const { authorityId, diagnostics, ...snapshot } = authority.port.getSnapshot();
      void authorityId;
      void diagnostics;
      return snapshot;
    };

    expect(comparable(formal)).toEqual(comparable(qa));
    formal.dispose();
    qa.dispose();
  });

  it('can receive a direct-entry transaction before attach without publishing a fake hold', () => {
    const routeRoot = root();
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'figure3-animation',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    runtime.port.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => routeRoot,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    runtime.port.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: runtime.authorityId,
      target: 'figure3-animation',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: null
    });

    runtime.attach();

    expect(runtime.port.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: {
          trigger: 'entry',
          run: null,
          direction: 1,
          legIndex: 0,
          from: 'brand',
          to: 'figure3-animation'
        }
      }
    });
    runtime.dispose();
  });

  it('builds a stable canonical direct-entry event beside the runtime port', () => {
    let receivedLeg: number | undefined;
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      // The shell starts behind the loader on Hero; initial direct entry must
      // still own its target fallback rather than publish that bootstrap hold.
      initialScene: 'hero',
      root: () => root(),
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    runtime.port.registerRunCapability('lab-education', 'runtime-bridge', {
      position: () => 0,
      canStart: () => true,
      start: () => undefined,
      startAtLeg(legIndex) {
        receivedLeg = legIndex;
      }
    });
    runtime.port.registerSurface({
      id: 'group67:ph',
      scene: 'ph-animation',
      kind: 'fixed',
      root: () => root(),
      presentation: () => [true, true, true, true, 'static-poster']
    });

    requestPhoneRuntimeDirectEntry(runtime.port, 'ph-animation', 'initial');

    expect(receivedLeg).toBeUndefined();
    expect(runtime.port.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          run: null,
          legIndex: 0,
          from: 'ph-animation',
          to: 'ph-animation'
        }
      }
    });
    runtime.dispose();
  });

  it('cleans every attach-owned listener during a mount/probe/remount cycle', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const browser = {
      scrollY: 0,
      scrollTo: () => undefined,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
      addEventListener: (type: string) => added.push(`window:${type}`),
      removeEventListener: (type: string) => removed.push(`window:${type}`)
    } as unknown as Window;
    const page = {
      defaultView: browser,
      addEventListener: (type: string) => added.push(`document:${type}`),
      removeEventListener: (type: string) => removed.push(`document:${type}`)
    } as unknown as Document;
    const routeRoot = Object.assign(root(), {
      ownerDocument: page,
      addEventListener: (type: string) => added.push(`root:${type}`),
      removeEventListener: (type: string) => removed.push(`root:${type}`)
    });
    vi.stubGlobal('window', browser);
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    runtime.attach();
    runtime.attach();

    expect(added).toEqual(expect.arrayContaining([
      'root:touchstart',
      'root:touchmove',
      'root:touchend',
      'root:touchcancel',
      'root:wheel',
      'window:scroll',
      'window:resize',
      'window:orientationchange',
      'window:pageshow',
      'document:visibilitychange',
      'document:resize'
    ]));
    expect(added.filter((entry) => entry === 'root:wheel')).toHaveLength(1);
    expect(added.filter((entry) => entry === 'window:resize')).toHaveLength(1);
    expect(added.filter((entry) => entry === 'window:orientationchange')).toHaveLength(1);
    // One scroll listener belongs to the input coordinator and one to the
    // authority-scoped document sampler; no route child owns another.
    expect(added.filter((entry) => entry === 'window:scroll')).toHaveLength(2);
    runtime.dispose();

    expect(removed).toEqual(expect.arrayContaining([
      'root:touchstart',
      'root:touchmove',
      'root:touchend',
      'root:touchcancel',
      'root:wheel',
      'window:scroll',
      'window:resize',
      'window:orientationchange',
      'window:pageshow',
      'document:visibilitychange',
      'document:resize'
    ]));

    const remount = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    remount.attach();
    expect(remount.authorityId).not.toBe(runtime.authorityId);
    expect(added.filter((entry) => entry === 'root:wheel')).toHaveLength(2);
    remount.dispose();
  });
});
