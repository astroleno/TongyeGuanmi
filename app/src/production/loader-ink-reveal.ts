import {
  sampleLoaderInkSequence,
  type LoaderInkSample,
  type LoaderInkTimings
} from './loader-ink-sequence';

export {
  loaderInkSequenceDuration,
  sampleLoaderInkSequence
} from './loader-ink-sequence';
export type {
  LoaderInkPhase,
  LoaderInkSample,
  LoaderInkTimings
} from './loader-ink-sequence';

export type LoaderInkStatus =
  | 'idle'
  | 'waiting-font'
  | 'active'
  | 'complete'
  | 'fallback'
  | 'disposed';

export type LoaderInkFallbackReason =
  | 'environment-unavailable'
  | 'reduced-motion'
  | 'font-unavailable'
  | 'webgl-unavailable'
  | 'context-lost';

export type LoaderInkEnvironment = Readonly<{
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(frame: number): void;
  addResizeListener(listener: EventListener): void;
  removeResizeListener(listener: EventListener): void;
  createCanvas(): HTMLCanvasElement;
  getComputedStyle(element: Element): CSSStyleDeclaration;
  devicePixelRatio(): number;
  loadTitleFont(text: string): Promise<void>;
}>;

export type LoaderInkController = Readonly<{
  start(): Promise<void>;
  dispose(): void;
  getStatus(): LoaderInkStatus;
}>;

export type CreateLoaderInkRevealOptions = Readonly<{
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  phrases: readonly string[];
  timings: LoaderInkTimings;
  startedAt?: number;
  reducedMotion?: boolean;
  environment?: LoaderInkEnvironment;
  onStatusChange?: (status: LoaderInkStatus, reason?: LoaderInkFallbackReason) => void;
}>;

