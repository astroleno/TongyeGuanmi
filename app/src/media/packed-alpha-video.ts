export const PACKED_ALPHA_SOURCE_TYPE = 'video/mp4; codecs="avc1"';

export type PackedAlphaFrameSize = Readonly<{
  width: number;
  height: number;
}>;

/** Terminal renderer facts are explicit; waiting for media is not a failure. */
export type PackedAlphaRenderFailure =
  | 'webgl-unavailable'
  | 'upload-failed'
  | 'draw-failed'
  | 'context-lost';

export type PackedAlphaRenderResult = 'rendered' | 'waiting' | PackedAlphaRenderFailure;

export type PackedAlphaVideoCompositor = Readonly<{
  render(): PackedAlphaRenderResult;
  setActive(active: boolean): void;
  dispose(): void;
}>;

type PackedAlphaLoseContextExtension = Readonly<{
  loseContext(): void;
  restoreContext(): void;
}>;

// Browsers return null from getExtension() once a WebGL context is already
// lost. Retain the extension object before loss so the same Canvas can be
// restored without allocating a new context on the next route lease.
const restorableContextExtensions = new WeakMap<
  HTMLCanvasElement,
  PackedAlphaLoseContextExtension
>();

export function releasePackedAlphaWebGlContext(
  gl: WebGLRenderingContext
): void {
  // `loseContext()` is intentionally used as a bounded resource release for
  // React-owned canvases.  Keep the loss restorable: WebGL otherwise treats a
  // synthetic loss without a preventDefault() listener as permanent, leaving
  // the same DOM canvas unusable on the next route activation.
  const canvas = gl.canvas as (HTMLCanvasElement | OffscreenCanvas | undefined);
  const extension = gl.getExtension('WEBGL_lose_context') as
    | PackedAlphaLoseContextExtension
    | null;
  if (
    canvas
    && typeof (canvas as HTMLCanvasElement).addEventListener === 'function'
    && extension
  ) {
    restorableContextExtensions.set(
      canvas as HTMLCanvasElement,
      extension
    );
  }
  canvas?.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
  }, { once: true });
  extension?.loseContext();
}

/**
 * Re-arm a React-owned canvas after the compositor deliberately retired its
 * context.  The caller remains the lifecycle owner: this helper only waits
 * for the browser's restore fact and never creates a compositor itself.
 */
export function restorePackedAlphaWebGlContext(
  canvas: HTMLCanvasElement,
  onRestored: () => void
): boolean {
  const gl = canvas.getContext('webgl');
  if (!gl || !gl.isContextLost()) return false;
  const extension = restorableContextExtensions.get(canvas)
    ?? gl.getExtension('WEBGL_lose_context') as
      | PackedAlphaLoseContextExtension
      | null;
  if (!extension) return false;
  canvas.addEventListener('webglcontextrestored', onRestored, { once: true });
  extension.restoreContext();
  return true;
}

/** Shared retire/restore lifecycle for retained packed-alpha canvases. */
export type PackedAlphaWebGlRestoreOwner = Readonly<{
  isPending(): boolean;
  markPending(): void;
  retire(canvas: HTMLCanvasElement): void;
  wait(canvas: HTMLCanvasElement, onRestored: () => void, onFallback: () => void): boolean;
  cancel(): void;
  clear(): void;
}>;

