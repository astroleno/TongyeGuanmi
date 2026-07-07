type DynamicTextureSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

export type SceneInkOptions = {
  targetSrc?: string;
  nextSceneElement?: DynamicTextureSource | null;
  hideAtEnd?: boolean;
  progressSpan?: number;
  colorLift?: number;
  sceneBrightness?: number;
  perlinOverlay?: boolean;
  perlinStrength?: number;
  inkCenterX?: number;
  inkCenterY?: number;
  transparentOutside?: boolean;
};

export type SceneInkRenderer = {
  render(progress: number, visibilityProgress?: number, options?: Partial<Pick<SceneInkOptions, 'perlinStrength' | 'sceneBrightness'>>): void;
  prewarm(): void;
  destroy(): void;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value: number) => {
  const clamped = clamp(value);
  return clamped * clamped * (3 - 2 * clamped);
};

function isVideoSource(source: DynamicTextureSource): source is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}

function sourceIsReady(source: DynamicTextureSource | null | undefined): source is DynamicTextureSource {
  if (!source) {
    return false;
  }
  if (isVideoSource(source)) {
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0 && source.videoHeight > 0;
  }
  if (source instanceof HTMLCanvasElement) {
    return source.dataset.inkTextureReady === 'true' && source.width > 0 && source.height > 0;
  }
  return source.complete && source.naturalWidth > 0 && source.naturalHeight > 0;
}

