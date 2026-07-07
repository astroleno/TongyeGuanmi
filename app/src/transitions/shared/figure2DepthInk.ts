type DynamicTextureSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

export type Figure2DepthInkOptions = {
  targetSrc?: string;
  depthSrc: string;
  nextSceneElement?: DynamicTextureSource | null;
  figureMaskElement?: HTMLCanvasElement | null;
  hideAtEnd?: boolean;
  progressSpan?: number;
  colorLift?: number;
  sceneBrightness?: number;
  inkCenterX?: number;
  inkCenterY?: number;
  transparentOutside?: boolean;
};

export type Figure2DepthInkRenderer = {
  render(progress: number, visibilityProgress?: number): void;
  prewarm(): void;
  destroy(): void;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function sourceIsReady(source: DynamicTextureSource | null | undefined): source is DynamicTextureSource {
  if (!source) {
    return false;
  }
  if (source instanceof HTMLCanvasElement) {
    return source.dataset.inkTextureReady === 'true' && source.width > 0 && source.height > 0;
  }
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0 && source.videoHeight > 0;
  }
  return source.complete && source.naturalWidth > 0 && source.naturalHeight > 0;
}

function sourceSize(source: DynamicTextureSource): { width: number; height: number } {
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('R4 figure2 depth ink shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('R4 figure2 depth ink shader link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

export function createFigure2DepthInkRenderer(canvas: HTMLCanvasElement | null, options: Figure2DepthInkOptions): Figure2DepthInkRenderer | null {
  if (!canvas) {
    return null;
  }
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

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;

    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform float uProgress;
    uniform float uTime;
    uniform sampler2D uNextScene;
    uniform vec2 uNextSize;
    uniform float uNextReady;
    uniform sampler2D uDepth;
    uniform vec2 uDepthSize;
    uniform float uDepthReady;
    uniform sampler2D uFigureMask;
    uniform vec4 uFigureRect;
    uniform float uFigureReady;
    uniform float uUseFigureMask;
    uniform vec2 uInkCenter;
    uniform float uProgressSpan;
    uniform float uColorLift;
    uniform float uSceneBrightness;
    uniform float uTransparentOutside;

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

    vec2 coverUv(vec2 uv, vec2 textureSize, vec2 resolution) {
      float screenAspect = resolution.x / max(resolution.y, 1.0);
      float textureAspect = textureSize.x / max(textureSize.y, 1.0);
      vec2 covered = uv;
      if (screenAspect > textureAspect) {
        covered.y = (uv.y - 0.5) * (textureAspect / screenAspect) + 0.5;
      } else {
        covered.x = (uv.x - 0.5) * (screenAspect / textureAspect) + 0.5;
      }
      return covered;
    }

    float highlightFromColor(vec3 color) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float value = max(max(color.r, color.g), color.b);
      float score = luma * 0.58 + value * 0.42;
      return pow(clamp((score - 0.24) / 0.22, 0.0, 1.0), 1.55);
    }

    void main() {
      float p = smoothstep(0.0, max(0.01, uProgressSpan), uProgress);
      float energy = sin(p * 3.14159265);
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 uv = vUv;
      vec2 center = uInkCenter + vec2(sin(uTime * 0.18), cos(uTime * 0.16)) * 0.005;
      vec2 aspectUv = vec2(uv.x * aspect, uv.y);
      vec2 depthUv = coverUv(uv, uDepthSize, uResolution);
      float depthSample = texture2D(uDepth, depthUv).r;
      float depthRank = smoothstep(0.055, 0.94, depthSample) * uDepthReady;
      depthRank = mix(0.50, depthRank, uDepthReady);
      vec2 centered = (uv - center) * vec2(aspect, 1.0);
      float dist = length(centered) * 0.74;

      vec2 warpUv = aspectUv * 2.35 + vec2(0.0, -uTime * 0.030);
      vec2 warp = vec2(
        fbm(warpUv + vec2(1.7, 4.1)),
        fbm(warpUv + vec2(8.3, 2.2))
      ) - 0.5;

      vec2 figureUv = (uv - uFigureRect.xy) / max(vec2(0.001), uFigureRect.zw);
      float figureInside = step(0.0, figureUv.x)
        * step(figureUv.x, 1.0)
        * step(0.0, figureUv.y)
        * step(figureUv.y, 1.0);
      float figureAlpha = texture2D(uFigureMask, figureUv).a * figureInside * uFigureReady * uUseFigureMask;
      float figureMask = smoothstep(0.035, 0.42, figureAlpha);
      float figureCore = smoothstep(0.30, 0.88, figureAlpha);
      float figureAspect = max(0.34, uFigureRect.z / max(uFigureRect.w, 0.001));
      vec2 figureAspectUv = vec2(figureUv.x * figureAspect, figureUv.y);
      float figureField = fbm(figureAspectUv * 9.2 + warp * 2.2 + vec2(uTime * 0.040, -uTime * 0.026)) * 0.64;
      figureField += fbm(figureAspectUv * vec2(18.0, 32.0) - warp * 2.8 + vec2(-uTime * 0.055, uTime * 0.090)) * 0.36;
      float figureInk = smoothstep(0.42, 0.84, figureField);
      float figureWindow = smoothstep(0.0, 0.055, p) * (1.0 - smoothstep(0.28, 0.48, p));
      float figureSpread = smoothstep(0.10, 0.50, p + figureField * 0.16);
      float figureSeed = figureMask * figureInk * figureSpread * figureWindow;
      float figureAura = figureMask
        * (0.30 + figureInk * 0.70)
        * smoothstep(0.0, 0.045, p)
        * (1.0 - smoothstep(0.30, 0.50, p));

      float thresholdBroad = fbm(aspectUv * 3.1 + warp * 0.95 + vec2(0.0, -uTime * 0.032));
      float thresholdWet = fbm(aspectUv * 8.2 + warp * 1.70 + vec2(thresholdBroad * 1.25, uTime * 0.048));
      float thresholdPore = fbm(aspectUv * 25.0 - warp * 2.45 + vec2(-uTime * 0.070, thresholdBroad * 1.32));
      float thresholdRipple = sin((uv.x - center.x) * 31.0 + thresholdWet * 3.6 - uTime * 0.58) * 0.014;
      float thresholdNoise = (thresholdBroad - 0.5) * 0.090 + (thresholdWet - 0.5) * 0.065 + (thresholdPore - 0.5) * 0.022 + thresholdRipple;
      float thresholdRadialRank = smoothstep(0.02, 0.92, dist);
      float thresholdCenterColumn = 1.0 - smoothstep(0.035, 0.34, abs(uv.x - center.x));
      float thresholdArchTunnel = smoothstep(0.34, 0.88, 1.0 - depthRank) * (1.0 - smoothstep(0.10, 0.58, dist));
      float thresholdCorridorPull = thresholdCenterColumn * smoothstep(0.24, 0.82, 1.0 - depthRank) * (1.0 - smoothstep(0.60, 0.98, uv.y));
      float thresholdFarPull = smoothstep(0.26, 0.88, 1.0 - depthRank) * (thresholdArchTunnel + thresholdCorridorPull * 0.65);
      float thresholdOrder = depthRank * 0.76 + thresholdRadialRank * 0.18 - thresholdFarPull * 0.28 + thresholdNoise;
      float thresholdNearMask = smoothstep(0.56, 0.88, depthRank);
      float thresholdNearOrder = 0.66 + smoothstep(0.56, 1.0, depthRank) * 0.11 + thresholdNoise * 0.28;
      thresholdOrder = mix(thresholdOrder, thresholdNearOrder, thresholdNearMask);
      thresholdOrder = clamp(thresholdOrder, -0.08, 1.04);
      float thresholdLiveBand = 1.0 - smoothstep(0.0, 0.26, abs(p - thresholdOrder));
      float thresholdTendril = smoothstep(0.58, 0.93, thresholdWet + thresholdPore * 0.34)
        * thresholdLiveBand
        * (0.022 + energy * 0.036);
      float thresholdEdgeJitter = (
        (thresholdWet - 0.5) * 0.050
        + (thresholdPore - 0.5) * 0.026
        + sin((uv.x + uv.y * 0.72) * 46.0 + thresholdBroad * 4.2 - uTime * 1.15) * 0.014
      ) * (0.55 + energy * 0.45) * thresholdLiveBand;
      float thresholdEdge = p - (thresholdOrder + thresholdEdgeJitter - thresholdTendril);
      float dissolve = smoothstep(-0.028, 0.052, thresholdEdge);
      dissolve = max(dissolve, figureSeed * (0.18 + figureCore * 0.12));
      float softBand = 1.0 - smoothstep(0.0, 0.154, abs(thresholdEdge));
      float hotBand = 1.0 - smoothstep(0.0, 0.052, abs(thresholdEdge));
      float thresholdFeather = 1.0 - smoothstep(0.0, 0.188, abs(thresholdEdge));
      float thresholdVeins = smoothstep(0.62, 0.965, thresholdWet + thresholdPore * 0.34) * thresholdFeather;
      vec2 thresholdParticleUv = aspectUv * vec2(42.0, 48.0) + warp * 1.35 + vec2(0.0, -uTime * 0.12);
      vec2 thresholdParticleCell = floor(thresholdParticleUv);
      vec2 thresholdParticleLocal = fract(thresholdParticleUv) - 0.5;
      float thresholdParticleSeed = hash(thresholdParticleCell);
      vec2 thresholdParticleJitter = vec2(
        hash(thresholdParticleCell + vec2(17.3, 5.1)),
        hash(thresholdParticleCell + vec2(43.7, 9.8))
      ) - 0.5;
      float thresholdParticleRadius = mix(0.075, 0.190, hash(thresholdParticleCell + vec2(2.6, 11.9)));
      float thresholdParticleDot = 1.0 - smoothstep(
        thresholdParticleRadius * 0.28,
        thresholdParticleRadius,
        length(thresholdParticleLocal - thresholdParticleJitter * 0.38)
      );
      float thresholdParticleWindow = (1.0 - smoothstep(0.022, 0.360, abs(thresholdEdge))) * smoothstep(0.035, 0.96, p);
      float thresholdSprayWindow = smoothstep(-0.245, -0.024, thresholdEdge)
        * (1.0 - smoothstep(-0.024, 0.132, thresholdEdge))
        * smoothstep(0.04, 0.88, p);
      thresholdParticleWindow = max(thresholdParticleWindow * 0.76, thresholdSprayWindow);
      float thresholdParticles = thresholdParticleDot
        * smoothstep(0.805, 0.965, thresholdParticleSeed)
        * thresholdParticleWindow
        * (0.50 + energy * 0.78);
      float thresholdParticleCore = thresholdParticles * smoothstep(0.55, 0.98, thresholdParticleDot);
      float thresholdInkDetail = thresholdVeins * 0.24 + thresholdParticles * 1.08 + thresholdParticleCore * 0.72;

      vec2 nextUv = coverUv(uv, uNextSize, uResolution);
      vec3 nextScene = texture2D(uNextScene, nextUv).rgb;
      vec3 nextFallback = vec3(1.0);
      nextScene = mix(nextFallback, nextScene, uNextReady) * uSceneBrightness;
      float nextLuma = dot(nextScene, vec3(0.2126, 0.7152, 0.0722));
      float sceneMask = smoothstep(0.035, 0.24, nextLuma) * uNextReady;
      float highlightCore = highlightFromColor(nextScene) * sceneMask;
      vec3 jade = vec3(0.30, 0.78, 0.66);
      vec3 gold = vec3(0.98, 0.82, 0.45);
      vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.90, fbm(aspectUv * (4.5 + depthRank * 4.0) + uTime * 0.04)));
      float late = smoothstep(0.72, 1.0, p);
      float insideMask = smoothstep(0.08, 0.42, dissolve);
      vec3 outsideColor = vec3(0.012, 0.022, 0.018);
      vec3 innerColor = mix(nextScene * 0.42, nextScene * 1.04, smoothstep(0.06, 0.74, p));
      innerColor = mix(innerColor, nextScene, late * 0.65);
      vec3 color = mix(outsideColor, innerColor, insideMask);
      float glow = softBand * (0.18 + energy * 0.16) + hotBand * (0.18 + energy * 0.14) + thresholdInkDetail * 0.52;
      color = mix(color, edgeColor, clamp(glow * mix(0.22, 0.78, uColorLift), 0.0, 0.72));
      color += edgeColor * highlightCore * thresholdParticles * 0.18;
      color += mix(vec3(1.0, 0.92, 0.62), edgeColor, smoothstep(0.18, 0.46, p)) * figureAura * 0.34;

      float outsideAlpha = (1.0 - dissolve) * (0.05 + p * 0.34 + late * 0.22) * (1.0 - uTransparentOutside);
      float alpha = mix(outsideAlpha, 1.0, insideMask);
      alpha += softBand * 0.08 + hotBand * 0.14 + thresholdInkDetail * 0.26 + figureAura * 0.20;
      alpha += smoothstep(0.90, 1.0, p) * 0.08;
      alpha = clamp(alpha, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  if (!program) {
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    time: gl.getUniformLocation(program, 'uTime'),
    nextScene: gl.getUniformLocation(program, 'uNextScene'),
    nextSize: gl.getUniformLocation(program, 'uNextSize'),
    nextReady: gl.getUniformLocation(program, 'uNextReady'),
    depth: gl.getUniformLocation(program, 'uDepth'),
    depthSize: gl.getUniformLocation(program, 'uDepthSize'),
    depthReady: gl.getUniformLocation(program, 'uDepthReady'),
    figureMask: gl.getUniformLocation(program, 'uFigureMask'),
    figureRect: gl.getUniformLocation(program, 'uFigureRect'),
    figureReady: gl.getUniformLocation(program, 'uFigureReady'),
    useFigureMask: gl.getUniformLocation(program, 'uUseFigureMask'),
    inkCenter: gl.getUniformLocation(program, 'uInkCenter'),
    progressSpan: gl.getUniformLocation(program, 'uProgressSpan'),
    colorLift: gl.getUniformLocation(program, 'uColorLift'),
    sceneBrightness: gl.getUniformLocation(program, 'uSceneBrightness'),
    transparentOutside: gl.getUniformLocation(program, 'uTransparentOutside')
  };

  const createTextureLayer = (fallback: readonly [number, number, number, number]) => {
    const texture = gl.createTexture();
    const layer = { texture, width: 1, height: 1, ready: 0 };
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));
    return layer;
  };

  const nextLayer = createTextureLayer([255, 255, 255, 255]);
  const depthLayer = createTextureLayer([128, 128, 128, 255]);
  const figureLayer = createTextureLayer([0, 0, 0, 0]);

  const loadImageLayer = (src: string | undefined, layer: ReturnType<typeof createTextureLayer>) => {
    if (!src) {
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      layer.width = image.naturalWidth || 1;
      layer.height = image.naturalHeight || 1;
      layer.ready = 1;
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    };
    image.src = src;
  };

  loadImageLayer(options.targetSrc, nextLayer);
  loadImageLayer(options.depthSrc, depthLayer);

  let width = 0;
  let height = 0;
  let destroyed = false;

  const bindLayer = (unit: number, texture: WebGLTexture | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
    const nextWidth = Math.max(1, Math.round((rect.width || window.innerWidth || 1) * ratio));
    const nextHeight = Math.max(1, Math.round((rect.height || window.innerHeight || 1) * ratio));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return rect.width > 0 && rect.height > 0;
  };

  const updateElementLayer = (source: DynamicTextureSource | null | undefined, layer: ReturnType<typeof createTextureLayer>) => {
    if (!sourceIsReady(source)) {
      return;
    }
    const size = sourceSize(source);
    try {
      layer.width = size.width;
      layer.height = size.height;
      layer.ready = 1;
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      layer.ready = layer.ready ? 1 : 0;
    }
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  bindLayer(0, nextLayer.texture);
  gl.uniform1i(uniforms.nextScene, 0);
  bindLayer(1, depthLayer.texture);
  gl.uniform1i(uniforms.depth, 1);
  bindLayer(2, figureLayer.texture);
  gl.uniform1i(uniforms.figureMask, 2);

  return {
    render(progress: number, visibilityProgress = progress) {
      if (destroyed) {
        return;
      }
      const visibleProgress = clamp(visibilityProgress);
      const hideAtEnd = options.hideAtEnd ?? false;
      const active = visibleProgress > 0.002 && !(hideAtEnd && visibleProgress > 0.999);
      const exitFade = hideAtEnd ? 1 - clamp((visibleProgress - 0.94) / 0.055) ** 2 * (3 - 2 * clamp((visibleProgress - 0.94) / 0.055)) : 1;
      canvas.style.visibility = active ? 'visible' : 'hidden';
      canvas.style.opacity = active ? clamp(exitFade).toFixed(4) : '0';
      if (!resize()) {
        return;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!active) {
        return;
      }

      updateElementLayer(options.nextSceneElement, nextLayer);
      updateElementLayer(options.figureMaskElement, figureLayer);

      gl.useProgram(program);
      bindLayer(0, nextLayer.texture);
      bindLayer(1, depthLayer.texture);
      bindLayer(2, figureLayer.texture);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.progress, clamp(progress));
      gl.uniform1f(uniforms.time, performance.now() * 0.001);
      gl.uniform2f(uniforms.nextSize, nextLayer.width, nextLayer.height);
      gl.uniform1f(uniforms.nextReady, nextLayer.ready);
      gl.uniform2f(uniforms.depthSize, depthLayer.width, depthLayer.height);
      gl.uniform1f(uniforms.depthReady, depthLayer.ready);
      const canvasRect = canvas.getBoundingClientRect();
      const figureRect = options.figureMaskElement?.getBoundingClientRect();
      const useFigureMask = Boolean(
        figureLayer.ready
        && figureRect
        && figureRect.width > 0
        && figureRect.height > 0
        && canvasRect.width > 0
        && canvasRect.height > 0
      );
      if (useFigureMask && figureRect) {
        gl.uniform4f(
          uniforms.figureRect,
          (figureRect.left - canvasRect.left) / canvasRect.width,
          (canvasRect.bottom - figureRect.bottom) / canvasRect.height,
          figureRect.width / canvasRect.width,
          figureRect.height / canvasRect.height
        );
      } else {
        gl.uniform4f(uniforms.figureRect, 0, 0, 1, 1);
      }
      gl.uniform1f(uniforms.figureReady, figureLayer.ready);
      gl.uniform1f(uniforms.useFigureMask, useFigureMask ? 1 : 0);
      gl.uniform2f(uniforms.inkCenter, options.inkCenterX ?? 0.5, options.inkCenterY ?? 0.52);
      gl.uniform1f(uniforms.progressSpan, options.progressSpan ?? 1);
      gl.uniform1f(uniforms.colorLift, clamp(options.colorLift ?? 0.34));
      gl.uniform1f(uniforms.sceneBrightness, options.sceneBrightness ?? 1);
      gl.uniform1f(uniforms.transparentOutside, options.transparentOutside ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      canvas.dataset.figure2DepthReady = String(depthLayer.ready === 1);
      canvas.dataset.figure2FigureMaskReady = String(useFigureMask);
      canvas.dataset.figure2DepthInkMode = 'threshold';
    },
    prewarm() {
      this.render(0.003, 0.003);
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    },
    destroy() {
      destroyed = true;
      canvas.remove();
    }
  };
}
