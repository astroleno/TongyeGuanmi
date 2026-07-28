import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryRuntime,
  phoneRuntimeRunDependencies,
  registerPhoneRuntimeSampledScrollCorridor,
  requestPhoneRuntimeDirectEntry,
  selectPhoneCinematicSnapshot
} from './phone-story-runtime';
import type { PhoneStoryOrchestrator } from './phone-story-orchestrator';

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
      17: null
    });
    runtime.dispose();
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
        return [actualY, 'brand', 'hero-pattern-scroll', 1, 0.75];
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
        run: 'hero-pattern-scroll',
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
      initialScene: 'ph-animation',
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
