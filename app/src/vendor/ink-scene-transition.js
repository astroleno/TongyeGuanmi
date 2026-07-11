const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);

export function releaseInkWebGlResources(gl, { buffer = null, program = null, shaders = [], textures = [] } = {}) {
  textures.forEach((texture) => {
    if (texture) gl.deleteTexture(texture);
  });
  if (buffer) gl.deleteBuffer(buffer);
  if (program) gl.deleteProgram(program);
  shaders.forEach((shader) => {
    if (shader) gl.deleteShader(shader);
  });
  gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
}

export function dynamicTextureUploadDue({ fps, lastRevision = null, nextRevision = null, lastUploadAt, now }) {
  if (nextRevision !== null && nextRevision === lastRevision) return false;
  const intervalMs = 1000 / Math.max(1, fps || 24);
  return !Number.isFinite(lastUploadAt) || now - lastUploadAt >= intervalMs;
}

export function createInkCurtainTransition(canvas, options = {}) {
    if (!canvas) return null;
    const colorLift = clamp(options.colorLift ?? 0.32, 0, 1);
    const particleStrength = clamp(options.particleStrength ?? 0.45, 0, 1);
    const progressSpan = Math.max(0.01, options.progressSpan || 1);
    const direction = options.direction === 'top-down' ? 1 : 0;
    const coverAlpha = clamp(options.coverAlpha ?? 0.72, 0, 1);
    const fadeOutStart = clamp(options.fadeOutStart ?? 0.76, 0, 0.98);
    const fadeOutEnd = Math.max(fadeOutStart + 0.01, clamp(options.fadeOutEnd ?? 0.98, 0.01, 1));
    const dprLimit = Math.max(0.5, Math.min(1, options.dprLimit ?? 1));
    const targetTextureFps = Math.max(1, Math.min(30, options.targetTextureFps ?? 24));
    const targetElement = options.targetElement || null;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;

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
      uniform float uParticleStrength;
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
        float particleRadius = mix(0.075, 0.190, hash(particleCell + vec2(2.6, 11.9))) * mix(0.92, 1.34, uParticleStrength);
        float particleDot = 1.0 - smoothstep(particleRadius * 0.28, particleRadius, length(particleLocal - particleJitter * 0.38));
        float particleWindow = (1.0 - smoothstep(0.026, 0.290, abs(edge))) * smoothstep(0.06, 0.94, p);
        float sprayWindow = smoothstep(-0.240, -0.030, edge) * (1.0 - smoothstep(-0.030, 0.130, edge)) * smoothstep(0.08, 0.86, p);
        particleWindow = max(particleWindow * 0.72, sprayWindow);
        float particleGateLow = mix(0.860, 0.720, uParticleStrength);
        float particleGateHigh = mix(0.975, 0.850, uParticleStrength);
        float particles = particleDot * smoothstep(particleGateLow, particleGateHigh, particleSeed) * particleWindow * (0.40 + energy * 0.66) * mix(0.78, 1.25, uParticleStrength);
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
        float targetDetail = clamp(
          feather * 0.18
            + hot * 0.16
            + veins * 0.06
            + ember * 0.20
            + particles * 0.60
            + particleCore * 0.32,
          0.0,
          1.0
        );
        vec3 targetComposite = targetScene + color * targetDetail;
        color = mix(color, targetComposite, targetMask);
        alpha = max(alpha, targetMask);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Ink curtain shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
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
      particleStrength: gl.getUniformLocation(program, 'uParticleStrength'),
      direction: gl.getUniformLocation(program, 'uDirection'),
      progressSpan: gl.getUniformLocation(program, 'uProgressSpan'),
      coverAlpha: gl.getUniformLocation(program, 'uCoverAlpha'),
      targetScene: gl.getUniformLocation(program, 'uTargetScene'),
      targetReady: gl.getUniformLocation(program, 'uTargetReady')
    };

    const targetTexture = gl.createTexture();
    const targetLayer = {
      width: 1,
      height: 1,
      ready: 0,
      lastRevision: null,
      lastUploadAt: -Infinity
    };
    if (targetTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0])
      );
    }

    const targetRevision = (source) => {
      if (!source) return null;
      if (typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement) {
        return Number.isFinite(source.currentTime) ? source.currentTime.toFixed(3) : null;
      }
      return source.dataset?.inkTextureRevision ?? null;
    };

    const updateTargetLayer = (now) => {
      options.renderTarget?.();
      const source = targetElement;
      const isMediaSource = typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement;
      const sourceWidth = isMediaSource ? source.videoWidth : (source?.width || source?.naturalWidth || 0);
      const sourceHeight = isMediaSource ? source.videoHeight : (source?.height || source?.naturalHeight || 0);
      const sourceReady = isMediaSource
        ? source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        : source?.dataset?.inkTextureReady === 'true';
      if (!targetTexture || !source || !sourceReady || !sourceWidth || !sourceHeight) {
        targetLayer.ready = 0;
        canvas.dataset.r4InkTargetReady = 'false';
        return;
      }
      const nextRevision = targetRevision(source);
      if (!dynamicTextureUploadDue({
        fps: targetTextureFps,
        lastRevision: targetLayer.lastRevision,
        nextRevision,
        lastUploadAt: targetLayer.lastUploadAt,
        now
      })) return;
      try {
        targetLayer.width = sourceWidth;
        targetLayer.height = sourceHeight;
        targetLayer.ready = 1;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        targetLayer.lastRevision = nextRevision;
        targetLayer.lastUploadAt = now;
        canvas.dataset.r4InkTargetReady = 'true';
        canvas.dataset.r4InkTargetUploads = String(Number(canvas.dataset.r4InkTargetUploads || 0) + 1);
        if (source.dataset) {
          source.dataset.r4InkTextureUploads = String(Number(source.dataset.r4InkTextureUploads || 0) + 1);
        }
      } catch {
        targetLayer.ready = 0;
        canvas.dataset.r4InkTargetReady = 'false';
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, dprLimit);
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.uniform1i(uniforms.targetScene, 0);

    let destroyed = false;
    return {
      render(progress, pointerX = 0, pointerY = 0) {
        if (destroyed) return;
        const visibleProgress = clamp(progress, 0, 1);
        const fadeIn = smoothStep(clamp(visibleProgress / 0.08, 0, 1));
        const fadeOut = 1 - smoothStep(clamp((visibleProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart), 0, 1));
        const targetCompositeActive = Boolean(targetElement) && visibleProgress < 0.999;
        const canvasOpacity = targetElement ? fadeIn : fadeIn * fadeOut;
        const active = targetCompositeActive || canvasOpacity > 0.002;
        canvas.style.visibility = active ? 'visible' : 'hidden';
        canvas.style.opacity = active ? canvasOpacity.toFixed(4) : '0';
        if (!resize()) return;

        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!active) return;

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
        gl.uniform1f(uniforms.particleStrength, particleStrength);
        gl.uniform1f(uniforms.direction, direction);
        gl.uniform1f(uniforms.progressSpan, progressSpan);
        gl.uniform1f(uniforms.coverAlpha, coverAlpha);
        const now = performance.now();
        updateTargetLayer(now);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.uniform1f(uniforms.targetReady, targetLayer.ready);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      prewarm() {
        this.render(0.003, 0, 0);
        canvas.style.visibility = 'hidden';
        canvas.style.opacity = '0';
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        releaseInkWebGlResources(gl, {
          buffer,
          program,
          shaders: [vertexShader, fragmentShader],
          textures: [targetTexture]
        });
        canvas.width = 0;
        canvas.height = 0;
        canvas.style.visibility = 'hidden';
        canvas.style.opacity = '0';
      }
    };
  }

