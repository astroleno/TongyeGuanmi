import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as packedAlphaVideo from './packed-alpha-video';

const {
  PACKED_ALPHA_SOURCE_TYPE,
  createPackedAlphaVideoCompositor,
  packedAlphaFrameSize
} = packedAlphaVideo;

type PackedAlphaRetirementContract = typeof packedAlphaVideo & {
  releasePackedAlphaWebGlContext(gl: WebGLRenderingContext): void;
  renewPackedAlphaCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement;
};

const retirementContract = packedAlphaVideo as PackedAlphaRetirementContract;

type EventListenerProbe = (event: Event) => void;

function createGlProbe(options: Readonly<{
  textureAvailable?: boolean;
  frameUploadFails?: boolean;
}> = {}) {
  const loseContext = vi.fn();
  const resources = {
    vertex: { kind: 'vertex' },
    fragment: { kind: 'fragment' },
    program: { kind: 'program' },
    buffer: { kind: 'buffer' },
    texture: { kind: 'texture' }
  };
  let shaderIndex = 0;
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    TEXTURE0: 0x84c0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TRIANGLES: 0x0004,
    COLOR_BUFFER_BIT: 0x4000,
    createShader: vi.fn(() => (
      shaderIndex++ === 0 ? resources.vertex : resources.fragment
    )),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => resources.program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => resources.buffer),
    deleteBuffer: vi.fn(),
    createTexture: vi.fn(() => (
      options.textureAvailable === false ? null : resources.texture
    )),
    deleteTexture: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({ kind: 'uniform' })),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    uniform1i: vi.fn(),
    clearColor: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    activeTexture: vi.fn(),
    texImage2D: vi.fn(() => {
      if (options.frameUploadFails) throw new Error('frame upload failed');
    }),
    uniform1f: vi.fn(),
    drawArrays: vi.fn(),
    flush: vi.fn(),
    getExtension: vi.fn((name: string) => (
      name === 'WEBGL_lose_context' ? { loseContext } : null
    ))
  };
  return {
    gl: gl as unknown as WebGLRenderingContext,
    loseContext,
    resources,
    spies: gl
  };
}

class VideoProbe {
  readonly listeners = new Map<string, Set<EventListenerProbe>>();
  readonly cancelVideoFrameCallback = vi.fn();
  readonly requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
    this.pendingVideoFrame = callback;
    return 41;
  });
  pendingVideoFrame: VideoFrameRequestCallback | null = null;
  readyState = 0;
  videoWidth = 1_440;
  videoHeight = 1_280;
  currentTime = 0;
  paused = false;
  ended = false;

  addEventListener(type: string, listener: EventListenerProbe) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerProbe>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerProbe) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class CanvasProbe {
  readonly listeners = new Map<string, Set<EventListenerProbe>>();
  readonly dataset: DOMStringMap = {};
  readonly getContext = vi.fn(() => this.gl);
  readonly replaceWith = vi.fn();
  width = 300;
  height = 150;
  clone: CanvasProbe | null = null;

  constructor(readonly gl: WebGLRenderingContext) {}

  cloneNode() {
    if (!this.clone) {
      throw new Error('clone must be assigned before renewal');
    }
    Object.assign(this.clone.dataset, this.dataset);
    return this.clone;
  }

  addEventListener(type: string, listener: EventListenerProbe) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerProbe>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerProbe) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const requestAnimationFrame = vi.fn(() => 73);
const cancelAnimationFrame = vi.fn();

