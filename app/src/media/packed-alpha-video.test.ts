import { describe, expect, it, vi } from 'vitest';
import {
  PACKED_ALPHA_SOURCE_TYPE,
  createPackedAlphaVideoCompositor,
  packedAlphaFrameProofSatisfied,
  packedAlphaFrameSize,
  createPackedAlphaWebGlRestoreOwner,
  releasePackedAlphaWebGlContext
} from './packed-alpha-video';

describe('packed alpha video', () => {
  it('maps the side-by-side H.264 frame back to the authored dimensions', () => {
    expect(packedAlphaFrameSize(1_440, 1_280)).toEqual({
      width: 720,
      height: 1_280
    });
    expect(packedAlphaFrameSize(3_344, 942)).toEqual({
      width: 1_672,
      height: 942
    });
  });

  it('uses an iPhone-compatible opaque decoder source', () => {
    expect(PACKED_ALPHA_SOURCE_TYPE).toContain('video/mp4');
    expect(PACKED_ALPHA_SOURCE_TYPE).toContain('avc1');
  });

  it('[convergence] accepts a packed frame only after a live no-error WebGL draw', () => {
    const clean = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0),
      isContextLost: vi.fn(() => false)
    } as unknown as WebGLRenderingContext;
    const errored = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0x0502),
      isContextLost: vi.fn(() => false)
    } as unknown as WebGLRenderingContext;
    const lost = {
      NO_ERROR: 0,
      getError: vi.fn(() => 0),
      isContextLost: vi.fn(() => true)
    } as unknown as WebGLRenderingContext;

    expect(packedAlphaFrameProofSatisfied(clean)).toBe(true);
    expect(packedAlphaFrameProofSatisfied(errored)).toBe(false);
    expect(packedAlphaFrameProofSatisfied(lost)).toBe(false);
  });

  it('[P0 AOD failure contract] returns a typed compositor failure instead of a false render sentinel', () => {
    const canvas = {
      dataset: {} as DOMStringMap,
      getContext: vi.fn(() => null)
    } as unknown as HTMLCanvasElement;
    const onFailure = vi.fn();
    const compositor = createPackedAlphaVideoCompositor({
      video: {} as HTMLVideoElement,
      canvas,
      onFailure
    });

    expect(compositor.render()).toBe('webgl-unavailable');
    expect(canvas.dataset.packedAlphaStatus).toBe('webgl-unavailable');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('webgl-unavailable');
  });

  it('hard-releases the compositor context when a packed surface retires', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));

    releasePackedAlphaWebGlContext({
      getExtension
    } as unknown as WebGLRenderingContext);

    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('keeps a React-owned context loss restorable', () => {
    const loseContext = vi.fn();
    const preventDefault = vi.fn();
    let lostListener: ((event: Event) => void) | undefined;
    const canvas = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'webglcontextlost') {
          lostListener = listener as (event: Event) => void;
        }
      })
    };
    releasePackedAlphaWebGlContext({
      canvas,
      getExtension: vi.fn(() => ({ loseContext }))
    } as unknown as WebGLRenderingContext);

    lostListener?.({ preventDefault } as unknown as Event);

    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
      { once: true }
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('owns the same-canvas retire → restore token window and bounded fallback', () => {
    vi.useFakeTimers();
    let lost = false;
    const listeners = new Map<string, EventListener>();
    const extension = {
      loseContext: vi.fn(() => { lost = true; }),
      restoreContext: vi.fn(() => {
        lost = false;
        listeners.get('webglcontextrestored')?.(new Event('webglcontextrestored'));
      })
    };
    const context = {
      isContextLost: () => lost,
      getExtension: () => extension
    };
    const canvas = {
      getContext: vi.fn(() => context),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      })
    } as unknown as HTMLCanvasElement;

    const owner = createPackedAlphaWebGlRestoreOwner();
    const restored = vi.fn();
    const fallback = vi.fn();
    owner.retire(canvas);
    expect(owner.isPending()).toBe(true);
    expect(owner.wait(canvas, restored, fallback)).toBe(true);
    vi.advanceTimersByTime(0);
    expect(restored).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(owner.isPending()).toBe(false);

    const fallbackCanvas = {
      getContext: vi.fn(() => ({
        isContextLost: () => true,
        getExtension: () => null
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as HTMLCanvasElement;
    owner.markPending();
    owner.wait(fallbackCanvas, restored, fallback);
    vi.advanceTimersByTime(251);
    expect(fallback).toHaveBeenCalledOnce();
    expect(owner.isPending()).toBe(false);
    vi.useRealTimers();
  });

  it('invalidates a cancelled restore callback before a new wait lease', () => {
    vi.useFakeTimers();
    let listeners: Array<EventListener> = [];
    const extension = {
      loseContext: vi.fn(),
      restoreContext: vi.fn()
    };
    const context = {
      isContextLost: () => true,
      getExtension: () => extension
    };
    const canvas = {
      getContext: vi.fn(() => context),
      addEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      })
    } as unknown as HTMLCanvasElement;
    const owner = createPackedAlphaWebGlRestoreOwner();
    const first = vi.fn();
    const second = vi.fn();
    owner.markPending();
    owner.wait(canvas, first, vi.fn());
    vi.advanceTimersByTime(0);
    const stale = listeners[0];
    owner.cancel();
    owner.markPending();
    owner.wait(canvas, second, vi.fn());
    vi.advanceTimersByTime(0);
    const current = listeners[listeners.length - 1];
    stale?.(new Event('webglcontextrestored'));
    expect(first).not.toHaveBeenCalled();
    current?.(new Event('webglcontextrestored'));
    expect(second).toHaveBeenCalledOnce();
    expect(owner.isPending()).toBe(false);
    vi.useRealTimers();
  });

  it('accepts an already healthy context as the pending restore fact', () => {
    vi.useFakeTimers();
    const context = {
      isContextLost: () => false
    };
    const canvas = {
      getContext: vi.fn(() => context)
    } as unknown as HTMLCanvasElement;
    const owner = createPackedAlphaWebGlRestoreOwner();
    const restored = vi.fn();
    owner.markPending();
    owner.wait(canvas, restored, vi.fn());
    vi.advanceTimersByTime(0);
    expect(restored).toHaveBeenCalledOnce();
    expect(owner.isPending()).toBe(false);
    vi.useRealTimers();
  });
});