function sourceSize(source: DynamicTextureSource): { width: number; height: number } {
  if (isVideoSource(source)) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
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
    console.warn('R4 scene ink shader compile failed:', gl.getShaderInfoLog(shader));
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
    console.warn('R4 scene ink shader link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

export function createSceneInkRenderer(canvas: HTMLCanvasElement | null, options: SceneInkOptions = {}): SceneInkRenderer | null {
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
    uniform vec2 uInkCenter;
    uniform float uProgressSpan;
    uniform float uColorLift;
    uniform float uSceneBrightness;
    uniform float uPerlinOverlay;
    uniform float uPerlinStrength;
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

    void main() {
      float p = smoothstep(0.0, max(0.01, uProgressSpan), uProgress);
      float energy = sin(p * 3.14159265);
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 uv = vUv;
      vec2 center = uInkCenter + vec2(sin(uTime * 0.18), cos(uTime * 0.16)) * 0.005;
      vec2 aspectUv = vec2(uv.x * aspect, uv.y);
      vec2 centered = (uv - center) * vec2(aspect, 1.0);
      float dist = length(centered) * 0.86;

      vec2 warpUv = aspectUv * 2.35 + vec2(0.0, -uTime * 0.030);
      vec2 warp = vec2(
        fbm(warpUv + vec2(1.7, 4.1)),
        fbm(warpUv + vec2(8.3, 2.2))
      ) - 0.5;
      float broad = fbm(aspectUv * 3.2 + warp * 0.92 + vec2(0.0, -uTime * 0.032));
      float wet = fbm(aspectUv * 8.2 + warp * 1.70 + vec2(broad * 1.25, uTime * 0.048));
      float pore = fbm(aspectUv * 25.0 - warp * 2.45 + vec2(-uTime * 0.070, broad * 1.32));
      float ripple = sin((uv.x - center.x) * 31.0 + wet * 3.6 - uTime * 0.58) * 0.014;
      float thresholdNoise = (broad - 0.5) * 0.105 + (wet - 0.5) * 0.075 + (pore - 0.5) * 0.026 + ripple;
      float threshold = p - (dist + thresholdNoise - 0.065);
      float dissolve = smoothstep(-0.035, 0.064, threshold);
      float softBand = 1.0 - smoothstep(0.0, 0.155, abs(threshold));
      float hotBand = 1.0 - smoothstep(0.0, 0.052, abs(threshold));

      vec2 nextUv = coverUv(uv + warp * 0.014 * (0.22 + energy), uNextSize, uResolution);
      vec3 sampled = texture2D(uNextScene, nextUv).rgb;
      vec3 fallbackLight = mix(vec3(0.020, 0.034, 0.030), vec3(0.935, 0.902, 0.805), smoothstep(0.42, 0.82, uv.y));
      vec3 nextScene = mix(fallbackLight, sampled, uNextReady) * uSceneBrightness;

      float perlinValue = fbm(nextUv * 3.8 + warp * 0.42 + vec2(uTime * 0.08, uTime * 0.24));
      vec3 perlinTint = mix(vec3(0.30, 0.78, 0.66), vec3(0.98, 0.82, 0.45), smoothstep(0.25, 0.94, perlinValue));
      nextScene += perlinTint * smoothstep(0.44, 0.88, perlinValue) * uPerlinOverlay * uPerlinStrength * softBand;

      vec3 ink = mix(vec3(0.006, 0.012, 0.010), vec3(0.018, 0.038, 0.030), broad * 0.56);
      vec3 jade = vec3(0.30, 0.78, 0.66);
      vec3 gold = vec3(0.98, 0.82, 0.45);
      vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.90, wet + pore * 0.24));
      vec3 color = mix(ink, nextScene * 1.06 + edgeColor * hotBand * 0.22, dissolve);
      color = mix(color, edgeColor, clamp((softBand * 0.28 + hotBand * 0.36) * mix(0.28, 0.86, uColorLift), 0.0, 0.78));

      float outsideAlpha = (0.06 + p * 0.32) * (1.0 - uTransparentOutside);
      float alpha = mix(outsideAlpha, 1.0, dissolve);
      alpha += softBand * 0.12 + hotBand * 0.18;
      alpha += smoothstep(0.70, 0.985, hash(floor((aspectUv + warp * 0.68) * uResolution.y * 0.052 + uTime * 4.4))) * softBand * (0.10 + energy * 0.26);
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
    inkCenter: gl.getUniformLocation(program, 'uInkCenter'),
    progressSpan: gl.getUniformLocation(program, 'uProgressSpan'),
    colorLift: gl.getUniformLocation(program, 'uColorLift'),
    sceneBrightness: gl.getUniformLocation(program, 'uSceneBrightness'),
    perlinOverlay: gl.getUniformLocation(program, 'uPerlinOverlay'),
    perlinStrength: gl.getUniformLocation(program, 'uPerlinStrength'),
    transparentOutside: gl.getUniformLocation(program, 'uTransparentOutside')
  };

  const texture = gl.createTexture();
  const textureState = { width: 1, height: 1, ready: 0 };
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 8, 7, 255]));

  if (options.targetSrc) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      textureState.width = image.naturalWidth || 1;
      textureState.height = image.naturalHeight || 1;
      textureState.ready = 1;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    };
    image.src = options.targetSrc;
  }

  let width = 0;
  let height = 0;
  let destroyed = false;

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

  const updateDynamicTexture = () => {
    const source = options.nextSceneElement;
    if (!sourceIsReady(source)) {
      return;
    }
    const size = sourceSize(source);
    try {
      textureState.width = size.width;
      textureState.height = size.height;
      textureState.ready = 1;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      textureState.ready = textureState.ready ? 1 : 0;
    }
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(uniforms.nextScene, 0);

  return {
    render(progress, visibilityProgress = progress, renderOptions = {}) {
      if (destroyed) {
        return;
      }
      const visibleProgress = clamp(visibilityProgress);
      const hideAtEnd = options.hideAtEnd ?? true;
      const active = visibleProgress > 0.002 && !(hideAtEnd && visibleProgress > 0.999);
      const exitFade = hideAtEnd ? 1 - smoothStep((visibleProgress - 0.94) / 0.055) : 1;
      canvas.style.visibility = active ? 'visible' : 'hidden';
      canvas.style.opacity = active ? clamp(exitFade).toFixed(4) : '0';
      if (!resize()) {
        return;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!active) {
        return;
      }
      updateDynamicTexture();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.progress, clamp(progress));
      gl.uniform1f(uniforms.time, performance.now() * 0.001);
      gl.uniform2f(uniforms.nextSize, textureState.width, textureState.height);
      gl.uniform1f(uniforms.nextReady, textureState.ready);
      gl.uniform2f(uniforms.inkCenter, options.inkCenterX ?? 0.5, options.inkCenterY ?? 0.54);
      gl.uniform1f(uniforms.progressSpan, options.progressSpan ?? 1.16);
      gl.uniform1f(uniforms.colorLift, clamp(options.colorLift ?? 0.58));
      gl.uniform1f(uniforms.sceneBrightness, renderOptions.sceneBrightness ?? options.sceneBrightness ?? 1);
      gl.uniform1f(uniforms.perlinOverlay, options.perlinOverlay ? 1 : 0);
      gl.uniform1f(uniforms.perlinStrength, renderOptions.perlinStrength ?? options.perlinStrength ?? 0.34);
      gl.uniform1f(uniforms.transparentOutside, options.transparentOutside ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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
