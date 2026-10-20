// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { canvasLeaseGuard, createScrollCanvasWindow, getCanvasWebGlContext, renewWindowCanvas, retireDetachedCanvasContext, wasWindowManagedCanvas, windowOwnsCanvas } from './scroll-canvas-window';

function context(canvas: HTMLCanvasElement) {
  const loseContext = vi.fn();
  const gl = { canvas, isContextLost: () => false, getExtension: () => ({ loseContext }) } as unknown as WebGLRenderingContext;
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
  getCanvasWebGlContext(canvas, {});
  return loseContext;
}

function restorableContext(canvas: HTMLCanvasElement, deferred = false) {
  let lost = false;
  const restored = () => { lost = false; canvas.dispatchEvent(new Event('webglcontextrestored')); };
  const extension = {
    loseContext: vi.fn(() => {
      lost = true;
      setTimeout(() => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })), 0);
    }),
    restoreContext: vi.fn(() => { if (!deferred) restored(); })
  };
  const gl = { canvas, isContextLost: () => lost, getExtension: () => lost ? null : extension } as unknown as WebGLRenderingContext;
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
  getCanvasWebGlContext(canvas, {});
  return { gl, extension, restored };
}

describe('current-window canvas leases', () => {
  it('retires only a previously allocated, detached standalone context without probing the canvas', () => {
    const canvas = document.createElement('canvas'), unused = document.createElement('canvas');
    const lose = context(canvas), get = vi.mocked(canvas.getContext), unusedGet = vi.spyOn(unused, 'getContext');
    get.mockClear(); document.body.append(canvas);
    retireDetachedCanvasContext(canvas);
    expect(lose).not.toHaveBeenCalled();
    canvas.remove(); retireDetachedCanvasContext(canvas); retireDetachedCanvasContext(canvas);
    retireDetachedCanvasContext(unused);
    expect(lose).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled(); expect(unusedGet).not.toHaveBeenCalled();
  });
  it('leaves a detached window lease to its owner even after its renderer failed', () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const lease = owner.acquire('ink', document), lose = context(lease.canvas);
    retireDetachedCanvasContext(lease.canvas);
    expect(lose).not.toHaveBeenCalled();
    expect(owner.snapshot().webglContexts).toBe(1);
    owner.dispose();
    retireDetachedCanvasContext(lease.canvas);
    expect(lose).toHaveBeenCalledOnce();
  });
  it('releases every GPU resource in reading and restores a weakly held context only inside the next budget', async () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const first = owner.acquire('ink', document), original = first.canvas;
    const oldRenderer = canvasLeaseGuard(original), { gl, extension } = restorableContext(original);
    owner.configure(0); first.release();
    expect(gl.isContextLost()).toBe(true);
    expect(owner.snapshot()).toEqual({ canvases: 0, webglContexts: 0, active: 0, idle: 0 });
    await owner.restoreAvailable(new AbortController().signal);
    expect(extension.restoreContext).not.toHaveBeenCalled();
    owner.configure(1);
    await owner.restoreAvailable(new AbortController().signal);
    expect(owner.snapshot()).toEqual({ canvases: 1, webglContexts: 1, active: 0, idle: 1 });
    expect(extension.restoreContext).toHaveBeenCalledOnce();
    const next = owner.acquire('packed-alpha', document);
    expect(next.canvas).toBe(original); expect(oldRenderer()).toBe(false);
    first.release(); expect(next.current()).toBe(true);
    owner.dispose(); expect(gl.isContextLost()).toBe(true);
  });
  it.each(['abort', 'dispose'] as const)('retires a late restoration after %s instead of retaining a hidden live context', async (action) => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const first = owner.acquire('ink', document), { gl, extension, restored } = restorableContext(first.canvas, true);
    owner.configure(0); first.release(); owner.configure(1);
    const controller = new AbortController(), ready = owner.restoreAvailable(controller.signal);
    await vi.waitFor(() => expect(extension.restoreContext).toHaveBeenCalledOnce());
    if (action === 'dispose') owner.dispose();
    else { controller.abort(); owner.configure(0); }
    restored(); await ready;
    expect(owner.snapshot()).toEqual({ canvases: 0, webglContexts: 0, active: 0, idle: 0 });
    expect(gl.isContextLost()).toBe(true);
    owner.dispose();
  });
  it('fails closed on restoration timeout and also releases a subsequent late event', async () => {
    vi.useFakeTimers();
    const owner = createScrollCanvasWindow(); owner.configure(1);
    try {
      const first = owner.acquire('ink', document), { gl, restored } = restorableContext(first.canvas, true);
      owner.configure(0); first.release(); owner.configure(1);
      const rejected = expect(owner.restoreAvailable(new AbortController().signal)).rejects.toThrow('画布恢复超时');
      await vi.advanceTimersByTimeAsync(3001); await rejected;
      expect(owner.snapshot().canvases).toBe(0);
      restored(); expect(gl.isContextLost()).toBe(true);
    } finally { owner.dispose(); vi.useRealTimers(); }
  });
  it('reuses compatible canvases without retiring their contexts and rejects stale leases', () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const first = owner.acquire('ink', document), lose = context(first.canvas);
    const accepted = canvasLeaseGuard(first.canvas);
    first.canvas.dataset.oldGeneration = 'old'; first.release();
    const next = owner.acquire('ink', document);
    expect(next.canvas).toBe(first.canvas); expect(accepted()).toBe(false);
    expect(next.canvas.dataset.oldGeneration).toBeUndefined();
    first.release(); expect(next.current()).toBe(true); expect(lose).not.toHaveBeenCalled();
    owner.dispose(); expect(lose).toHaveBeenCalledOnce(); expect(next.current()).toBe(false);
  });
  it('reuses the same compatible context for a different shader purpose', () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const first = owner.acquire('ink', document), lose = context(first.canvas); first.release();
    const next = owner.acquire('packed-alpha', document);
    expect(next.canvas).toBe(first.canvas); expect(lose).not.toHaveBeenCalled();
    expect(owner.snapshot()).toMatchObject({ canvases: 1, idle: 0 });
    owner.dispose();
  });
  it('counts idle contexts and keeps none when the next reading window has a zero budget', () => {
    const owner = createScrollCanvasWindow(); owner.configure(2);
    const a = owner.acquire('ink', document), b = owner.acquire('packed-alpha', document);
    const loseA = context(a.canvas), loseB = context(b.canvas);
    a.release(); expect(owner.snapshot()).toMatchObject({ active: 1, idle: 1, webglContexts: 2 });
    owner.configure(0); expect(loseA).toHaveBeenCalledOnce();
    b.release(); expect(loseB).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toEqual({ active: 0, idle: 0, webglContexts: 0, canvases: 0 });
    expect(windowOwnsCanvas(b.canvas)).toBe(false);
  });
  it('never allocates an unused WebGL context merely to dispose a canvas', () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const lease = owner.acquire('ink', document), get = vi.spyOn(lease.canvas, 'getContext');
    owner.dispose(); expect(get).not.toHaveBeenCalled();
    expect(wasWindowManagedCanvas(lease.canvas)).toBe(true);
    expect(windowOwnsCanvas(lease.canvas)).toBe(false);
  });
  it('renews a failed context inside its lease and invalidates the old renderer', () => {
    const owner = createScrollCanvasWindow(); owner.configure(1);
    const lease = owner.acquire('packed-alpha', document), original = lease.canvas;
    const lose = context(original), valid = canvasLeaseGuard(original);
    const replacement = renewWindowCanvas(original);
    expect(lease.canvas).toBe(replacement); expect(lease.current()).toBe(true);
    expect(valid()).toBe(false); expect(lose).toHaveBeenCalledOnce();
    lease.release(); owner.configure(0);
    expect(owner.snapshot().canvases).toBe(0);
  });
});