const VERTEX_SOURCE = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SOURCE = `
  precision highp float;

  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uProgress;
  uniform float uMode;
  uniform float uTime;
  uniform float uCharCount;
  uniform sampler2D uTextMask;
  uniform sampler2D uCharMask;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.37);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = rotate * p * 2.02 + 7.13;
      amplitude *= 0.5;
    }
    return value;
  }

  float sampleGlyph(vec2 coord) {
    vec2 inside = step(vec2(0.0), coord) * step(coord, vec2(1.0));
    return texture2D(uTextMask, vec2(coord.x, 1.0 - coord.y)).a * inside.x * inside.y;
  }

  vec4 sampleCharMask(vec2 coord) {
    vec2 inside = step(vec2(0.0), coord) * step(coord, vec2(1.0));
    return texture2D(uCharMask, vec2(coord.x, 1.0 - coord.y)) * inside.x * inside.y;
  }

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    float hideMode = step(0.5, uMode);
    float energy = sin(p * 3.14159265);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 uv = vUv;
    vec2 aspectUv = vec2(uv.x * aspect, uv.y);
    vec2 warp = vec2(
      fbm(aspectUv * 2.2 + vec2(1.7, 4.1) - uTime * 0.035),
      fbm(aspectUv * 2.2 + vec2(8.3, 2.2) + uTime * 0.028)
    ) - 0.5;

    vec2 px = 1.0 / max(uResolution, vec2(1.0));
    float glyph = sampleGlyph(uv);
    vec4 charData = sampleCharMask(uv);
    float charPresence = smoothstep(0.002, 0.08, charData.a);
    float charIndex = floor(clamp(charData.r * uCharCount, 0.0, max(uCharCount - 0.001, 0.0)));
    float charStart = charIndex * 0.15;
    float localDissolve = fbm(aspectUv * 10.5 + warp * 1.2 + vec2(charIndex * 4.2, uTime * 0.035));
    float charP = clamp((p - charStart + (localDissolve - 0.5) * 0.20 * hideMode) / mix(0.52, 0.66, hideMode), 0.0, 1.0);
    float charEase = smoothstep(0.0, 1.0, charP);
    float charEnergy = sin(charEase * 3.14159265);

    float coarseInk = fbm(aspectUv * 7.6 + warp * 1.5 + vec2(charIndex * 1.73, -uTime * 0.045));
    float veinInk = fbm(aspectUv * 21.0 + warp * 2.0 + vec2(uTime * 0.055, charIndex * 2.2));
    float poreInk = fbm(aspectUv * 58.0 - warp * 2.6 + vec2(-uTime * 0.12, uTime * 0.09));
    float inkField = coarseInk * 0.56 + veinInk * 0.30 + poreInk * 0.14;
    float wetThreshold = mix(0.90, 0.18, charEase);
    float flowMask = smoothstep(wetThreshold - 0.12, wetThreshold + 0.10, inkField + charEase * 0.16);
    flowMask = max(flowMask, smoothstep(0.70, 0.98, charEase));
    float hideMask = flowMask * smoothstep(0.02, 0.22, charEase);
    float dissolveNoise = fbm(aspectUv * 18.0 + warp * 2.4 + vec2(charIndex * 6.0, -uTime * 0.06));
    float strokeScatter = fbm(aspectUv * 46.0 - warp * 2.1 + vec2(-uTime * 0.12, charIndex * 5.1));
    float hideDissolve = smoothstep(0.18, 0.92, charEase + (dissolveNoise - 0.5) * 0.42 + (strokeScatter - 0.5) * 0.22);
    float reveal = mix(flowMask, 1.0 - max(hideMask, hideDissolve), hideMode);
    float liveEdge = 1.0 - smoothstep(0.0, 0.15, abs((inkField + charEase * 0.16) - wetThreshold));
    liveEdge *= smoothstep(0.04, 0.32, charEase) * (1.0 - smoothstep(0.70, 1.0, charEase));

    float expandA = 3.8 + charEnergy * 2.4;
    float expandB = expandA * 0.68;
    float glyphWet = glyph;
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(expandA, 0.0)) * 0.76);
    glyphWet = max(glyphWet, sampleGlyph(uv - px * vec2(expandA, 0.0)) * 0.76);
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(0.0, expandA)) * 0.76);
    glyphWet = max(glyphWet, sampleGlyph(uv - px * vec2(0.0, expandA)) * 0.76);
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(expandB, expandB)) * 0.66);
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(-expandB, expandB)) * 0.66);
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(expandB, -expandB)) * 0.66);
    glyphWet = max(glyphWet, sampleGlyph(uv + px * vec2(-expandB, -expandB)) * 0.66);
    float glyphEdgeCarrier = clamp(glyphWet - glyph * 0.68, 0.0, 1.0);
    float wetCarrier = mix(glyphWet, glyphEdgeCarrier * 0.34, hideMode);

    float beadCell = hash(floor((aspectUv + warp * 0.34) * uResolution.y * 0.125 + charIndex * 9.0));
    float beadPop = smoothstep(0.80, 0.992, beadCell);
    vec2 blobGrid = aspectUv * vec2(78.0, 24.0) + warp * 1.6 + vec2(uTime * 0.045, -uTime * 0.035);
    vec2 blobCell = floor(blobGrid);
    vec2 blobUv = fract(blobGrid) - 0.5;
    vec2 blobOffset = vec2(
      hash(blobCell + vec2(17.1, 3.7)),
      hash(blobCell + vec2(5.2, 11.9))
    ) - 0.5;
    blobUv += blobOffset * 0.26;
    float blobRadius = mix(0.08, 0.24, hash(blobCell + vec2(23.4, 8.8)));
    float blobGate = smoothstep(0.72, 0.985, hash(blobCell + vec2(7.4, 19.3)));
    float blobDrop = (1.0 - smoothstep(blobRadius, blobRadius + 0.08, length(blobUv))) * blobGate;
    float dropField = (beadPop * 0.34 + blobDrop * 0.72) * liveEdge * (0.24 + charEnergy * 0.78);

    vec3 jade = vec3(0.30, 0.78, 0.66);
    vec3 gold = vec3(0.98, 0.82, 0.45);
    vec3 edgeColor = mix(jade, gold, smoothstep(0.22, 0.86, fbm(aspectUv * 5.2 + charIndex * 0.7 + uTime * 0.025)));
    float edgeGlow = liveEdge * mix(0.24 + charEnergy * 0.25, 0.13 + charEnergy * 0.14, hideMode) + dropField * mix(0.68, 0.28, hideMode);
    float hideStrokeFade = mix(1.0, 1.0 - smoothstep(0.12, 0.70, charEase), hideMode);
    float hideResidue = mix(1.0, 1.0 - smoothstep(0.30, 0.86, charEase), hideMode);
    float alpha = clamp(glyph * reveal * 0.86 * hideStrokeFade + wetCarrier * (liveEdge * mix(0.24, 0.13, hideMode) + dropField * mix(0.62, 0.24, hideMode)) * hideResidue, 0.0, 1.0);
    alpha *= charPresence;
    vec3 baseColor = vec3(0.968, 0.929, 0.843);
    vec3 accentWash = mix(vec3(0.90, 0.97, 0.86), edgeColor, 0.64);
    float accentStrength = clamp(edgeGlow * 1.28 + dropField * 1.10 + liveEdge * charEnergy * 0.06, 0.0, 0.84);
    vec3 color = mix(baseColor, accentWash, accentStrength);
    color += edgeColor * dropField * 0.08;

    float outputAlpha = clamp(alpha, 0.0, 1.0);
    gl_FragColor = vec4(color * outputAlpha, outputAlpha);
  }
`;

