import { smoothStep } from '../../pilot/visibility';

export type InkCurtainOptions = {
  colorLift?: number;
  progressSpan?: number;
  direction?: 'top-down' | 'bottom-up';
  coverAlpha?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
  targetElement?: HTMLCanvasElement | null;
  renderTarget?: () => void;
};

export type InkCurtainTransition = {
  render(progress: number, pointerX?: number, pointerY?: number): void;
  prewarm(): void;
};

export function createInkCurtainTransition(
  canvas: HTMLCanvasElement | null | undefined,
  options: InkCurtainOptions = {}
): InkCurtainTransition | null {
  if (!canvas) {
    return null;
  }
  const colorLift = clamp(options.colorLift ?? 0.32, 0, 1);
  const progressSpan = Math.max(0.01, options.progressSpan ?? 1);
  const direction = options.direction === 'top-down' ? 1 : 0;
  const coverAlpha = clamp(options.coverAlpha ?? 0.72, 0, 1);
  const fadeOutStart = clamp(options.fadeOutStart ?? 0.76, 0, 0.98);
  const fadeOutEnd = Math.max(fadeOutStart + 0.01, clamp(options.fadeOutEnd ?? 0.98, 0.01, 1));

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
    uniform vec2 uMouse;
    uniform float uProgress;
    uniform float uTime;
    uniform float uColorLift;
    uniform float uDirection;
    uniform float uProgressSpan;
    uniform float uCoverAlpha;
    uniform sampler2D uTargetScene;
    uniform float uTargetReady;

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
      mat2 rotate = mat2(0.82, 0.57, -0.57, 0.82);
      for (int i = 0; i < 4; i++) {
        value += noise(p) * amplitude;
        p = rotate * p * 2.04 + 5.73;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      float p = smoothstep(0.0, max(0.01, uProgressSpan), uProgress);
      float energy = sin(p * 3.14159265);
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 uv = vUv;
      vec2 aspectUv = vec2(uv.x * aspect, uv.y);
      vec2 mouseDrift = uMouse * vec2(0.065, -0.030);
      float sweepY = mix(uv.y, 1.0 - uv.y, uDirection);

      vec2 warpUv = aspectUv * 2.35 + vec2(0.0, -uTime * 0.030) + mouseDrift;
      vec2 warp = vec2(
        fbm(warpUv + vec2(1.7, 4.1)),
        fbm(warpUv + vec2(8.3, 2.2))
      ) - 0.5;
      float broad = fbm(aspectUv * 2.10 + warp * 0.72 + vec2(0.0, -uTime * 0.030) + mouseDrift);
      float wet = fbm(aspectUv * 7.25 + warp * 1.65 + vec2(broad * 1.7, uTime * 0.045) - mouseDrift * 0.45);
      float pore = fbm(aspectUv * 25.0 - warp * 2.55 + vec2(-uTime * 0.060, broad * 1.35));
      float column = fbm(vec2(uv.x * 4.65, uTime * 0.018 + broad * 0.72));
      float ripple = sin(uv.x * 18.0 + wet * 3.2 - uTime * 0.42) * 0.018;
      float edgeBand = 1.0 - smoothstep(0.02, 0.34, abs(sweepY - p));
      float upwardRun = smoothstep(p - 0.04, p + 0.02, sweepY) * (1.0 - smoothstep(p + 0.02, p + 0.30, sweepY));
      float tendril = smoothstep(0.56, 0.92, column + wet * 0.30) * (edgeBand * 0.62 + upwardRun * 0.72) * smoothstep(0.08, 0.82, p);
      float mud = fbm(aspectUv * 4.5 + warp * 1.65 - uTime * 0.040) * 0.30;
      mud += fbm(aspectUv * 13.5 - warp * 2.6 + uTime * 0.075) * 0.105;
      mud += fbm(aspectUv * 31.0 + warp * 3.2 - uTime * 0.12) * 0.035;
      float openingBreakup = smoothstep(0.30, 0.72, fbm(aspectUv * 8.4 + warp * 2.6 - uTime * 0.08));
      openingBreakup *= smoothstep(0.22, 0.62, fbm(aspectUv * 23.0 - warp * 3.4 + uTime * 0.13));
      float field = (broad - 0.5) * 0.118 + (wet - 0.5) * 0.078 + (pore - 0.5) * 0.024 + mud * 0.10 + ripple;
      field -= openingBreakup * edgeBand * 0.045;
      float edge = p + tendril * (0.058 + wet * 0.116) - (sweepY + field);

      float body = smoothstep(-0.040, 0.085, edge);
      float feather = 1.0 - smoothstep(0.0, 0.132, abs(edge));
      float hot = 1.0 - smoothstep(0.0, 0.034, abs(edge));
      float veins = smoothstep(0.66, 0.97, wet + pore * 0.34) * feather;
      float openingSpatter = smoothstep(0.70, 0.985, hash(floor((aspectUv + warp * 0.68) * uResolution.y * 0.052 + uTime * 4.4)));
      float ember = feather * openingSpatter * (0.12 + energy * 0.46);
      vec2 particleUv = aspectUv * vec2(42.0, 48.0) + warp * 1.35 + vec2(0.0, -uTime * 0.12);
      vec2 particleCell = floor(particleUv);
      vec2 particleLocal = fract(particleUv) - 0.5;
      float particleSeed = hash(particleCell);
      vec2 particleJitter = vec2(
        hash(particleCell + vec2(17.3, 5.1)),
        hash(particleCell + vec2(43.7, 9.8))
      ) - 0.5;
      float particleRadius = mix(0.075, 0.190, hash(particleCell + vec2(2.6, 11.9)));
      float particleDot = 1.0 - smoothstep(particleRadius * 0.28, particleRadius, length(particleLocal - particleJitter * 0.38));
      float particleWindow = (1.0 - smoothstep(0.026, 0.290, abs(edge))) * smoothstep(0.06, 0.94, p);
      float sprayWindow = smoothstep(-0.240, -0.030, edge) * (1.0 - smoothstep(-0.030, 0.130, edge)) * smoothstep(0.08, 0.86, p);
      particleWindow = max(particleWindow * 0.72, sprayWindow);
      float particles = particleDot * smoothstep(0.860, 0.975, particleSeed) * particleWindow * (0.40 + energy * 0.66);
      float particleCore = particles * smoothstep(0.55, 0.98, particleDot);
      float late = smoothstep(0.92, 1.0, p);

      vec3 ink = mix(vec3(0.006, 0.012, 0.010), vec3(0.016, 0.032, 0.026), broad * 0.56);
      vec3 jade = vec3(0.24, 0.66, 0.56);
      vec3 gold = vec3(0.88, 0.72, 0.38);
      vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.94, broad + pore * 0.24));
      vec3 color = ink;
      color += edgeColor * (feather * 0.24 + hot * 0.22 + veins * 0.082 + ember * 0.32 + particles * 0.88) * mix(0.24, 0.86, uColorLift);
      color += mix(jade, gold, particleSeed) * particles * mix(0.16, 0.58, uColorLift);
      color += mix(vec3(0.28, 0.78, 0.66), vec3(0.96, 0.80, 0.42), particleSeed) * particleCore * mix(0.22, 0.74, uColorLift);
      color += vec3(0.025, 0.075, 0.060) * openingBreakup * feather * mix(0.08, 0.34, uColorLift);
      color = mix(color, vec3(0.004, 0.008, 0.007), late * 0.35);

      float coreWash = body * (0.14 + uCoverAlpha * 0.72 + late * 0.10);
      float alpha = coreWash;
      alpha += feather * 0.18 + hot * 0.13 + veins * 0.05 + ember * 0.28 + particles * 0.76 + particleCore * 0.36;
      alpha = clamp(alpha, 0.0, 1.0);

      vec3 targetScene = texture2D(uTargetScene, uv).rgb;
      float targetMask = body * uTargetReady;
      float targetDetail = clamp(feather * 0.18 + hot * 0.16 + veins * 0.06 + ember * 0.20 + particles * 0.60 + particleCore * 0.32, 0.0, 1.0);
      vec3 targetComposite = targetScene + color * targetDetail;
      color = mix(color, targetComposite, targetMask);
      alpha = max(alpha, targetMask);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Ink curtain shader link failed:', gl.getProgramInfoLog(program));
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    mouse: gl.getUniformLocation(program, 'uMouse'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    time: gl.getUniformLocation(program, 'uTime'),
    colorLift: gl.getUniformLocation(program, 'uColorLift'),
    direction: gl.getUniformLocation(program, 'uDirection'),
    progressSpan: gl.getUniformLocation(program, 'uProgressSpan'),
    coverAlpha: gl.getUniformLocation(program, 'uCoverAlpha'),
    targetScene: gl.getUniformLocation(program, 'uTargetScene'),
    targetReady: gl.getUniformLocation(program, 'uTargetReady')
  };

  const targetTexture = gl.createTexture();
  const targetLayer = { width: 1, height: 1, ready: 0 };
  if (targetTexture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  }

  const updateTargetLayer = () => {
    const target = options.targetElement;
    options.renderTarget?.();
    if (!targetTexture || !target || !target.width || !target.height || target.dataset.inkTextureReady !== 'true') {
      targetLayer.ready = 0;
      return;
    }
    try {
      targetLayer.width = target.width;
      targetLayer.height = target.height;
      targetLayer.ready = 1;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, target);
    } catch {
      targetLayer.ready = 0;
    }
  };

  let width = 0;
  let height = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    const nextWidth = Math.max(1, Math.round(rect.width * ratio));
    const nextHeight = Math.max(1, Math.round(rect.height * ratio));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return rect.width > 0 && rect.height > 0;
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform1i(uniforms.targetScene, 0);

  return {
    render(progress: number, pointerX = 0, pointerY = 0) {
      const visibleProgress = clamp(progress, 0, 1);
      const fadeIn = smoothStep(clamp(visibleProgress / 0.08, 0, 1));
      const fadeOut = 1 - smoothStep(clamp((visibleProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart), 0, 1));
      const canvasOpacity = fadeIn * fadeOut;
      const active = canvasOpacity > 0.002;
      canvas.style.visibility = active ? 'visible' : 'hidden';
      canvas.style.opacity = active ? canvasOpacity.toFixed(4) : '0';
      if (!resize()) {
        return;
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!active) {
        return;
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform2f(
        uniforms.mouse,
        clamp(pointerX / Math.max(1, window.innerWidth), -0.5, 0.5),
        clamp(pointerY / Math.max(1, window.innerHeight), -0.5, 0.5)
      );
      gl.uniform1f(uniforms.progress, visibleProgress);
      gl.uniform1f(uniforms.time, performance.now() * 0.001);
      gl.uniform1f(uniforms.colorLift, colorLift);
      gl.uniform1f(uniforms.direction, direction);
      gl.uniform1f(uniforms.progressSpan, progressSpan);
      gl.uniform1f(uniforms.coverAlpha, coverAlpha);
      updateTargetLayer();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      gl.uniform1f(uniforms.targetReady, targetLayer.ready);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    prewarm() {
      this.render(0.003, 0, 0);
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    }
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Ink curtain shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
