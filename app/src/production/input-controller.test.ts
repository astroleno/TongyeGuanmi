import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from '../runtime/director.actor';
import { attachStoryInput, canScrollNatively } from './input-controller';
import { READING_WHEEL_DAMPING } from './reading-motion-governor';

function readingRoot(scrollTop: number) {
  const scrollport = {
    clientHeight: 600,
    dataset: {} as Record<string, string>,
    scrollHeight: 1600,
    scrollTop
  } as HTMLElement;
  const root = {
    dataset: { reading: 'true' },
    matches: (selector: string) => selector === '[data-reading="true"]',
    querySelector: () => scrollport
  } as unknown as HTMLElement;
  return { root, scrollport };
}

describe('production input reading handoff', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('routes one slow 10svh Contact gesture through the real Director without cadence loss', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const runtime = createDirectorRuntime({
      actorEpoch: 'input-contact-cadence',
      initialScene: 'contact',
      readyGate: {
        waitForTargetReady: () => new Promise<void>(() => undefined)
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    const detach = attachStoryInput({
      runtime,
      getCurrentScene: () => runtime.getState().context.layerWindow.current,
      getLayerElement: () => null
    });
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: -20,
      preventDefault: vi.fn(),
      target: null
    } as unknown as WheelEvent;

    for (let index = 0; index < 5; index += 1) {
      for (const listener of listeners.get('wheel') ?? []) {
        listener(wheel);
      }
      vi.advanceTimersByTime(400);
    }

    expect(runtime.getState().state).not.toBe('hold');
    expect(runtime.getState().context.pendingDirection).toBe(-1);
    detach();
    runtime.stop();
  });

  it('leaves forward and reverse deltas with the native scrollport before its edges', () => {
    const { root } = readingRoot(500);
    expect(canScrollNatively(root, 0.05)).toBe(true);
    expect(canScrollNatively(root, -0.05)).toBe(true);
  });

  it('hands input to Director only after the matching edge', () => {
    expect(canScrollNatively(readingRoot(1000).root, 0.05)).toBe(false);
    expect(canScrollNatively(readingRoot(0).root, -0.05)).toBe(false);
  });

  it('captures wheel input over Method steps and scrolls its reading root first', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const fakeWindow = {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    };
    vi.stubGlobal('window', fakeWindow);
    const { root, scrollport } = readingRoot(0);
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: { cursor: { status: 'hold', scene: 'method-bottom' } }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'method-bottom',
      getLayerElement: () => root
    });
    const preventDefault = vi.fn();
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: { className: 'r4-method__steps-lead' }
    } as unknown as WheelEvent;

    for (const listener of listeners.get('wheel') ?? []) {
      listener(wheel);
    }

    expect(scrollport.scrollTop).toBe(120 * READING_WHEEL_DAMPING);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    detach();
  });

  it('preserves raw INPUT_DELTA for production scrub policies', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: {
          activeRunId: undefined,
          cursor: { status: 'hold', scene: 'pattern' },
          manifest: {
            nodes: [
              { kind: 'hold', scene: 'pattern' },
              {
                kind: 'segment',
                id: 'pattern-star-map',
                from: 'pattern',
                to: 'star-map',
                policy: { kind: 'scrub', snapAfterIdleMs: 160 }
              }
            ]
          }
        }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'pattern',
      getLayerElement: () => null
    });
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: 20,
      preventDefault: vi.fn(),
      target: null
    } as unknown as WheelEvent;

    for (const listener of listeners.get('wheel') ?? []) {
      listener(wheel);
    }

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'INPUT_DELTA',
      delta: 0.02,
      source: 'wheel'
    }));
    detach();
  });

  it('forwards opposing raw input while Director is preparing a staged leg', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'preparing',
        context: {
          activeRunId: 'preparing-input:1',
          cursor: { status: 'segment', segment: 'ttg-lab', progress: 0 },
          pendingDirection: 1
        }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'ttg-animation',
      getLayerElement: () => null
    });
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: -20,
      preventDefault: vi.fn(),
      target: null
    } as unknown as WheelEvent;

    for (const listener of listeners.get('wheel') ?? []) {
      listener(wheel);
    }

    expect(wheel.preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'INPUT_DELTA',
      delta: -0.02,
      source: 'wheel'
    }));
    detach();
  });

  it('commits the first discrete key gesture when native scroll is already at the edge', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const fakeWindow = {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('HTMLElement', class HTMLElement {});
    const { root } = readingRoot(1000);
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: { cursor: { status: 'hold', scene: 'method-top' } }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'method-top',
      getLayerElement: () => root
    });
    const emitPageDown = () => {
      const event = {
        altKey: false,
        cancelable: true,
        ctrlKey: false,
        defaultPrevented: false,
        key: 'PageDown',
        metaKey: false,
        preventDefault: vi.fn(),
        shiftKey: false,
        target: null
      } as unknown as KeyboardEvent;
      for (const listener of listeners.get('keydown') ?? []) {
        listener(event);
      }
      return event;
    };

    expect(emitPageDown().preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));
    detach();
  });

  it('absorbs the arrival tail and commits within the next 16px wheel gesture', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const { root, scrollport } = readingRoot(980);
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: { cursor: { status: 'hold', scene: 'method-top' } }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'method-top',
      getLayerElement: () => root
    });
    const emit = (deltaY: number) => {
      const event = {
        cancelable: true,
        deltaMode: 0,
        deltaY,
        preventDefault: vi.fn(),
        target: null
      } as unknown as WheelEvent;
      for (const listener of listeners.get('wheel') ?? []) {
        listener(event);
      }
      return event;
    };

    emit(28);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(221);
    emit(15);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    emit(1);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));

    scrollport.scrollTop = 20;
    vi.advanceTimersByTime(221);
    emit(-28);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(221);
    emit(-16);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: -1
    }));
    detach();
  });

  it('commits the first outward gesture after a sequential reading-edge entry', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const { root } = readingRoot(1000);
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: {
          cursor: { status: 'hold', scene: 'lab' },
          holdEntry: { scene: 'lab', edge: 'bottom', source: 'sequential', token: 3 }
        }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'lab',
      getLayerElement: () => root
    });
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: 16,
      preventDefault: vi.fn(),
      target: null
    } as unknown as WheelEvent;

    for (const listener of listeners.get('wheel') ?? []) {
      listener(wheel);
    }

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));
    detach();
  });

  it('treats each touchstart/touchend pair as an independent reading-edge gesture', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const { root } = readingRoot(980);
    const send = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: { cursor: { status: 'hold', scene: 'method-top' } }
      }),
      send,
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'method-top',
      getLayerElement: () => root,
      unlockMedia: vi.fn()
    });
    const emit = (type: 'touchstart' | 'touchmove' | 'touchend', y?: number) => {
      const event = {
        cancelable: true,
        preventDefault: vi.fn(),
        touches: y === undefined ? [] : [{ clientY: y }]
      } as unknown as TouchEvent;
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    };

    emit('touchstart', 200);
    emit('touchmove', 176);
    emit('touchend');
    expect(send).not.toHaveBeenCalled();

    emit('touchstart', 200);
    emit('touchmove', 185);
    expect(send).not.toHaveBeenCalled();
    emit('touchmove', 184);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));
    detach();
  });

  it('retries story-media unlock on touchmove for videos mounted after touchstart', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    const unlockMedia = vi.fn();
    const runtime = {
      getState: () => ({
        state: 'hold',
        context: {
          cursor: { status: 'hold', scene: 'star-map' },
          holdEntry: { scene: 'star-map', edge: 'top', source: 'sequential', token: 3 }
        }
      }),
      send: vi.fn(),
      subscribe: () => () => undefined
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => 'star-map',
      getLayerElement: () => null,
      unlockMedia
    });
    const touchStart = {
      touches: [{ clientY: 200 }]
    } as unknown as TouchEvent;
    const touchMove = {
      touches: [{ clientY: 180 }]
    } as unknown as TouchEvent;

    for (const listener of listeners.get('touchstart') ?? []) {
      listener(touchStart);
    }

    expect(unlockMedia).toHaveBeenCalledOnce();
    for (const listener of listeners.get('touchmove') ?? []) {
      listener(touchMove);
    }
    expect(unlockMedia).toHaveBeenCalledTimes(2);
    detach();
  });

  it.each([
    {
      name: 'Pattern staged checkpoint',
      next: {
        state: 'staged-paused',
        context: {
          activeRunId: 'pattern-star-map:1',
          activeSegment: 'pattern-star-map',
          cursor: { status: 'segment', segment: 'pattern-star-map', progress: 0.42 },
          pausePoint: { stageIndex: 0 }
        }
      },
      scene: 'pattern'
    },
    {
      name: 'AOD fresh-input hold',
      next: {
        state: 'hold',
        context: {
          cursor: { status: 'hold', scene: 'aod-animation' },
          manifest: {
            nodes: [
              { kind: 'hold', scene: 'aod-animation', freshInput: true },
              { kind: 'segment', id: 'aod-method-top', policy: { kind: 'snap' } }
            ]
          }
        }
      },
      scene: 'aod-animation'
    }
  ])('requires a new physical gesture after arriving at the $name', ({ next, scene }) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      innerHeight: 1000,
      visualViewport: undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        const current = listeners.get(type) ?? new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      }
    });
    let snapshot: Record<string, unknown> = {
      state: 'playing',
      context: {
        activeRunId: 'arrival:1',
        cursor: { status: 'segment', segment: 'arrival', progress: 0.9 }
      }
    };
    let notifyRuntime: () => void = () => undefined;
    const send = vi.fn();
    const runtime = {
      getState: () => snapshot,
      send,
      subscribe(listener: () => void) {
        notifyRuntime = listener;
        return () => undefined;
      }
    };
    const detach = attachStoryInput({
      runtime: runtime as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
      getCurrentScene: () => scene as 'pattern' | 'aod-animation',
      getLayerElement: () => null
    });
    const emit = (deltaY: number) => {
      const event = {
        cancelable: true,
        deltaMode: 0,
        deltaY,
        preventDefault: vi.fn(),
        target: null
      } as unknown as WheelEvent;
      for (const listener of listeners.get('wheel') ?? []) listener(event);
    };

    emit(120);
    snapshot = next as unknown as Record<string, unknown>;
    notifyRuntime();
    send.mockClear();

    vi.advanceTimersByTime(16);
    emit(80);
    vi.advanceTimersByTime(16);
    emit(40);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(221);
    emit(60);
    vi.advanceTimersByTime(16);
    emit(40);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));
    detach();
  });
});