beforeEach(() => {
  requestAnimationFrame.mockClear();
  cancelAnimationFrame.mockClear();
  vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('window', {
    requestAnimationFrame,
    cancelAnimationFrame
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('hard-releases the compositor context when a packed surface retires', () => {
    const probe = createGlProbe();

    retirementContract.releasePackedAlphaWebGlContext(probe.gl);

    expect(probe.spies.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(probe.loseContext).toHaveBeenCalledOnce();
  });

  it('renews the canvas backing store without preserving a retired valid frame', () => {
    const retiredGl = createGlProbe();
    const renewedGl = createGlProbe();
    const retired = new CanvasProbe(retiredGl.gl);
    const renewed = new CanvasProbe(renewedGl.gl);
    retired.clone = renewed;
    retired.dataset.packedAlphaStatus = 'ready';
    retired.dataset.packedAlphaFrameReady = 'true';
    retired.dataset.packedAlphaFrame = '12';
    retired.dataset.packedAlphaMediaTime = '1.2500';
    retired.dataset.packedAlphaCompositorActive = 'true';

    const result = retirementContract.renewPackedAlphaCanvas(
      retired as unknown as HTMLCanvasElement
    );

    expect(result).toBe(renewed);
    expect(retired.replaceWith).toHaveBeenCalledWith(renewed);
    expect(retired.width).toBe(1);
    expect(retired.height).toBe(1);
    expect(renewed.width).toBe(1);
    expect(renewed.height).toBe(1);
    for (const canvas of [retired, renewed]) {
      expect(canvas.dataset.packedAlphaStatus).toBeUndefined();
      expect(canvas.dataset.packedAlphaFrameReady).toBeUndefined();
      expect(canvas.dataset.packedAlphaFrame).toBeUndefined();
      expect(canvas.dataset.packedAlphaMediaTime).toBeUndefined();
      expect(canvas.dataset.packedAlphaCompositorActive).toBeUndefined();
    }
  });

  it('cancels scheduled work and releases every GL resource on disposal', () => {
    const probe = createGlProbe();
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    const onFrame = vi.fn();
    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement,
      onFrame
    });

    video.dispatch('play');
    compositor.dispose();
    compositor.dispose();

    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(41);
    expect(probe.spies.deleteTexture).toHaveBeenCalledWith(probe.resources.texture);
    expect(probe.spies.deleteBuffer).toHaveBeenCalledWith(probe.resources.buffer);
    expect(probe.spies.deleteProgram).toHaveBeenCalledWith(probe.resources.program);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.vertex);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.fragment);
    expect(probe.loseContext).toHaveBeenCalledOnce();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('preserves a reactivatable context and can upgrade dormant cleanup to terminal retirement', () => {
    const probe = createGlProbe();
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement
    });

    compositor.dispose('reactivatable');

    expect(probe.spies.deleteTexture).toHaveBeenCalledWith(probe.resources.texture);
    expect(probe.spies.deleteBuffer).toHaveBeenCalledWith(probe.resources.buffer);
    expect(probe.spies.deleteProgram).toHaveBeenCalledWith(probe.resources.program);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.vertex);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.fragment);
    expect(probe.loseContext).not.toHaveBeenCalled();

    compositor.dispose('terminal');
    compositor.dispose('terminal');

    expect(probe.loseContext).toHaveBeenCalledOnce();
  });

  it('cancels a pending RAF fallback on disposal', () => {
    const probe = createGlProbe();
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    Object.defineProperty(video, 'cancelVideoFrameCallback', { value: undefined });
    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement
    });

    video.dispatch('play');
    compositor.dispose();

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(73);
    expect(probe.loseContext).toHaveBeenCalledOnce();
  });

  it('cleans a partially initialized compositor and never reports a frame', () => {
    const probe = createGlProbe({ textureAvailable: false });
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    const onFrame = vi.fn();
    const onFailure = vi.fn();

    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement,
      onFrame,
      onFailure
    });

    expect(canvas.dataset.packedAlphaStatus).toBe('setup-failed');
    expect(onFailure).toHaveBeenCalledWith({
      code: 'setup-failed', message: 'Packed-alpha WebGL setup failed'
    });
    expect(probe.spies.deleteBuffer).toHaveBeenCalledWith(probe.resources.buffer);
    expect(probe.spies.deleteProgram).toHaveBeenCalledWith(probe.resources.program);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.vertex);
    expect(probe.spies.deleteShader).toHaveBeenCalledWith(probe.resources.fragment);
    expect(probe.loseContext).not.toHaveBeenCalled();
    expect(onFrame).not.toHaveBeenCalled();

    compositor.dispose();
    expect(probe.loseContext).toHaveBeenCalledOnce();
    expect(canvas.dataset.packedAlphaStatus).toBeUndefined();
  });

  it('invalidates and cancels the compositor when its context is lost', () => {
    const probe = createGlProbe();
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    const onFrame = vi.fn();
    const onFailure = vi.fn();
    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement,
      onFrame,
      onFailure
    });
    canvas.dataset.packedAlphaFrameReady = 'true';
    canvas.dataset.packedAlphaFrame = '3';
    canvas.dataset.packedAlphaMediaTime = '0.3000';
    video.dispatch('play');
    const preventDefault = vi.fn();

    canvas.dispatch(
      'webglcontextlost',
      { preventDefault } as unknown as Event
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(41);
    expect(canvas.dataset.packedAlphaStatus).toBe('context-lost');
    expect(onFailure).toHaveBeenCalledWith({
      code: 'context-lost', message: 'Packed-alpha WebGL context was lost'
    });
    expect(canvas.dataset.packedAlphaFrameReady).toBeUndefined();
    expect(canvas.dataset.packedAlphaFrame).toBeUndefined();
    expect(canvas.dataset.packedAlphaMediaTime).toBeUndefined();
    expect(compositor.render()).toBe(false);
    expect(onFrame).not.toHaveBeenCalled();

    compositor.dispose();
    expect(probe.loseContext).toHaveBeenCalledOnce();
  });

  it('pauses scheduling without erasing the last causally drawn rollback frame', () => {
    const probe = createGlProbe();
    const canvas = new CanvasProbe(probe.gl);
    const video = new VideoProbe();
    video.readyState = 2;
    const compositor = createPackedAlphaVideoCompositor({
      canvas: canvas as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement
    });
    expect(canvas.dataset.packedAlphaFrameReady).toBe('true');
    const draws = probe.spies.drawArrays.mock.calls.length;

    compositor.setActive(false);

    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    expect(canvas.dataset.packedAlphaStatus).toBe('suspended-retained');
    expect(canvas.dataset.packedAlphaFrameReady).toBe('true');
    expect(probe.spies.drawArrays).toHaveBeenCalledTimes(draws);
    compositor.dispose();
  });

  it('reports unavailable WebGL and a failed frame upload synchronously', () => {
    const unavailableCanvas = new CanvasProbe(
      null as unknown as WebGLRenderingContext
    );
    const unavailableFailure = vi.fn();
    createPackedAlphaVideoCompositor({
      canvas: unavailableCanvas as unknown as HTMLCanvasElement,
      video: new VideoProbe() as unknown as HTMLVideoElement,
      onFailure: unavailableFailure
    });
    expect(unavailableFailure).toHaveBeenCalledWith({
      code: 'webgl-unavailable', message: 'Packed-alpha WebGL is unavailable'
    });

    const probe = createGlProbe({ frameUploadFails: true });
    const video = new VideoProbe();
    video.readyState = 2;
    const uploadFailure = vi.fn();
    const compositor = createPackedAlphaVideoCompositor({
      canvas: new CanvasProbe(probe.gl) as unknown as HTMLCanvasElement,
      video: video as unknown as HTMLVideoElement,
      onFailure: uploadFailure
    });
    expect(compositor.render()).toBe(false);
    expect(uploadFailure).toHaveBeenCalledWith({
      code: 'frame-upload-failed', message: 'Packed-alpha frame upload failed'
    });
    compositor.dispose();
  });

  it('uses a renewed backing context after activate-dispose-activate', () => {
    const firstGl = createGlProbe();
    const secondGl = createGlProbe();
    const firstCanvas = new CanvasProbe(firstGl.gl);
    const secondCanvas = new CanvasProbe(secondGl.gl);
    firstCanvas.clone = secondCanvas;
    const firstVideo = new VideoProbe();
    const secondVideo = new VideoProbe();

    const first = createPackedAlphaVideoCompositor({
      canvas: firstCanvas as unknown as HTMLCanvasElement,
      video: firstVideo as unknown as HTMLVideoElement
    });
    first.dispose();
    const renewed = retirementContract.renewPackedAlphaCanvas(
      firstCanvas as unknown as HTMLCanvasElement
    );
    const second = createPackedAlphaVideoCompositor({
      canvas: renewed,
      video: secondVideo as unknown as HTMLVideoElement
    });

    expect(firstCanvas.getContext).toHaveBeenCalledOnce();
    expect(secondCanvas.getContext).toHaveBeenCalledOnce();
    expect(firstGl.loseContext).toHaveBeenCalledOnce();
    expect(secondGl.loseContext).not.toHaveBeenCalled();

    second.dispose();
    expect(secondGl.loseContext).toHaveBeenCalledOnce();
  });
});