function browserEnvironment(): LoaderInkEnvironment | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined;
  }
  return {
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frame) => window.cancelAnimationFrame(frame),
    addResizeListener: (listener) => window.addEventListener('resize', listener, { passive: true }),
    removeResizeListener: (listener) => window.removeEventListener('resize', listener),
    createCanvas: () => document.createElement('canvas'),
    getComputedStyle: (element) => window.getComputedStyle(element),
    devicePixelRatio: () => window.devicePixelRatio || 1,
    loadTitleFont: async (text) => {
      if (!document.fonts?.load) {
        return;
      }
      await document.fonts.load('400 1em "Tongye Title"', text);
      await document.fonts.ready;
    }
  };
}

type LoaderInkRenderer = Readonly<{
  render(sample: LoaderInkSample, now: number): void;
  resize(): boolean;
  dispose(loseContext: boolean): void;
}>;

function releaseWebGlResources(
  gl: WebGLRenderingContext,
  resources: {
    buffer?: WebGLBuffer | null;
    program?: WebGLProgram | null;
    shaders?: readonly (WebGLShader | null)[];
    textures?: readonly (WebGLTexture | null)[];
  },
  loseContext: boolean
): void {
  for (const texture of resources.textures ?? []) {
    if (texture) gl.deleteTexture(texture);
  }
  if (resources.buffer) gl.deleteBuffer(resources.buffer);
  if (resources.program) gl.deleteProgram(resources.program);
  for (const shader of resources.shaders ?? []) {
    if (shader) gl.deleteShader(shader);
  }
  if (loseContext) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function createRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  environment: LoaderInkEnvironment
): LoaderInkRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance'
  });
  if (!gl) {
    return null;
  }

  const compileShader = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vertexShader || !fragmentShader) {
    releaseWebGlResources(gl, { shaders: [vertexShader, fragmentShader] }, true);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    releaseWebGlResources(gl, { shaders: [vertexShader, fragmentShader] }, true);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    releaseWebGlResources(gl, { program, shaders: [vertexShader, fragmentShader] }, true);
    return null;
  }

  const buffer = gl.createBuffer();
  const textTexture = gl.createTexture();
  const charTexture = gl.createTexture();
  const textCanvas = environment.createCanvas();
  const charCanvas = environment.createCanvas();
  const textContext = textCanvas.getContext('2d');
  const charContext = charCanvas.getContext('2d');
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  if (!buffer || !textTexture || !charTexture || !textContext || !charContext || positionLocation < 0) {
    releaseWebGlResources(gl, {
      buffer,
      program,
      shaders: [vertexShader, fragmentShader],
      textures: [textTexture, charTexture]
    }, true);
    return null;
  }

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    mode: gl.getUniformLocation(program, 'uMode'),
    time: gl.getUniformLocation(program, 'uTime'),
    charCount: gl.getUniformLocation(program, 'uCharCount'),
    textMask: gl.getUniformLocation(program, 'uTextMask'),
    charMask: gl.getUniformLocation(program, 'uCharMask')
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  for (const texture of [textTexture, charTexture]) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  let width = 0;
  let height = 0;
  let phrase = '';
  let phraseIndex = -1;
  let textureDirty = true;
  let disposed = false;

  const updateTextTextures = () => {
    if (disposed || !width || !height) return;
    const computed = environment.getComputedStyle(host);
    const cssWidth = Math.max(canvas.getBoundingClientRect().width, 1);
    const fontSize = Number.parseFloat(computed.fontSize) || 128;
    const fontPx = fontSize * (width / cssWidth);
    const font = `${computed.fontWeight || 400} ${fontPx}px ${computed.fontFamily}`;

    textCanvas.width = width;
    textCanvas.height = height;
    charCanvas.width = width;
    charCanvas.height = height;
    textContext.clearRect(0, 0, width, height);
    charContext.clearRect(0, 0, width, height);
    textContext.fillStyle = '#fff';
    textContext.textAlign = 'center';
    textContext.textBaseline = 'alphabetic';
    textContext.font = font;
    charContext.textAlign = 'left';
    charContext.textBaseline = 'alphabetic';
    charContext.font = font;

    const metrics = textContext.measureText(phrase);
    const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.72;
    const descent = metrics.actualBoundingBoxDescent || fontPx * 0.12;
    const baseline = height / 2 + (ascent - descent) / 2;
    textContext.fillText(phrase, width / 2, baseline);

    const chars = Array.from(phrase);
    const fullWidth = metrics.width || chars.reduce(
      (sum, character) => sum + textContext.measureText(character).width,
      0
    );
    let cursorX = width / 2 - fullWidth / 2;
    for (const [index, character] of chars.entries()) {
      const charWidth = textContext.measureText(character).width;
      const encoded = Math.round(((index + 0.5) / Math.max(chars.length, 1)) * 255);
      charContext.fillStyle = `rgb(${encoded}, 0, 0)`;
      // Character ownership must match the glyph mask exactly. Expanding this
      // index texture made the smaller iPhone title look like a second,
      // spatially offset copy while the desktop size largely hid the error.
      charContext.fillText(character, cursorX, baseline);
      cursorX += charWidth;
    }

    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.bindTexture(gl.TEXTURE_2D, charTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, charCanvas);
    textureDirty = false;
  };

  const resize = (): boolean => {
    if (disposed) return false;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(environment.devicePixelRatio() || 1, 1.5);
    const nextWidth = Math.max(1, Math.round(rect.width * ratio));
    const nextHeight = Math.max(1, Math.round(rect.height * ratio));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      textureDirty = true;
    }
    if (textureDirty) updateTextTextures();
    return rect.width > 0 && rect.height > 0;
  };

  const render = (sample: LoaderInkSample, now: number) => {
    if (disposed) return;
    if (sample.phraseIndex !== phraseIndex || sample.phrase !== phrase) {
      phraseIndex = sample.phraseIndex;
      phrase = sample.phrase;
      textureDirty = true;
    }
    if (!resize()) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1f(uniforms.progress, sample.progress);
    gl.uniform1f(uniforms.mode, sample.conceal ? 1 : 0);
    gl.uniform1f(uniforms.time, now * 0.001);
    gl.uniform1f(uniforms.charCount, Math.max(Array.from(sample.phrase).length, 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.uniform1i(uniforms.textMask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, charTexture);
    gl.uniform1i(uniforms.charMask, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    render,
    resize,
    dispose(loseContext) {
      if (disposed) return;
      disposed = true;
      releaseWebGlResources(gl, {
        buffer,
        program,
        shaders: [vertexShader, fragmentShader],
        textures: [textTexture, charTexture]
      }, loseContext);
      textCanvas.width = 0;
      textCanvas.height = 0;
      charCanvas.width = 0;
      charCanvas.height = 0;
    }
  };
}

export function createLoaderInkReveal(options: CreateLoaderInkRevealOptions): LoaderInkController {
  const { canvas, host, phrases, timings } = options;
  const environment = options.environment ?? browserEnvironment();
  let status: LoaderInkStatus = 'idle';
  let fallbackReason: LoaderInkFallbackReason | undefined;
  let renderer: LoaderInkRenderer | null = null;
  let frame = 0;
  let listenersAttached = false;
  let startedAt = options.startedAt;
  let startPromise: Promise<void> | undefined;

  const setStatus = (next: LoaderInkStatus, reason?: LoaderInkFallbackReason) => {
    if (status === 'disposed' && next !== 'disposed') return;
    if (status === next && fallbackReason === reason) return;
    status = next;
    fallbackReason = reason;
    canvas.dataset.loaderInkStatus = next;
    if (next === 'active') {
      canvas.dataset.loaderInkActive = 'true';
      canvas.style.visibility = 'visible';
      canvas.style.opacity = '1';
    } else {
      delete canvas.dataset.loaderInkActive;
      if (next === 'fallback' || next === 'disposed') {
        canvas.style.visibility = 'hidden';
        canvas.style.opacity = '0';
      }
    }
    options.onStatusChange?.(next, reason);
  };

  const stopFrame = () => {
    if (frame && environment) {
      environment.cancelFrame(frame);
    }
    frame = 0;
  };

  const onResize: EventListener = () => {
    renderer?.resize();
  };

  const detachListeners = () => {
    if (!listenersAttached || !environment) return;
    listenersAttached = false;
    environment.removeResizeListener(onResize);
    canvas.removeEventListener('webglcontextlost', onContextLost);
  };

  const useFallback = (reason: LoaderInkFallbackReason, loseContext: boolean) => {
    if (status === 'disposed') return;
    stopFrame();
    detachListeners();
    renderer?.dispose(loseContext);
    renderer = null;
    delete canvas.dataset.loaderInkComplete;
    setStatus('fallback', reason);
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    useFallback('context-lost', false);
  };

  const tick: FrameRequestCallback = (now) => {
    frame = 0;
    if (!environment || status !== 'active' || !renderer) return;
    const sample = sampleLoaderInkSequence(now - (startedAt ?? now), phrases, timings);
    canvas.dataset.loaderInkPhrase = String(sample.phraseIndex);
    canvas.dataset.loaderInkPhase = sample.phase;
    canvas.dataset.loaderInkProgress = sample.progress.toFixed(4);
    renderer.render(sample, now);
    if (sample.sequenceComplete) {
      canvas.dataset.loaderInkComplete = 'true';
      setStatus('complete');
      return;
    }
    frame = environment.requestFrame(tick);
  };

  const start = (): Promise<void> => {
    if (startPromise) return startPromise;
    if (status === 'disposed') return Promise.resolve();
    if (!environment) {
      useFallback('environment-unavailable', false);
      startPromise = Promise.resolve();
      return startPromise;
    }
    if (options.reducedMotion) {
      useFallback('reduced-motion', false);
      startPromise = Promise.resolve();
      return startPromise;
    }

    setStatus('waiting-font');
    let fontPromise: Promise<void>;
    try {
      fontPromise = environment.loadTitleFont(phrases.join(''));
    } catch {
      fontPromise = Promise.reject(new Error('title font unavailable'));
    }
    startPromise = fontPromise.then(
      () => {
        if (status === 'disposed') return;
        try {
          renderer = createRenderer(canvas, host, environment);
          if (!renderer) {
            useFallback('webgl-unavailable', false);
            return;
          }
          listenersAttached = true;
          environment.addResizeListener(onResize);
          canvas.addEventListener('webglcontextlost', onContextLost);
          startedAt ??= environment.now();
          setStatus('active');
          tick(environment.now());
        } catch {
          useFallback('webgl-unavailable', true);
        }
      },
      () => {
        useFallback('font-unavailable', false);
      }
    );
    return startPromise;
  };

  return {
    start,
    dispose() {
      if (status === 'disposed') return;
      stopFrame();
      detachListeners();
      renderer?.dispose(true);
      renderer = null;
      delete canvas.dataset.loaderInkComplete;
      delete canvas.dataset.loaderInkPhrase;
      delete canvas.dataset.loaderInkPhase;
      delete canvas.dataset.loaderInkProgress;
      setStatus('disposed');
    },
    getStatus: () => status
  };
}
