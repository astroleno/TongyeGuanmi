import { semanticBoolean } from '../runtime/semantic-data-attribute';

export const PACKED_ALPHA_SOURCE_TYPE = 'video/mp4; codecs="avc1"';

export type PackedAlphaFrameSize = Readonly<{
  width: number;
  height: number;
}>;

export type PackedAlphaContextRetirement = 'reactivatable' | 'terminal';

export type PackedAlphaVideoCompositor = Readonly<{
  render(): boolean;
  setActive(active: boolean): void;
  dispose(retirement?: PackedAlphaContextRetirement): void;
}>;

const PACKED_ALPHA_DATA_KEYS = [
  'packedAlphaStatus',
  'packedAlphaFrameReady',
  'packedAlphaFrame',
  'packedAlphaMediaTime',
  'packedAlphaCompositorActive'
] as const;

function clearPackedAlphaCanvasState(canvas: HTMLCanvasElement): void {
  for (const key of PACKED_ALPHA_DATA_KEYS) {
    delete canvas.dataset[key];
  }
}

export function releasePackedAlphaWebGlContext(
  gl: WebGLRenderingContext
): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

export function renewPackedAlphaCanvas(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  clearPackedAlphaCanvasState(canvas);
  canvas.width = 1;
  canvas.height = 1;
  const renewed = canvas.cloneNode(false) as HTMLCanvasElement;
  clearPackedAlphaCanvasState(renewed);
  renewed.width = 1;
  renewed.height = 1;
  canvas.replaceWith(renewed);
  return renewed;
}

type PackedAlphaVideoOptions = Readonly<{
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onFrame?: () => void;
  onFailure?: (failure: PackedAlphaVideoFailure) => void;
}>;

export type PackedAlphaVideoFailure = Readonly<{
  code: 'webgl-unavailable' | 'setup-failed' | 'frame-upload-failed' | 'context-lost';
  message: string;
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
    options.onFailure?.({
      code: 'webgl-unavailable', message: 'Packed-alpha WebGL is unavailable'
    });
    return {
      render: () => false,
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
    canvas.dataset.packedAlphaStatus = 'setup-failed';
    options.onFailure?.({
      code: 'setup-failed', message: 'Packed-alpha WebGL setup failed'
    });
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    if (shaders) {
      gl.deleteProgram(shaders.program);
      gl.deleteShader(shaders.vertex);
      gl.deleteShader(shaders.fragment);
    }
    let failureResourcesDisposed = false;
    let failureContextRetired = false;
    return {
      render: () => false,
      setActive: () => undefined,
      dispose: (retirement = 'terminal') => {
        if (!failureResourcesDisposed) {
          failureResourcesDisposed = true;
          clearPackedAlphaCanvasState(canvas);
        }
        if (retirement === 'terminal' && !failureContextRetired) {
          failureContextRetired = true;
          releasePackedAlphaWebGlContext(gl);
        }
      }
    };
  }

  const { program, vertex, fragment } = shaders;
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const packedFrameLocation = gl.getUniformLocation(program, 'uPackedFrame');
  const texelLocation = gl.getUniformLocation(program, 'uTexelX');
  const managedVideo = video as VideoWithFrameCallbacks;
  let resourcesDisposed = false;
  let contextRetired = false;
  let contextLost = false;
  let active = true;
  let frameCallback = 0;
  let animationFrame = 0;
  let renderedFrames = 0;

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

  const render = () => {
    if (
      resourcesDisposed
      || contextLost
      || !active
      || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || video.videoWidth < 2
      || video.videoHeight < 1
    ) {
      return false;
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
      canvas.dataset.packedAlphaStatus = 'frame-upload-failed';
      options.onFailure?.({
        code: 'frame-upload-failed', message: 'Packed-alpha frame upload failed'
      });
      return false;
    }
    gl.useProgram(program);
    gl.uniform1f(texelLocation, 1 / Math.max(2, video.videoWidth));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    renderedFrames += 1;
    canvas.dataset.packedAlphaStatus = 'ready';
    canvas.dataset.packedAlphaFrameReady = 'true';
    canvas.dataset.packedAlphaFrame = String(renderedFrames);
    canvas.dataset.packedAlphaMediaTime = video.currentTime.toFixed(4);
    options.onFrame?.();
    return true;
  };

  const schedule = () => {
    if (resourcesDisposed || contextLost || !active || frameCallback || animationFrame) {
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
    if (resourcesDisposed || contextLost || !active) return;
    render();
    if (!video.paused && !video.ended) {
      schedule();
    }
  };

  const cancelScheduledFrame = () => {
    if (frameCallback && typeof managedVideo.cancelVideoFrameCallback === 'function') {
      managedVideo.cancelVideoFrameCallback(frameCallback);
    }
    frameCallback = 0;
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
    animationFrame = 0;
  };
  const clearPresentedFrame = (clearBuffer = true) => {
    if (clearBuffer && canvas.width > 0 && canvas.height > 0) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.flush();
    }
    delete canvas.dataset.packedAlphaFrameReady;
    delete canvas.dataset.packedAlphaFrame;
    delete canvas.dataset.packedAlphaMediaTime;
  };
  const onContextLost = (event: Event) => {
    if (resourcesDisposed) {
      return;
    }
    event.preventDefault();
    if (contextLost) {
      return;
    }
    contextLost = true;
    active = false;
    cancelScheduledFrame();
    clearPresentedFrame(false);
    canvas.dataset.packedAlphaStatus = 'context-lost';
    canvas.dataset.packedAlphaCompositorActive = semanticBoolean(false);
    options.onFailure?.({
      code: 'context-lost', message: 'Packed-alpha WebGL context was lost'
    });
  };

  video.addEventListener('loadeddata', renderAndSchedule);
  video.addEventListener('seeked', renderAndSchedule);
  video.addEventListener('timeupdate', renderAndSchedule);
  video.addEventListener('play', schedule);
  video.addEventListener('pause', renderAndSchedule);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.dataset.packedAlphaStatus = 'waiting';
  canvas.dataset.packedAlphaCompositorActive = semanticBoolean(true);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    renderAndSchedule();
  }

  return {
    render,
    setActive(nextActive) {
      if (resourcesDisposed || contextLost || active === nextActive) return;
      active = nextActive;
      canvas.dataset.packedAlphaCompositorActive = semanticBoolean(active);
      if (!active) {
        cancelScheduledFrame();
        clearPresentedFrame();
        canvas.dataset.packedAlphaStatus = 'suspended';
        return;
      }
      canvas.dataset.packedAlphaStatus = 'waiting';
      renderAndSchedule();
    },
    dispose(retirement = 'terminal') {
      if (!resourcesDisposed) {
        resourcesDisposed = true;
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
        clearPackedAlphaCanvasState(canvas);
      }
      if (retirement === 'terminal' && !contextRetired) {
        contextRetired = true;
        releasePackedAlphaWebGlContext(gl);
      }
    }
  };
}
