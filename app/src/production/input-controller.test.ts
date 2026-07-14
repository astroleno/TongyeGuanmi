import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from '../runtime/director.actor';
import { attachStoryInput, canScrollNatively } from './input-controller';

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

  it('captures wheel input over Method sticky copy and scrolls its nested list first', () => {
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
    const preventDefault = vi.fn();
    const wheel = {
      cancelable: true,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: { className: 'r4-method__lead' }
    } as unknown as WheelEvent;

    for (const listener of listeners.get('wheel') ?? []) {
      listener(wheel);
    }

    expect(scrollport.scrollTop).toBe(120);
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

  it('arms the reading edge on one PageDown and commits on the next discrete key gesture', () => {
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
    expect(send).not.toHaveBeenCalled();
    expect(emitPageDown().preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: 1
    }));
    detach();
  });

  it('requires a second 16px wheel gesture at both reading edges before leaving the scene', () => {
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
    const { root, scrollport } = readingRoot(1000);
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

    emit(24);
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

    scrollport.scrollTop = 0;
    vi.advanceTimersByTime(221);
    emit(-24);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(221);
    emit(-16);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'CHARGE_FIRED',
      direction: -1
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
});
