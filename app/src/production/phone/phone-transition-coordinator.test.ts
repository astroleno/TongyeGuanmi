import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneIntentCoordinator,
  PHONE_INK_AUTOPLAY_MS,
  type PhoneIntent,
  type PhoneIntentDisposition,
  phoneTimedTransitionProgress,
  phoneTransitionCrossesBoundary
} from './phone-transition-coordinator';

type TestListener = (event: Record<string, unknown>) => void;

class TestEventTarget {
  readonly dataset: Record<string, string> = {};
  private readonly listeners = new Map<string, TestListener[]>();

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function installCoordinatorEnvironment() {
  const root = new TestEventTarget();
  const testWindow = new TestEventTarget() as TestEventTarget & {
    scrollY: number;
    scrollTo(x: number, y: number): void;
  };
  testWindow.scrollY = 0;
  testWindow.scrollTo = (_x, y) => {
    testWindow.scrollY = y;
  };
  vi.stubGlobal('window', testWindow);
  return { root, testWindow };
}

function wheelEvent(overrides: Record<string, unknown> = {}) {
  return {
    target: null,
    deltaY: 200,
    deltaMode: 0,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('phone transition coordinator', () => {
  it('claims both directions at the same semantic edge', () => {
    expect(phoneTransitionCrossesBoundary(400, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(400, 798, 800, 1)).toBe(false);
    expect(phoneTransitionCrossesBoundary(800, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(800, 600, 800, -1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(840, 810, 800, -1)).toBe(false);
  });

  it('claims the next input after native momentum already crossed an authored edge', () => {
    expect(phoneTransitionCrossesBoundary(842, 962, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(758, 638, 800, -1)).toBe(true);
  });

  it('uses one mirrored 600ms easing curve for every ink boundary', () => {
    expect(PHONE_INK_AUTOPLAY_MS).toBe(600);
    expect(phoneTimedTransitionProgress(0)).toBe(0);
    expect(phoneTimedTransitionProgress(300)).toBe(.5);
    expect(phoneTimedTransitionProgress(600)).toBe(1);
    expect(phoneTimedTransitionProgress(900)).toBe(1);
  });

  it('keeps a wheel burst in one gesture epoch until its quiet rearm', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let now = 0;
    const intents: PhoneIntent[] = [];
    const coordinator = createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return 'claim-boundary';
      },
      {
        now: () => now,
        scrollY: () => testWindow.scrollY
      }
    );

    const wheel = () => root.dispatch('wheel', {
      target: null,
      deltaY: 200,
      deltaMode: 0,
      preventDefault: () => undefined,
      stopImmediatePropagation: () => undefined
    });

    wheel();
    now = 300;
    wheel();
    now = 1_501;
    wheel();

    expect(intents.map(([inputEpoch]) => inputEpoch)).toEqual([1, 1, 2]);
    coordinator.dispose();
  });

  it('preserves reverse intent at the document start', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    const intents: PhoneIntent[] = [];
    const preventDefault = vi.fn();
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return 'claim-boundary';
      },
      { scrollY: () => testWindow.scrollY }
    );

    root.dispatch('wheel', {
      target: null,
      deltaY: -100,
      deltaMode: 0,
      preventDefault,
      stopImmediatePropagation: vi.fn()
    });

    expect(intents).toEqual([[1, -1, 0, -100]]);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves unclaimed wheel displacement fully native', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    testWindow.scrollY = 400;
    const preventDefault = vi.fn();
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      () => 'pass-native',
      {
        scrollY: () => testWindow.scrollY,
        scrollTo: (y) => testWindow.scrollTo(0, y)
      }
    );

    const stopImmediatePropagation = vi.fn();
    root.dispatch('wheel', {
      target: null,
      deltaY: 250,
      deltaMode: 0,
      preventDefault,
      stopImmediatePropagation
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(testWindow.scrollY).toBe(400);
  });

  it('reuses the touch gesture identity for promoted Safari momentum', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let now = 0;
    const intents: PhoneIntent[] = [];
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return 'pass-native';
      },
      {
        now: () => now,
        scrollY: () => testWindow.scrollY
      }
    );

    root.dispatch('touchstart', {
      touches: [{ clientY: 600 }]
    });
    root.dispatch('touchmove', {
      target: null,
      touches: [{ clientY: 560 }],
      preventDefault: () => undefined,
      stopImmediatePropagation: () => undefined
    });
    now = 300;
    testWindow.scrollY = 120;
    testWindow.dispatch('scroll', {});

    expect(intents.map(([inputEpoch]) => inputEpoch)).toEqual([1, 1]);
  });

