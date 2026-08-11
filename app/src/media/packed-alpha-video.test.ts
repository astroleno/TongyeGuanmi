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

  it('[P0 PH frame evidence] forwards the same rVFC mediaTime stamped before drawArrays', () => {
    const listeners = new Map<string, EventListener>();
    let callback: ((now: number, metadata: { mediaTime: number }) => void) | undefined;
    let callbackId = 0;
    const gl = {
      NO_ERROR: 0,
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      ARRAY_BUFFER: 5,
      STATIC_DRAW: 6,
      FLOAT: 7,
      TEXTURE_2D: 8,
      TEXTURE_MIN_FILTER: 9,
      TEXTURE_MAG_FILTER: 10,
      LINEAR: 11,
      TEXTURE_WRAP_S: 12,
      TEXTURE_WRAP_T: 13,
      CLAMP_TO_EDGE: 14,
      UNPACK_FLIP_Y_WEBGL: 15,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 16,
      TEXTURE0: 17,
      RGBA: 18,
      UNSIGNED_BYTE: 19,
      COLOR_BUFFER_BIT: 20,
      TRIANGLES: 21,
      canvas: {} as HTMLCanvasElement,
      getShaderParameter: vi.fn(() => true),
      getProgramParameter: vi.fn(() => true),
      getError: vi.fn(() => 0),
      isContextLost: vi.fn(() => false),
      getExtension: vi.fn(() => null),
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      deleteProgram: vi.fn(),
      createBuffer: vi.fn(() => ({})),
      createTexture: vi.fn(() => ({})),
      deleteBuffer: vi.fn(),
      deleteTexture: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      getUniformLocation: vi.fn(() => ({})),
      useProgram: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      bindTexture: vi.fn(),
      texParameteri: vi.fn(),
      pixelStorei: vi.fn(),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      clearColor: vi.fn(),
      viewport: vi.fn(),
      clear: vi.fn(),
      activeTexture: vi.fn(),
      texImage2D: vi.fn(),
      drawArrays: vi.fn(),
      flush: vi.fn()
    } as unknown as WebGLRenderingContext;
    const canvas = {
      width: 0,
      height: 0,
      dataset: {} as DOMStringMap,
      getContext: vi.fn(() => gl),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn()
    } as unknown as HTMLCanvasElement;
    (gl as WebGLRenderingContext & { canvas: HTMLCanvasElement }).canvas = canvas;
    const video = {
      readyState: 2,
      videoWidth: 4,
      videoHeight: 2,
      currentTime: 0,
      paused: true,
      ended: false,
      dataset: {} as DOMStringMap,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(`video:${type}`, listener);
      }),
      removeEventListener: vi.fn(),
      requestVideoFrameCallback: vi.fn((next: typeof callback) => {
        callback = next;
        return ++callbackId;
      }),
      cancelVideoFrameCallback: vi.fn()
    } as unknown as HTMLVideoElement;
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal('window', {
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn()
    });
    const reported: Array<number | null> = [];
    const compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: (mediaTime) => reported.push(mediaTime)
    });

    const pendingFrame = callback;
    listeners.get('video:pause')?.({ type: 'pause' } as Event);
    listeners.get('video:timeupdate')?.({ type: 'timeupdate' } as Event);
    expect(video.cancelVideoFrameCallback).not.toHaveBeenCalled();
    pendingFrame?.(0, { mediaTime: 4.125 });

    expect(gl.drawArrays).toHaveBeenCalled();
    expect(canvas.dataset.packedAlphaStatus).toBe('ready');
    expect(reported.at(-1)).toBe(4.125);
    compositor.dispose();
    vi.unstubAllGlobals();
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
    const listeners = new Map<string, EventListener[]>();
    const dispatch = (type: string) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ preventDefault: vi.fn() } as unknown as Event);
      }
    };
    const extension = {
      loseContext: vi.fn(() => {
        lost = true;
        dispatch('webglcontextlost');
      }),
      restoreContext: vi.fn(() => {
        lost = false;
        dispatch('webglcontextrestored');
      })
    };
    const context = {
      isContextLost: () => lost,
      getExtension: () => extension
    };
    const canvas = {
      getContext: vi.fn(() => context),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((candidate) => candidate !== listener)
        );
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

  it('waits for the context-lost event before asking WebKit to restore', () => {
    vi.useFakeTimers();
    let lost = false;
    const listeners = new Map<string, EventListener[]>();
    const dispatch = (type: string) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ preventDefault: vi.fn() } as unknown as Event);
      }
    };
    const extension = {
      loseContext: vi.fn(() => { lost = true; }),
      restoreContext: vi.fn(() => {
        lost = false;
        dispatch('webglcontextrestored');
      })
    };
    const context = {
      isContextLost: () => lost,
      getExtension: () => extension
    };
    const canvas = {
      getContext: vi.fn(() => context),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((candidate) => candidate !== listener)
        );
      })
    } as unknown as HTMLCanvasElement;
    const owner = createPackedAlphaWebGlRestoreOwner();
    const restored = vi.fn();
    const fallback = vi.fn();

    owner.retire(canvas);
    owner.wait(canvas, restored, fallback);
    vi.advanceTimersByTime(0);
    expect(extension.restoreContext).not.toHaveBeenCalled();

    dispatch('webglcontextlost');
    vi.advanceTimersByTime(1);
    expect(extension.restoreContext).toHaveBeenCalledOnce();
    expect(restored).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
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

  it('falls back when restoreContext is accepted but no healthy context or restored event arrives', () => {
    vi.useFakeTimers();
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
      addEventListener: vi.fn()
    } as unknown as HTMLCanvasElement;
    const owner = createPackedAlphaWebGlRestoreOwner();
    const restored = vi.fn();
    const fallback = vi.fn();

    owner.markPending();
    owner.wait(canvas, restored, fallback);
    vi.advanceTimersByTime(251);

    expect(extension.restoreContext).toHaveBeenCalledOnce();
    expect(restored).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
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