export function createPackedAlphaWebGlRestoreOwner(
  timeoutMs = 250
): PackedAlphaWebGlRestoreOwner {
  let pending = false;
  let poll: ReturnType<typeof globalThis.setTimeout> | undefined;
  let generation = 0;
  let retiredCanvas: HTMLCanvasElement | undefined;
  let retireLossAcknowledged = true;
  let retireLossListener: EventListener | undefined;
  const clearPoll = () => {
    if (poll !== undefined) globalThis.clearTimeout(poll);
    poll = undefined;
  };
  const clearRetireLossObservation = () => {
    if (retiredCanvas && retireLossListener) {
      retiredCanvas.removeEventListener('webglcontextlost', retireLossListener);
    }
    retiredCanvas = undefined;
    retireLossListener = undefined;
    retireLossAcknowledged = true;
  };
  const invalidate = () => {
    generation += 1;
    clearPoll();
  };
  return {
    isPending: () => pending,
    markPending: () => {
      invalidate();
      pending = true;
    },
    retire: (canvas) => {
      invalidate();
      clearRetireLossObservation();
      pending = true;
      const context = canvas.getContext('webgl');
      if (!context || context.isContextLost()) {
        retireLossAcknowledged = true;
        return;
      }
      retiredCanvas = canvas;
      retireLossAcknowledged = false;
      retireLossListener = () => {
        retireLossAcknowledged = true;
      };
      // WebKit rejects restoreContext() until the synthetic loss event has
      // been dispatched and cancelled. Observe that fact before issuing the
      // loss; polling isContextLost() alone becomes true too early.
      canvas.addEventListener('webglcontextlost', retireLossListener, { once: true });
      releasePackedAlphaWebGlContext(context);
    },
    wait: (canvas, onRestored, onFallback) => {
      if (!pending) return false;
      invalidate();
      const waitGeneration = generation;
      const deadline = Date.now() + timeoutMs;
      let restoreRequested = false;
      const finish = (callback: () => void) => {
        if (waitGeneration !== generation) return;
        clearPoll();
        pending = false;
        clearRetireLossObservation();
        callback();
      };
      const pollRestore = () => {
        if (waitGeneration !== generation) return;
        const context = canvas.getContext('webgl');
      // A browser may have restored the retained context before the owner
      // was asked to wait. Treat that healthy context as the restore fact.
        if (context && !context.isContextLost()) {
          finish(onRestored);
          return;
        }
        if (context?.isContextLost()) {
          const waitingForRetireLoss = retiredCanvas === canvas
            && !retireLossAcknowledged;
          if (!waitingForRetireLoss && !restoreRequested) {
            restoreRequested = restorePackedAlphaWebGlContext(
              canvas,
              () => finish(onRestored)
            );
          }
          // `restoreContext()` can be rejected asynchronously by the browser
          // without throwing or emitting `webglcontextrestored`. Keep the
          // bounded poll alive until the context is healthy or fallback wins.
          if (waitGeneration !== generation || !pending) return;
        }
        if (Date.now() >= deadline) {
          finish(onFallback);
          return;
        }
        poll = globalThis.setTimeout(pollRestore, 0);
      };
      pollRestore();
      return true;
    },
    cancel: invalidate,
    clear: () => {
      invalidate();
      pending = false;
      clearRetireLossObservation();
    }
  };
}

export function renewPackedAlphaCanvas(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  // React owns the Hero/AOD canvas nodes. Reset the drawing buffer in place so
  // the compositor can retire its WebGL resources without replacing the DOM
  // node behind React's ref/Fiber. Group 6/7 surfaces have a separate owner
  // and create/remove their canvas themselves; this helper is deliberately
  // only for the React-owned scenes.
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

type PackedAlphaVideoOptions = Readonly<{
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onFrame?: () => void;
  onFailure?: (failure: PackedAlphaRenderFailure) => void;
  /**
   * Surface-owned canvases are removed on release and can hard-lose their
   * context. React-owned canvases stay mounted and must be reusable by the
   * same ref, so their owner only deletes GL resources.
   */
  releaseContextOnDispose?: boolean;
}>;

type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const VERTEX_SOURCE = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SOURCE = `
  precision mediump float;

  varying vec2 vUv;
  uniform sampler2D uPackedFrame;
  uniform float uTexelX;

  void main() {
    float colorX = mix(uTexelX, 0.5 - uTexelX, vUv.x);
    float alphaX = mix(0.5 + uTexelX, 1.0 - uTexelX, vUv.x);
    vec4 color = texture2D(uPackedFrame, vec2(colorX, vUv.y));
    vec3 matte = texture2D(uPackedFrame, vec2(alphaX, vUv.y)).rgb;
    float alpha = clamp(dot(matte, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);

    gl_FragColor = vec4(color.rgb * alpha, alpha);
  }
`;

export function packedAlphaFrameSize(
  packedWidth: number,
  packedHeight: number
): PackedAlphaFrameSize {
  return {
    width: Math.max(1, Math.floor(Math.max(2, packedWidth) / 2)),
    height: Math.max(1, Math.floor(Math.max(1, packedHeight)))
  };
}

/**
 * A DOM/media marker is not a compositor proof. The frame is publishable only
 * after the active context survives the draw and reports no GL error.
 */
export function packedAlphaFrameProofSatisfied(
  gl: Pick<WebGLRenderingContext, 'NO_ERROR' | 'getError' | 'isContextLost'>
): boolean {
  return !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
}

export function setPackedAlphaVideoSource(video: HTMLVideoElement, sourceUrl: string): void {
  const ownerDocument = video.ownerDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  video.pause();
  video.autoplay = false;
  video.loop = false;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('webkit-playsinline', 'true');
  video.dataset.packedAlphaSource = 'rgb-alpha-side-by-side';

  if (!ownerDocument || typeof video.replaceChildren !== 'function') {
    video.src = sourceUrl;
    video.load();
    return;
  }

  const source = ownerDocument.createElement('source');
  source.src = sourceUrl;
  source.type = PACKED_ALPHA_SOURCE_TYPE;
  source.dataset.alphaVideoFormat = 'packed';
  video.removeAttribute('src');
  video.replaceChildren(source);
  video.load();
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): Readonly<{
  program: WebGLProgram;
  vertex: WebGLShader;
  fragment: WebGLShader;
}> | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  return { program, vertex, fragment };
}