  it('keeps split touch sequences in one epoch during the momentum window', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let now = 0;
    const intents: PhoneIntent[] = [];
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return 'pass-native';
      },
      {
        now: () => now,
        scrollY: () => testWindow.scrollY
      }
    );

    const touch = (clientY: number) => {
      root.dispatch('touchstart', { touches: [{ clientY: 600 }] });
      root.dispatch('touchmove', {
        target: null,
        touches: [{ clientY }],
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn()
      });
      root.dispatch('touchend', { touches: [] });
    };

    touch(560);
    now = 300;
    touch(520);
    now = 1_501;
    touch(480);

    expect(intents.map(([inputEpoch]) => inputEpoch)).toEqual([1, 1, 2]);
  });

  it('publishes the touch epoch before native scroll sampling', () => {
    const { root } = installCoordinatorEnvironment();
    const epochs: number[] = [];
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      () => 'pass-native',
      {
        onInputEpoch: (epoch) => epochs.push(epoch)
      }
    );

    root.dispatch('touchstart', { touches: [{ clientY: 600 }] });

    expect(epochs).toEqual([1]);
  });

  it.each([
    ['pass-native', false],
    ['claim-boundary', true],
    ['block-active-session', true],
    ['consume-completed-epoch-tail', true]
  ] as const)('uses the correct DOM ownership for %s', (
    disposition: PhoneIntentDisposition,
    shouldBlock
  ) => {
    const { root, testWindow } = installCoordinatorEnvironment();
    const event = wheelEvent();
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      () => disposition,
      { scrollY: () => testWindow.scrollY }
    );

    root.dispatch('wheel', event);

    expect(event.preventDefault).toHaveBeenCalledTimes(shouldBlock ? 1 : 0);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(shouldBlock ? 1 : 0);
    expect(testWindow.scrollY).toBe(0);
  });

  it('probes only pass-native wheel input and corrects a stalled WebKit scroll once', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    const frames = new Map<number, () => void>();
    let frameId = 0;
    const sample = vi.fn();
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      () => 'pass-native',
      {
        scrollY: () => testWindow.scrollY,
        scrollTo: (y) => testWindow.scrollTo(0, y),
        requestFrame: (callback) => {
          const id = ++frameId;
          frames.set(id, callback);
          return id;
        },
        cancelFrame: (id) => frames.delete(id),
        scrollState: () => ({ revision: 7, corridor: 'front-rail' }),
        onNativeScrollCorrection: sample
      }
    );

    const first = wheelEvent({ deltaY: 120 });
    root.dispatch('wheel', first);
    const second = wheelEvent({ deltaY: 120 });
    root.dispatch('wheel', second);
    expect(first.preventDefault).not.toHaveBeenCalled();
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(testWindow.scrollY).toBe(0);

    const queued = frames.entries().next().value as [number, () => void];
    frames.delete(queued[0]);
    queued[1]();

    expect(testWindow.scrollY).toBe(120);
    expect(sample).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(0);
  });

  it('[front-half gate] coalesces every move of one native touch gesture to its latest projected scroll target', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    const frames = new Map<number, () => void>();
    let frameId = 0;
    const intents: PhoneIntent[] = [];
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return 'pass-native';
      },
      {
        scrollY: () => testWindow.scrollY,
        scrollTo: (y) => testWindow.scrollTo(0, y),
        requestFrame: (callback) => {
          const id = ++frameId;
          frames.set(id, callback);
          return id;
        },
        cancelFrame: (id) => frames.delete(id),
        scrollState: () => ({ revision: 7, corridor: 'front-rail' })
      }
    );

    root.dispatch('touchstart', {
      touches: [{ clientY: 600 }]
    });
    for (const clientY of [560, 500, 440]) {
      root.dispatch('touchmove', {
        target: null,
        touches: [{ clientY }],
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn()
      });
    }

    expect(intents.map(([inputEpoch]) => inputEpoch)).toEqual([1, 1, 1]);
    expect(frames).toHaveLength(1);
    const queued = frames.entries().next().value as [number, () => void];
    frames.delete(queued[0]);
    queued[1]();

    expect(
      testWindow.scrollY,
      'a single Safari gesture must correct to its final move, not only its first move'
    ).toBe(160);
  });

  it('does not correct a pass-native gesture after the browser already moved', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    const frames = new Map<number, () => void>();
    let frameId = 0;
    const correction = vi.fn();
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      () => 'pass-native',
      {
        scrollY: () => testWindow.scrollY,
        requestFrame: (callback) => {
          const id = ++frameId;
          frames.set(id, callback);
          return id;
        },
        cancelFrame: (id) => frames.delete(id),
        scrollState: () => ({ revision: 1, corridor: 'front-rail' }),
        onNativeScrollCorrection: correction
      }
    );

    root.dispatch('wheel', wheelEvent({ deltaY: 120 }));
    testWindow.scrollY = 80;
    const queued = frames.entries().next().value as [number, () => void];
    queued[1]();

    expect(correction).not.toHaveBeenCalled();
    expect(testWindow.scrollY).toBe(80);
  });
});