export function createInkSceneTransition(canvas, options = {}) {
    if (!canvas) return null;
    const assets = options.assets || {};
    const targetSrc = options.targetSrc || assets.nextSceneSrc || '';
    const farOnly = options.farOnly ? 1 : 0;
    const hideAtEnd = Boolean(options.hideAtEnd);
    const colorLift = clamp(options.colorLift ?? 0, 0, 1);
    const particleStrength = clamp(options.particleStrength ?? 0.45, 0, 1);
    const dynamicTextureFps = Math.max(1, Math.min(30, options.dynamicTextureFps ?? 24));
    const dprLimit = Math.max(0.5, Math.min(1, options.dprLimit ?? 1));

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;
    let destroyed = false;

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
      uniform sampler2D uNextScene;
      uniform vec2 uNextSize;
      uniform float uNextReady;
      uniform sampler2D uBackDepth;
      uniform sampler2D uMiddleDepth;
      uniform vec2 uDepthSize;
      uniform float uDepthReady;
      uniform float uFarOnly;
      uniform float uImageScale;
      uniform vec2 uImageCenter;
      uniform vec2 uInkCenter;
      uniform float uProgressSpan;
      uniform float uColorLift;
      uniform float uParticleStrength;
      uniform vec4 uImageRect;
      uniform float uUseImageRect;
      uniform sampler2D uFigureMask;
      uniform vec4 uFigureRect;
      uniform float uFigureReady;
      uniform float uUseFigureMask;
      uniform float uPerlinOverlay;
      uniform float uPerlinStrength;
      uniform float uSceneBrightness;
      uniform float uDepthThresholdMode;
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
        vec2 center = uInkCenter + uMouse * vec2(0.026, -0.020) * (1.0 - uFarOnly);
        center += vec2(sin(uTime * 0.18), cos(uTime * 0.16)) * 0.005 * (1.0 - uFarOnly);

        vec2 aspectUv = vec2(uv.x * aspect, uv.y);
        vec2 depthUv = coverUv(uv, uDepthSize, uResolution);
        float farDepth = smoothstep(0.06, 0.90, texture2D(uBackDepth, depthUv).r) * uDepthReady;
        float nearDepth = smoothstep(0.10, 0.84, texture2D(uMiddleDepth, depthUv).r) * uDepthReady * (1.0 - uFarOnly);
        float zDepth = clamp(max(farDepth * 0.52, nearDepth), 0.0, 1.0);
        vec2 centered = (uv - center) * vec2(aspect, 1.0);
        float dist = length(centered) * 0.74;
        float centerPull = smoothstep(0.76, -0.18, abs(uv.x - center.x));
        float mountainSweep = mix(dist, uv.y * 0.48 + dist * 0.58, centerPull * 0.38);

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
        float figureAlpha = texture2D(uFigureMask, figureUv).a * figureInside * uFigureReady * uUseFigureMask * (1.0 - uFarOnly);
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
        float figureIgnite = figureMask
          * smoothstep(0.34, 0.74, figureField)
          * smoothstep(0.0, 0.045, p)
          * (1.0 - smoothstep(0.30, 0.54, p));
        float figureAura = figureMask
          * (0.30 + figureInk * 0.70)
          * smoothstep(0.0, 0.045, p)
          * (1.0 - smoothstep(0.30, 0.50, p));
        float mud = fbm(aspectUv * 4.5 + warp * 1.65 - uTime * 0.040) * 0.30;
        mud += fbm(aspectUv * 13.5 - warp * 2.6 + uTime * 0.075) * 0.105;
        mud += fbm(aspectUv * 31.0 + warp * 3.2 - uTime * 0.12) * 0.035;
        mud += sin((uv.x + uv.y) * 34.0 + uTime * 0.9) * 0.018;

        float thresholdDepthRank = smoothstep(0.055, 0.94, texture2D(uMiddleDepth, depthUv).r) * uDepthReady;
        thresholdDepthRank = mix(0.50, thresholdDepthRank, uDepthReady);
        float thresholdRadialRank = smoothstep(0.02, 0.92, dist);
        float thresholdBroad = fbm(aspectUv * 3.1 + warp * 0.95 + vec2(0.0, -uTime * 0.032));
        float thresholdWet = fbm(aspectUv * 8.2 + warp * 1.70 + vec2(thresholdBroad * 1.25, uTime * 0.048));
        float thresholdPore = fbm(aspectUv * 25.0 - warp * 2.45 + vec2(-uTime * 0.070, thresholdBroad * 1.32));
        float thresholdRipple = sin((uv.x - center.x) * 31.0 + thresholdWet * 3.6 - uTime * 0.58) * 0.014;
        float thresholdNoise = (thresholdBroad - 0.5) * 0.090 + (thresholdWet - 0.5) * 0.065 + (thresholdPore - 0.5) * 0.022 + thresholdRipple;
        float thresholdCenterColumn = 1.0 - smoothstep(0.035, 0.34, abs(uv.x - center.x));
        float thresholdArchTunnel = smoothstep(0.34, 0.88, 1.0 - thresholdDepthRank) * (1.0 - smoothstep(0.10, 0.58, dist));
        float thresholdCorridorPull = thresholdCenterColumn * smoothstep(0.24, 0.82, 1.0 - thresholdDepthRank) * (1.0 - smoothstep(0.60, 0.98, uv.y));
        float thresholdFarPull = smoothstep(0.26, 0.88, 1.0 - thresholdDepthRank) * (thresholdArchTunnel + thresholdCorridorPull * 0.65);
        float thresholdOrder = thresholdDepthRank * 0.76 + thresholdRadialRank * 0.18 - thresholdFarPull * 0.28 + thresholdNoise;
        float thresholdNearMask = smoothstep(0.56, 0.88, thresholdDepthRank);
        float thresholdNearOrder = 0.66 + smoothstep(0.56, 1.0, thresholdDepthRank) * 0.11 + thresholdNoise * 0.28;
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
        float thresholdDissolve = smoothstep(-0.028, 0.052, thresholdEdge);
        float thresholdSoftBand = 1.0 - smoothstep(0.0, 0.154, abs(thresholdEdge));
        float thresholdHotBand = 1.0 - smoothstep(0.0, 0.052, abs(thresholdEdge));
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
        float thresholdParticleRadius = mix(0.075, 0.190, hash(thresholdParticleCell + vec2(2.6, 11.9))) * mix(0.92, 1.34, uParticleStrength);
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
        float thresholdParticleGateLow = mix(0.805, 0.700, uParticleStrength);
        float thresholdParticleGateHigh = mix(0.965, 0.860, uParticleStrength);
        float thresholdParticles = thresholdParticleDot
          * smoothstep(thresholdParticleGateLow, thresholdParticleGateHigh, thresholdParticleSeed)
          * thresholdParticleWindow
          * (0.50 + energy * 0.78)
          * mix(0.78, 1.25, uParticleStrength);
        float thresholdParticleCore = thresholdParticles * smoothstep(0.55, 0.98, thresholdParticleDot);
        float thresholdEmberMask = smoothstep(0.68, 0.982, hash(floor((aspectUv + warp * 0.62) * uResolution.y * 0.058 + uTime * 4.35)));
        float thresholdEmber = (thresholdSoftBand * thresholdEmberMask + thresholdParticles * 0.38) * (0.16 + energy * 0.48);
        thresholdDissolve = max(thresholdDissolve, thresholdParticleCore * 0.18 + thresholdParticles * 0.10);

        float threshold = mountainSweep + mud - 0.105;
        float depthTear = nearDepth * (0.13 + fbm(aspectUv * 19.0 + uTime * 0.11) * 0.065);
        float farTear = farDepth * (0.035 + fbm(aspectUv * 7.0 - uTime * 0.05) * 0.025);
        threshold = mix(threshold, 0.0, smoothstep(0.91, 1.0, p));
        float farEdge = p - (threshold - farTear);
        float nearEdge = p - (threshold - depthTear);
        float farDissolve = smoothstep(-0.030, 0.052, farEdge);
        float nearDissolve = smoothstep(-0.052, 0.078, nearEdge);
        float dissolve = max(farDissolve, nearDissolve * nearDepth);
        float farSoftBand = 1.0 - smoothstep(0.0, 0.115, abs(farEdge));
        float nearSoftBand = nearDepth * (1.0 - smoothstep(0.0, 0.155, abs(nearEdge)));
        float farHotBand = 1.0 - smoothstep(0.0, 0.045, abs(farEdge));
        float nearHotBand = nearDepth * (1.0 - smoothstep(0.0, 0.062, abs(nearEdge)));
        float softBand = max(farSoftBand, nearSoftBand * 1.24);
        float hotBand = max(farHotBand, nearHotBand * 1.38);
        float emberMask = smoothstep(0.67, 0.985, hash(floor((aspectUv + warp * 0.58) * uResolution.y * 0.060 + uTime * 4.0)));
        float ember = softBand * emberMask * (0.18 + energy * 0.46);
        float late = smoothstep(0.72, 1.0, p);

        vec3 ink = vec3(0.018, 0.038, 0.030);
        vec3 jade = vec3(0.30, 0.78, 0.66);
        vec3 gold = vec3(0.98, 0.82, 0.45);
        vec3 light = mix(jade, gold, smoothstep(0.30, 0.92, hash(floor(aspectUv * 42.0))));
        float glow = softBand * (0.32 + energy * 0.30) + hotBand * (0.34 + energy * 0.28) + ember * 0.58;

        vec2 dispVec = vec2(
          fbm(aspectUv * 1.55 + vec2(2.0, 7.0) + uTime * 0.025),
          fbm(aspectUv * 1.55 + vec2(9.0, 3.0) - uTime * 0.020)
        );
        vec2 changeVec = normalize(vec2(warp.x * 0.75 + center.x - uv.x, -0.92 + warp.y * 0.42));
        float dispClamp = clamp(dispVec.x, dispVec.y, uv.y);
        float distMap = distance(uv, dispVec) + dispClamp * sin(uTime * 7.0 + zDepth * 2.6);
        vec2 depthDistortion = changeVec * distMap * (0.008 + farDepth * 0.024 + nearDepth * 0.070) * (0.28 + energy * 0.92);
        float inkDistort = dot(depthDistortion, normalize(vec2(center.x - uv.x, center.y - uv.y + 0.001))) * (2.4 + zDepth * 5.5);
        farEdge += inkDistort * farDepth * smoothstep(0.02, 0.86, p);
        nearEdge += inkDistort * nearDepth * smoothstep(0.02, 0.86, p);
        farDissolve = smoothstep(-0.030, 0.052, farEdge);
        nearDissolve = smoothstep(-0.052, 0.078, nearEdge);
        dissolve = max(farDissolve, nearDissolve * nearDepth);
        dissolve = max(dissolve, figureSeed * (0.18 + figureCore * 0.12));
        farSoftBand = 1.0 - smoothstep(0.0, 0.115, abs(farEdge));
        nearSoftBand = nearDepth * (1.0 - smoothstep(0.0, 0.155, abs(nearEdge)));
        farHotBand = 1.0 - smoothstep(0.0, 0.045, abs(farEdge));
        nearHotBand = nearDepth * (1.0 - smoothstep(0.0, 0.062, abs(nearEdge)));
        softBand = max(farSoftBand, nearSoftBand * 1.24);
        hotBand = max(farHotBand, nearHotBand * 1.38);
        dissolve = mix(dissolve, thresholdDissolve, uDepthThresholdMode);
        farEdge = mix(farEdge, thresholdEdge, uDepthThresholdMode);
        nearEdge = mix(nearEdge, thresholdEdge, uDepthThresholdMode);
        farSoftBand = mix(farSoftBand, thresholdSoftBand * (1.0 - thresholdNearMask * 0.24), uDepthThresholdMode);
        nearSoftBand = mix(nearSoftBand, thresholdSoftBand * (0.46 + thresholdNearMask * 0.92), uDepthThresholdMode);
        farHotBand = mix(farHotBand, thresholdHotBand * (1.0 - thresholdNearMask * 0.18), uDepthThresholdMode);
        nearHotBand = mix(nearHotBand, thresholdHotBand * (0.42 + thresholdNearMask * 0.96), uDepthThresholdMode);
        softBand = mix(softBand, max(farSoftBand, nearSoftBand), uDepthThresholdMode);
        hotBand = mix(hotBand, max(farHotBand, nearHotBand), uDepthThresholdMode);
        float flashWindow = smoothstep(0.0, 0.045, p) * (1.0 - smoothstep(0.56, 0.82, p));
        float ringSuppress = 1.0 - smoothstep(0.42, 0.72, p);
        float openingBreakup = smoothstep(0.30, 0.72, fbm(aspectUv * 8.4 + warp * 2.6 - uTime * 0.08));
        openingBreakup *= smoothstep(0.22, 0.62, fbm(aspectUv * 23.0 - warp * 3.4 + uTime * 0.13));
        float edgeParticleBand = clamp(max(softBand * 1.08, hotBand * 1.22), 0.0, 1.0);
        float openingSpatter = smoothstep(0.70, 0.975, hash(floor((aspectUv + warp * 0.68) * uResolution.y * 0.052 + uTime * 4.4))) * edgeParticleBand;
        openingSpatter = mix(openingSpatter, max(openingSpatter, thresholdParticles), uDepthThresholdMode);
        float thresholdInkDetail = thresholdVeins * 0.24 + thresholdEmber * 0.50 + thresholdParticles * 1.08 + thresholdParticleCore * 0.72;
        float openingInkMask = clamp(
          max(
            openingBreakup * 0.95 + openingSpatter * 0.50 + thresholdInkDetail * 0.42 * uDepthThresholdMode,
            figureInk * figureMask * 0.86
          ),
          0.0,
          1.0
        );
        float continuousGlow = softBand * (0.32 + energy * 0.30)
          + hotBand * (0.34 + energy * 0.28)
          + ember * 0.58
          + thresholdInkDetail * uDepthThresholdMode;
        float suppressedGlow = continuousGlow * openingInkMask * mix(0.18, 0.72, uDepthThresholdMode)
          + figureSeed * 0.13
          + figureIgnite * 0.20;
        glow = mix(continuousGlow, suppressedGlow, ringSuppress);
        float interiorGlow = smoothstep(0.18, 0.54, dissolve) * (1.0 - figureMask * ringSuppress * 0.68);
        float figureFlash = figureSeed * (0.38 + figureCore * 0.18) + figureIgnite * (0.56 + figureCore * 0.16);
        float farFlashFactor = mix(0.58, 0.76, clamp(uColorLift, 0.0, 1.0));
        float openingFlash = (figureFlash * 0.92 + interiorGlow * 0.78 + ember * 0.24 + thresholdInkDetail * 0.36 * uDepthThresholdMode)
          * openingInkMask
          * flashWindow
          * mix(1.0, farFlashFactor, uFarOnly);

        vec2 imageUv = (uv - uImageCenter) / max(0.1, uImageScale) + uImageCenter;
        vec2 imageResolution = uResolution;
        if (uUseImageRect > 0.5) {
          imageUv = (uv - uImageRect.xy) / max(vec2(0.001), uImageRect.zw);
          imageResolution = max(vec2(1.0), uImageRect.zw * uResolution);
        }
        vec2 nextUv = coverUv(imageUv, uNextSize, imageResolution);
        vec3 nextScene = texture2D(uNextScene, nextUv).rgb;
        vec3 nextFallback = mix(vec3(0.020, 0.034, 0.030), vec3(1.0), uDepthThresholdMode);
        nextScene = mix(nextFallback, nextScene, uNextReady);
        float nextLuma = dot(nextScene, vec3(0.2126, 0.7152, 0.0722));
        vec2 perlinWarp = vec2(
          fbm(nextUv * 2.1 + vec2(uTime * 0.09, -uTime * 0.08)),
          fbm(nextUv * 2.1 + vec2(8.3 - uTime * 0.08, 14.9 + uTime * 0.09))
        ) - 0.5;
        float perlinField = fbm(nextUv * 3.8 + perlinWarp * 0.42 + vec2(uTime * 0.08, uTime * 0.24));
        float perlinCloud = fbm(nextUv * 1.42 + perlinWarp * 0.72 + vec2(-uTime * 0.065, uTime * 0.140));
        float perlinDetail = fbm(nextUv * 7.4 - perlinWarp * 0.38 + vec2(uTime * 0.115, -uTime * 0.065));
        float perlinValue = clamp(perlinCloud * 0.64 + perlinField * 0.28 + perlinDetail * 0.08, 0.0, 1.0);
        float perlinLight = smoothstep(0.34, 0.70, perlinValue);
        float perlinDark = 1.0 - smoothstep(0.28, 0.58, perlinValue);
        float sceneMask = smoothstep(0.035, 0.24, nextLuma) * uNextReady;
        float highlightCore = highlightFromColor(nextScene) * sceneMask;
        vec2 texel = 1.0 / max(uNextSize, vec2(1.0));
        float highlightBlur = highlightCore * 0.30;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(18.0, 0.0)).rgb) * 0.12;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(-18.0, 0.0)).rgb) * 0.12;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(0.0, 18.0)).rgb) * 0.12;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(0.0, -18.0)).rgb) * 0.12;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(42.0, 24.0)).rgb) * 0.10;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(-42.0, -24.0)).rgb) * 0.10;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(-34.0, 38.0)).rgb) * 0.09;
        highlightBlur += highlightFromColor(texture2D(uNextScene, nextUv + texel * vec2(34.0, -38.0)).rgb) * 0.09;
        highlightBlur = clamp(highlightBlur, 0.0, 1.0) * sceneMask;
        float perlinMask = clamp(smoothstep(0.30, 0.62, perlinValue) * (0.42 + perlinDetail * 0.58), 0.0, 1.0);
        float transitionPulse = 0.62 + sin(clamp(p, 0.0, 1.0) * 3.14159265) * 0.22;
        float perlinResolve = smoothstep(0.015, 0.42, p) * (1.0 - smoothstep(0.92, 1.0, p) * 0.14) * uNextReady * uPerlinOverlay;
        vec3 perlinTint = mix(vec3(0.36, 0.74, 0.60), vec3(0.95, 0.72, 0.34), smoothstep(0.25, 0.94, fbm(nextUv * 5.0 + uTime * 0.035)));
        float highlightPerlin = clamp((perlinMask + perlinCloud * 0.46) * perlinResolve * uPerlinStrength, 0.0, 1.85);
        nextScene *= 1.0 - highlightBlur * (1.0 - perlinMask) * perlinResolve * uPerlinStrength * 0.18;
        nextScene += perlinTint * highlightBlur * highlightPerlin * transitionPulse * 1.85;
        nextScene += perlinTint * highlightCore * highlightPerlin * 0.82;
        nextScene *= uSceneBrightness;
        float innerLift = smoothstep(0.06, 0.74, p);
        vec3 innerColor = mix(nextScene * 0.42, nextScene * 1.14 + vec3(0.055, 0.043, 0.018), innerLift);
        innerColor = mix(innerColor, nextScene * 1.02, late * 0.65);
        innerColor = mix(innerColor, innerColor * 1.08 + vec3(0.015, 0.035, 0.026), nearSoftBand * 0.34);
        innerColor = mix(innerColor, nextScene, uFarOnly);
        innerColor = mix(innerColor, nextScene, uDepthThresholdMode);

        float outsideAlpha = (1.0 - dissolve) * (0.05 + p * 0.34 + late * 0.22) * (1.0 - uTransparentOutside);
        float insideMask = smoothstep(0.08, 0.42, dissolve);
        float depthThresholdMask = step(0.0, thresholdEdge);
        insideMask = mix(insideMask, depthThresholdMask, uDepthThresholdMode);
        vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.90, fbm(aspectUv * (4.5 + zDepth * 4.0) + uTime * 0.04)));
        vec3 outsideColor = vec3(0.012, 0.022, 0.018);
        vec3 color = mix(outsideColor, innerColor, insideMask);
        float farGlowFactor = mix(0.14, 0.46, clamp(uColorLift, 0.0, 1.0));
        float glowMix = glow * mix(1.0, farGlowFactor, uFarOnly) * mix(1.0, 0.84, uDepthThresholdMode);
        color = mix(color, edgeColor, clamp(glowMix, 0.0, 0.80));
        color += mix(jade, gold, thresholdParticleSeed)
          * (thresholdParticles * 0.52 + thresholdParticleCore * 0.64)
          * uDepthThresholdMode;
        vec3 flashColor = mix(vec3(1.0, 0.92, 0.62), edgeColor, smoothstep(0.18, 0.46, p));
        color += flashColor * figureAura * mix(1.90, 0.34, uDepthThresholdMode);
        color += flashColor * clamp(openingFlash, 0.0, 0.78) * mix(0.98, 0.22, uDepthThresholdMode);

        float alpha = mix(outsideAlpha, 1.0, insideMask);
        float edgeAlpha = softBand * 0.10
          + hotBand * 0.18
          + nearSoftBand * 0.12
          + ember * 0.24
          + thresholdInkDetail * 0.48 * uDepthThresholdMode
          + thresholdParticleCore * 0.34 * uDepthThresholdMode;
        alpha += mix(edgeAlpha, edgeAlpha * openingInkMask * mix(0.28, 0.70, uDepthThresholdMode), ringSuppress);
        alpha += figureAura * 0.24;
        alpha += openingFlash * 0.16;
        alpha += smoothstep(0.90, 1.0, p) * 0.08;
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Ink shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Ink shader link failed:', gl.getProgramInfoLog(program));
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
      nextScene: gl.getUniformLocation(program, 'uNextScene'),
      nextSize: gl.getUniformLocation(program, 'uNextSize'),
      nextReady: gl.getUniformLocation(program, 'uNextReady'),
      backDepth: gl.getUniformLocation(program, 'uBackDepth'),
      middleDepth: gl.getUniformLocation(program, 'uMiddleDepth'),
      depthSize: gl.getUniformLocation(program, 'uDepthSize'),
      depthReady: gl.getUniformLocation(program, 'uDepthReady'),
      farOnly: gl.getUniformLocation(program, 'uFarOnly'),
      imageScale: gl.getUniformLocation(program, 'uImageScale'),
      imageCenter: gl.getUniformLocation(program, 'uImageCenter'),
      inkCenter: gl.getUniformLocation(program, 'uInkCenter'),
      progressSpan: gl.getUniformLocation(program, 'uProgressSpan'),
      colorLift: gl.getUniformLocation(program, 'uColorLift'),
      particleStrength: gl.getUniformLocation(program, 'uParticleStrength'),
      imageRect: gl.getUniformLocation(program, 'uImageRect'),
      useImageRect: gl.getUniformLocation(program, 'uUseImageRect'),
      figureMask: gl.getUniformLocation(program, 'uFigureMask'),
      figureRect: gl.getUniformLocation(program, 'uFigureRect'),
      figureReady: gl.getUniformLocation(program, 'uFigureReady'),
      useFigureMask: gl.getUniformLocation(program, 'uUseFigureMask'),
      perlinOverlay: gl.getUniformLocation(program, 'uPerlinOverlay'),
      perlinStrength: gl.getUniformLocation(program, 'uPerlinStrength'),
      sceneBrightness: gl.getUniformLocation(program, 'uSceneBrightness'),
      depthThresholdMode: gl.getUniformLocation(program, 'uDepthThresholdMode'),
      transparentOutside: gl.getUniformLocation(program, 'uTransparentOutside')
    };

    const createTextureLayer = (src, fallback) => {
      const texture = gl.createTexture();
      const layer = { texture, width: 1, height: 1, ready: 0, lastRevision: null, lastUploadAt: -Infinity };
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));

      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (destroyed) return;
        layer.width = image.naturalWidth || 1;
        layer.height = image.naturalHeight || 1;
        layer.ready = 1;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        layer.lastRevision = null;
        layer.lastUploadAt = -Infinity;
      };
      image.src = src;
      return layer;
    };

    const bindLayer = (unit, layer) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
    };

    const nextLayer = createTextureLayer(targetSrc, [5, 8, 7, 255]);
    nextLayer.element = options.nextSceneElement || null;
    const backDepthLayer = createTextureLayer(assets.backDepthSrc || '', [0, 0, 0, 255]);
    const middleDepthLayer = createTextureLayer(assets.middleDepthSrc || '', [0, 0, 0, 255]);
    const figureLayer = {
      texture: gl.createTexture(),
      width: 1,
      height: 1,
      ready: 0,
      element: options.figureMaskElement || null,
      lastRevision: null,
      lastUploadAt: -Infinity
    };
    gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    const sourceRevision = (source) => {
      if (!source) return null;
      if (typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement) {
        return Number.isFinite(source.currentTime) ? source.currentTime.toFixed(3) : null;
      }
      return source.dataset?.inkTextureRevision ?? null;
    };

    const recordTextureUpload = (source) => {
      if (!source?.dataset) return;
      source.dataset.r4InkTextureUploads = String(Number(source.dataset.r4InkTextureUploads || 0) + 1);
    };

    const updateFigureLayer = (now) => {
      const source = figureLayer.element;
      const isMediaSource = typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement;
      const sourceWidth = isMediaSource ? source?.videoWidth : (source?.width || source?.naturalWidth || 0);
      const sourceHeight = isMediaSource ? source?.videoHeight : (source?.height || source?.naturalHeight || 0);
      const sourceReady = isMediaSource
        ? source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        : source?.dataset?.inkTextureReady === 'true';

      if (!source || !sourceReady || !sourceWidth || !sourceHeight) {
        figureLayer.ready = 0;
        return;
      }
      const nextRevision = sourceRevision(source);
      if (!dynamicTextureUploadDue({
        fps: dynamicTextureFps,
        lastRevision: figureLayer.lastRevision,
        nextRevision,
        lastUploadAt: figureLayer.lastUploadAt,
        now
      })) return;
      try {
        figureLayer.width = sourceWidth;
        figureLayer.height = sourceHeight;
        figureLayer.ready = 1;
        gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        figureLayer.lastRevision = nextRevision;
        figureLayer.lastUploadAt = now;
        recordTextureUpload(source);
      } catch {
        figureLayer.ready = 0;
      }
    };

    const updateElementLayer = (layer, now) => {
      const element = layer.element;
      if (!element || !element.width || !element.height) return;
      if (element.dataset?.inkTextureReady !== 'true') return;
      const nextRevision = sourceRevision(element);
      if (!dynamicTextureUploadDue({
        fps: dynamicTextureFps,
        lastRevision: layer.lastRevision,
        nextRevision,
        lastUploadAt: layer.lastUploadAt,
        now
      })) return;
      try {
        layer.width = element.width;
        layer.height = element.height;
        layer.ready = 1;
        gl.bindTexture(gl.TEXTURE_2D, layer.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
        layer.lastRevision = nextRevision;
        layer.lastUploadAt = now;
        recordTextureUpload(element);
      } catch {
        // Keep the last uploaded texture if the dynamic source is briefly unavailable.
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, dprLimit);
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
    bindLayer(0, nextLayer);
    gl.uniform1i(uniforms.nextScene, 0);
    bindLayer(1, backDepthLayer);
    gl.uniform1i(uniforms.backDepth, 1);
    bindLayer(2, middleDepthLayer);
    gl.uniform1i(uniforms.middleDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
    gl.uniform1i(uniforms.figureMask, 3);

    return {
      render(progress, pointerX, pointerY, visibilityProgress = progress, renderOptions = {}) {
        if (destroyed) return;
        const active = visibilityProgress > 0.002 && !(hideAtEnd && visibilityProgress > 0.999);
        const exitFade = hideAtEnd
          ? 1 - smoothStep(clamp((visibilityProgress - 0.94) / 0.055, 0, 1))
          : 1;
        canvas.style.visibility = active ? 'visible' : 'hidden';
        canvas.style.opacity = active ? exitFade.toFixed(4) : '0';
        if (!resize()) return;

        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!active) return;

        const now = performance.now();
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, width, height);
        gl.uniform2f(
          uniforms.mouse,
          clamp(pointerX / Math.max(1, window.innerWidth), -0.5, 0.5),
          clamp(pointerY / Math.max(1, window.innerHeight), -0.5, 0.5)
        );
        gl.uniform1f(uniforms.progress, progress);
        gl.uniform1f(uniforms.time, now * 0.001);
        updateElementLayer(nextLayer, now);
        updateFigureLayer(now);
        bindLayer(0, nextLayer);
        bindLayer(1, backDepthLayer);
        bindLayer(2, middleDepthLayer);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
        gl.uniform2f(uniforms.nextSize, nextLayer.width, nextLayer.height);
        gl.uniform1f(uniforms.nextReady, nextLayer.ready);
        gl.uniform2f(uniforms.depthSize, middleDepthLayer.width || backDepthLayer.width, middleDepthLayer.height || backDepthLayer.height);
        gl.uniform1f(uniforms.depthReady, Math.min(backDepthLayer.ready, middleDepthLayer.ready));
        gl.uniform1f(uniforms.farOnly, farOnly);
        gl.uniform1f(uniforms.imageScale, options.imageScale || 1);
        gl.uniform2f(uniforms.imageCenter, options.imageCenterX || 0.5, options.imageCenterY || 0.5);
        gl.uniform2f(uniforms.inkCenter, options.inkCenterX || 0.50, options.inkCenterY || 0.54);
        gl.uniform1f(uniforms.progressSpan, options.progressSpan || 1.16);
        gl.uniform1f(uniforms.colorLift, colorLift);
        gl.uniform1f(uniforms.particleStrength, particleStrength);
        gl.uniform1f(uniforms.perlinOverlay, options.perlinOverlay ? 1 : 0);
        gl.uniform1f(uniforms.perlinStrength, renderOptions.perlinStrength ?? options.perlinStrength ?? 0.34);
        gl.uniform1f(uniforms.sceneBrightness, renderOptions.sceneBrightness ?? options.sceneBrightness ?? 1);
        gl.uniform1f(uniforms.depthThresholdMode, options.depthThresholdMode ? 1 : 0);
        gl.uniform1f(uniforms.transparentOutside, options.transparentOutside ? 1 : 0);
        const canvasRect = canvas.getBoundingClientRect();
        const sourceRect = options.sourceElement?.getBoundingClientRect?.();
        const useImageRect = sourceRect && sourceRect.width > 0 && sourceRect.height > 0 && canvasRect.width > 0 && canvasRect.height > 0;
        if (useImageRect) {
          gl.uniform4f(
            uniforms.imageRect,
            (sourceRect.left - canvasRect.left) / canvasRect.width,
            (canvasRect.bottom - sourceRect.bottom) / canvasRect.height,
            sourceRect.width / canvasRect.width,
            sourceRect.height / canvasRect.height
          );
        } else {
          gl.uniform4f(uniforms.imageRect, 0, 0, 1, 1);
        }
        gl.uniform1f(uniforms.useImageRect, useImageRect ? 1 : 0);
        const figureRect = figureLayer.element?.getBoundingClientRect?.();
        const useFigureMask = figureLayer.ready && figureRect && figureRect.width > 0 && figureRect.height > 0 && canvasRect.width > 0 && canvasRect.height > 0;
        if (useFigureMask) {
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
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      prewarm() {
        this.render(0.003, 0, 0);
        canvas.style.visibility = 'hidden';
        canvas.style.opacity = '0';
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        releaseInkWebGlResources(gl, {
          buffer,
          program,
          shaders: [vertexShader, fragmentShader],
          textures: [nextLayer.texture, backDepthLayer.texture, middleDepthLayer.texture, figureLayer.texture]
        });
        canvas.width = 0;
        canvas.height = 0;
        canvas.style.visibility = 'hidden';
        canvas.style.opacity = '0';
      }
    };
  }
