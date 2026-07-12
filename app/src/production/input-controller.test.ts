import { afterEach, describe, expect, it, vi } from 'vitest';
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
    vi.unstubAllGlobals();
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

  it('uses one PageDown at the edge as the complete 10svh commitment intent', () => {
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
      type: 'INPUT_DELTA',
      delta: 0.1,
      source: 'key'
    }));
    detach();
  });
});