/**
 * Safari can decode an HEVC alpha plane correctly and still flatten it after
 * a paused seek. The mobile route therefore decodes one ordinary H.264 frame
 * containing RGB on the left and its grayscale matte on the right, then
 * composites both halves here. The browser never owns a transparent video
 * layer, so scroll scrubbing cannot turn the alpha plane into a white matte.
 */
export function createPackedAlphaVideoCompositor(
  options: PackedAlphaVideoOptions
): PackedAlphaVideoCompositor {
  const { video, canvas } = options;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false
  });
  if (!gl) {
    canvas.dataset.packedAlphaStatus = 'webgl-unavailable';
    return {
      render: () => {
        options.onFailure?.('webgl-unavailable');
        return 'webgl-unavailable';
      },
      setActive: () => undefined,
      dispose: () => {
        delete canvas.dataset.packedAlphaStatus;
      }
    };
  }

  const shaders = createProgram(gl);
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!shaders || !buffer || !texture) {
    canvas.dataset.packedAlphaStatus = 'webgl-unavailable';
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    return {
      render: () => {
        options.onFailure?.('webgl-unavailable');
        return 'webgl-unavailable';
      },
      setActive: () => undefined,
      dispose: () => {
        releasePackedAlphaWebGlContext(gl);
        delete canvas.dataset.packedAlphaStatus;
      }
    };
  }

  const { program, vertex, fragment } = shaders;
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const packedFrameLocation = gl.getUniformLocation(program, 'uPackedFrame');
  const texelLocation = gl.getUniformLocation(program, 'uTexelX');
  const managedVideo = video as VideoWithFrameCallbacks;
  let disposed = false;
  let active = true;
  let frameCallback = 0;
  let animationFrame = 0;
  let renderedFrames = 0;
  let contextLost = false;
  let terminalFailureReason: PackedAlphaRenderFailure | null = null;

  const terminalFailure = (failure: PackedAlphaRenderFailure): PackedAlphaRenderFailure => {
    if (terminalFailureReason) return terminalFailureReason;
    terminalFailureReason = failure;
    canvas.dataset.packedAlphaStatus = failure;
    delete canvas.dataset.packedAlphaFrameReady;
    options.onFailure?.(failure);
    return failure;
  };

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.uniform1i(packedFrameLocation, 0);
  gl.clearColor(0, 0, 0, 0);

  const render = (): PackedAlphaRenderResult => {
    if (terminalFailureReason) return terminalFailureReason;
    if (contextLost || gl.isContextLost()) {
      contextLost = true;
      return terminalFailure('context-lost');
    }
    if (
      disposed
      || !active
      || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || video.videoWidth < 2
      || video.videoHeight < 1
    ) {
      return 'waiting';
    }

    const frameSize = packedAlphaFrameSize(video.videoWidth, video.videoHeight);
    if (canvas.width !== frameSize.width) {
      canvas.width = frameSize.width;
    }
    if (canvas.height !== frameSize.height) {
      canvas.height = frameSize.height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!packedAlphaFrameProofSatisfied(gl)) {
      contextLost = gl.isContextLost();
      return terminalFailure(contextLost ? 'context-lost' : 'upload-failed');
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
      );
    } catch {
      return terminalFailure('upload-failed');
    }
    if (!packedAlphaFrameProofSatisfied(gl)) {
      contextLost = gl.isContextLost();
      return terminalFailure(contextLost ? 'context-lost' : 'upload-failed');
    }
    gl.useProgram(program);
    gl.uniform1f(texelLocation, 1 / Math.max(2, video.videoWidth));
    // Stamp the decoder time before the draw so instrumentation attached to
    // the WebGL call observes the exact media sample used by this frame.
    canvas.dataset.packedAlphaMediaTime = video.currentTime.toFixed(4);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!packedAlphaFrameProofSatisfied(gl)) {
      contextLost = gl.isContextLost();
      return terminalFailure(contextLost ? 'context-lost' : 'draw-failed');
    }
    renderedFrames += 1;
    canvas.dataset.packedAlphaStatus = 'ready';
    canvas.dataset.packedAlphaFrameReady = 'true';
    canvas.dataset.packedAlphaFrame = String(renderedFrames);
    options.onFrame?.();
    return 'rendered';
  };

  const schedule = () => {
    if (disposed || !active || contextLost || frameCallback || animationFrame) {
      return;
    }
    if (typeof managedVideo.requestVideoFrameCallback === 'function') {
      frameCallback = managedVideo.requestVideoFrameCallback(() => {
        frameCallback = 0;
        render();
        if (!video.paused && !video.ended) {
          schedule();
        }
      });
      return;
    }
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      render();
      if (!video.paused && !video.ended) {
        schedule();
      }
    });
  };

  const renderAndSchedule = () => {
    if (!active || contextLost) return;
    render();
    if (!video.paused && !video.ended) {
      schedule();
    }
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    terminalFailure('context-lost');
  };

  video.addEventListener('loadeddata', renderAndSchedule);
  video.addEventListener('seeked', renderAndSchedule);
  video.addEventListener('timeupdate', renderAndSchedule);
  video.addEventListener('play', schedule);
  video.addEventListener('pause', renderAndSchedule);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.dataset.packedAlphaStatus = 'waiting';
  canvas.dataset.packedAlphaCompositorActive = 'true';
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    renderAndSchedule();
  }

  const cancelScheduledFrame = () => {
    if (frameCallback && typeof managedVideo.cancelVideoFrameCallback === 'function') {
      managedVideo.cancelVideoFrameCallback(frameCallback);
    }
    frameCallback = 0;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };
  const clearPresentedFrame = () => {
    if (canvas.width > 0 && canvas.height > 0) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.flush();
    }
    delete canvas.dataset.packedAlphaFrameReady;
    delete canvas.dataset.packedAlphaFrame;
    delete canvas.dataset.packedAlphaMediaTime;
  };

  return {
    render,
    setActive(nextActive) {
      if (disposed || active === nextActive) return;
      active = nextActive;
      canvas.dataset.packedAlphaCompositorActive = String(active);
      if (!active) {
        cancelScheduledFrame();
        clearPresentedFrame();
        canvas.dataset.packedAlphaStatus = 'suspended';
        return;
      }
      if (contextLost) {
        terminalFailure('context-lost');
        return;
      }
      canvas.dataset.packedAlphaStatus = 'waiting';
      renderAndSchedule();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancelScheduledFrame();
      clearPresentedFrame();
      video.removeEventListener('loadeddata', renderAndSchedule);
      video.removeEventListener('seeked', renderAndSchedule);
      video.removeEventListener('timeupdate', renderAndSchedule);
      video.removeEventListener('play', schedule);
      video.removeEventListener('pause', renderAndSchedule);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (options.releaseContextOnDispose !== false) {
        releasePackedAlphaWebGlContext(gl);
      }
      delete canvas.dataset.packedAlphaStatus;
      delete canvas.dataset.packedAlphaFrameReady;
      delete canvas.dataset.packedAlphaFrame;
      delete canvas.dataset.packedAlphaMediaTime;
      delete canvas.dataset.packedAlphaCompositorActive;
    }
  };
}
