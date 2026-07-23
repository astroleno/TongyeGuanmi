import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHONE_INK_AUTOPLAY_MS,
  phoneTimedTransitionProgress,
  phoneTransitionCrossesBoundary,
  registerPhoneTransitionBoundary,
  type PhoneTransitionSession
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

  it('skips an unavailable boundary and claims the next runnable edge', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let unavailableStarts = 0;
    let claimedSession: PhoneTransitionSession | null = null;
    registerPhoneTransitionBoundary(root as unknown as HTMLElement, {
      position: () => 400,
      canStart: () => false,
      start: () => {
        unavailableStarts += 1;
      }
    });
    registerPhoneTransitionBoundary(root as unknown as HTMLElement, {
      position: () => 700,
      canStart: () => true,
      start: (_direction, session) => {
        claimedSession = session;
      }
    });
    let prevented = false;

    root.dispatch('wheel', {
      target: null,
      deltaY: 900,
      deltaMode: 0,
      preventDefault: () => {
        prevented = true;
      },
      stopImmediatePropagation: () => undefined
    });

    expect(unavailableStarts).toBe(0);
    expect(claimedSession).not.toBeNull();
    expect(prevented).toBe(true);
    expect(testWindow.scrollY).toBe(700);
    expect(root.dataset.phoneTransitionLock).toBe('locked');

    claimedSession!.complete(720);
    expect(testWindow.scrollY).toBe(720);
    expect(root.dataset.phoneTransitionLock).toBeUndefined();
  });

  it('reclaims a Safari momentum overshoot from the last touch intent', () => {
    const { root, testWindow } = installCoordinatorEnvironment();
    let starts = 0;
    registerPhoneTransitionBoundary(root as unknown as HTMLElement, {
      position: () => 500,
      canStart: () => true,
      start: () => {
        starts += 1;
      }
    });

    root.dispatch('touchstart', {
      touches: [{ clientY: 600 }]
    });
    root.dispatch('touchmove', {
      target: null,
      touches: [{ clientY: 580 }],
      preventDefault: () => undefined,
      stopImmediatePropagation: () => undefined
    });
    expect(starts).toBe(0);

    testWindow.scrollY = 650;
    testWindow.dispatch('scroll', {});

    expect(starts).toBe(1);
    expect(testWindow.scrollY).toBe(500);
    expect(root.dataset.phoneTransitionLock).toBe('locked');
  });
});
