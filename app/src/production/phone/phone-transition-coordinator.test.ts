import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneIntentCoordinator,
  PHONE_INK_AUTOPLAY_MS,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('phone transition coordinator', () => {
  it('claims both directions at the same semantic edge', () => {
    expect(phoneTransitionCrossesBoundary(400, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(400, 798, 800, 1)).toBe(false);
    expect(phoneTransitionCrossesBoundary(800, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(800, 600, 800, -1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(760, 600, 800, -1)).toBe(false);
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
    const intents: unknown[] = [];
    const coordinator = createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return true;
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
    now = 80;
    wheel();
    now = 260;
    wheel();

    expect(intents).toMatchObject([
      { gestureId: 1, inputEpoch: 1, source: 'wheel' },
      { gestureId: 1, inputEpoch: 1, source: 'wheel' },
      { gestureId: 2, inputEpoch: 2, source: 'wheel' }
    ]);
    coordinator.dispose();
  });

  it('reuses the touch gesture identity for promoted Safari momentum', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let now = 0;
    const intents: unknown[] = [];
    createPhoneIntentCoordinator(
      root as unknown as HTMLElement,
      (intent) => {
        intents.push(intent);
        return false;
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

    expect(intents).toMatchObject([
      { gestureId: 1, inputEpoch: 1, source: 'touch' },
      { gestureId: 1, inputEpoch: 1, source: 'momentum' }
    ]);
  });
});
