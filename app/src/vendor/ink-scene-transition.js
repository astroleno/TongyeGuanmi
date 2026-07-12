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

export function createInkBoundaryTransition(canvas, options = {}) {
  if (!canvas) return null;
  const colorLift = clamp(options.colorLift ?? 0.32, 0, 1);
  const coverAlpha = clamp(options.coverAlpha ?? 0, 0, 1);
  const fadeOutStart = clamp(options.fadeOutStart ?? 0.94, 0, 0.98);
  const fadeOutEnd = Math.max(fadeOutStart + 0.01, clamp(options.fadeOutEnd ?? 0.995, 0.01, 1));
  const dprLimit = Math.max(0.5, Math.min(1.25, options.dprLimit ?? 1));
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
    uniform float uProgress;
    uniform float uTime;
    uniform float uSeed;
    uniform float uColorLift;
    uniform float uCoverAlpha;
    uniform float uFieldMode;
    uniform float uFieldDirection;
    uniform vec2 uFieldOrigin;
    uniform float uFieldRadiusScale;
    uniform sampler2D uDepthMap;
    uniform float uDepthReady;
    uniform vec2 uDepthViewport;
    uniform vec4 uDepthCover;
    uniform vec4 uDepthCamera;
    uniform vec2 uDepthOrigin;
    uniform float uOwnershipGateRank;
    uniform vec2 uOwnershipCore;
    uniform float uOcclusionAlphaMin;

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

    float horizontalRankForDirection(vec2 uv, float direction) {
      return direction < 0.5 ? 1.0 - uv.y : uv.y;
    }

    float horizontalRank(vec2 uv) {
      return horizontalRankForDirection(uv, uFieldDirection);
    }

    float radialRank(vec2 uv, float aspect) {
      vec2 delta = (uv - uFieldOrigin) * vec2(aspect, 1.0);
      return length(delta) / max(uFieldRadiusScale, 0.0001);
    }

    float depthRank(vec2 uv) {
      vec2 viewport = max(uDepthViewport, vec2(1.0));
      vec2 screenPx = vec2(uv.x * viewport.x, (1.0 - uv.y) * viewport.y);
      vec2 coverSize = max(uDepthCover.zw, vec2(1.0));
      vec2 cameraOrigin = uDepthCover.xy + uDepthOrigin * coverSize;
      float cameraScale = max(uDepthCamera.x, 0.0001);
      vec2 sourcePx = cameraOrigin
        + (screenPx - uDepthCamera.yz - cameraOrigin) / cameraScale;
      vec2 depthUv = (sourcePx - uDepthCover.xy) / coverSize;
      float inside = step(0.0, depthUv.x) * step(depthUv.x, 1.0)
        * step(0.0, depthUv.y) * step(depthUv.y, 1.0);
      float sampledDepth = texture2D(uDepthMap, vec2(depthUv.x, 1.0 - depthUv.y)).r;
      return mix(1.0, sampledDepth, inside * uDepthReady);
    }

    float ownershipOcclusion(
      float rank,
      float gateRank,
      vec2 core,
      float alphaMin,
      float warp
    ) {
      float halfWidth = max(max(gateRank - core.x, core.y - gateRank), 0.0001);
      float normalizedDistance = abs(rank - gateRank) / halfWidth * warp;
      float envelope = 1.0 - smoothstep(0.18, 1.0, normalizedDistance);
      return clamp(alphaMin, 0.0, 1.0) * envelope;
    }

    void main() {
      float p = clamp(uProgress, 0.0, 1.0);
      float energy = sin(p * 3.14159265);
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 uv = vUv;
      vec2 aspectUv = vec2(uv.x * aspect, uv.y);
      float horizontal = horizontalRank(uv);
      float radial = radialRank(uv, aspect);
      float depth = depthRank(uv);
      float baseRank = mix(horizontal, radial, step(0.5, uFieldMode));
      baseRank = mix(baseRank, depth, step(1.5, uFieldMode));

      vec2 bodyPhase = vec2(uSeed * 19.17 + 3.4, uSeed * 37.11 + 8.7);
      vec2 warpUv = aspectUv * 2.35 + bodyPhase;
      vec2 warp = vec2(
        fbm(warpUv + vec2(1.7, 4.1)),
        fbm(warpUv + vec2(8.3, 2.2))
      ) - 0.5;
      float broad = fbm(aspectUv * 2.10 + warp * 0.72 + bodyPhase * 0.31);
      float wet = fbm(aspectUv * 7.25 + warp * 1.65 + vec2(broad * 1.7, 0.0) - bodyPhase * 0.17);
      float pore = fbm(aspectUv * 25.0 - warp * 2.55 + vec2(bodyPhase.y * 0.11, broad * 1.35));
      float column = fbm(vec2(uv.x * 4.65 + bodyPhase.x * 0.13, broad * 0.72 + bodyPhase.y * 0.09));
      float rankEdge = p - baseRank;
      float edgeBand = 1.0 - smoothstep(0.02, 0.34, abs(rankEdge));
      float upwardRun = smoothstep(-0.30, -0.02, rankEdge)
        * (1.0 - smoothstep(-0.02, 0.04, rankEdge));
      float tendril = smoothstep(0.56, 0.92, column + wet * 0.30)
        * (edgeBand * 0.62 + upwardRun * 0.72)
        * smoothstep(0.08, 0.82, p);
      float mud = fbm(aspectUv * 4.5 + warp * 1.65 + bodyPhase * 0.19) * 0.30;
      mud += fbm(aspectUv * 13.5 - warp * 2.6 - bodyPhase * 0.23) * 0.105;
      mud += fbm(aspectUv * 31.0 + warp * 3.2 + bodyPhase * 0.29) * 0.035;
      float ripple = sin((baseRank * 9.5 + aspectUv.x * 3.2 + broad * 2.2 + uSeed * 6.2831853) * 8.0)
        * 0.006 * energy;
      float openingBreakup = smoothstep(0.30, 0.72, fbm(aspectUv * 8.4 + warp * 2.6 + bodyPhase * 0.27));
      openingBreakup *= smoothstep(0.22, 0.62, fbm(aspectUv * 23.0 - warp * 3.4 - bodyPhase * 0.21));
      float field = (broad - 0.5) * 0.118
        + (wet - 0.5) * 0.078
        + (pore - 0.5) * 0.024
        + mud * 0.10
        + ripple;
      field -= openingBreakup * edgeBand * 0.045;
      float edge = p + tendril * (0.058 + wet * 0.116) - (baseRank + field);

      float body = smoothstep(-0.040, 0.085, edge);
      float feather = 1.0 - smoothstep(0.0, 0.132, abs(edge));
      float hot = 1.0 - smoothstep(0.0, 0.034, abs(edge));
      float seamBelt = 1.0 - smoothstep(0.034, 0.112, abs(edge));
      float proceduralOcclusion = seamBelt * uOcclusionAlphaMin;
      float ownershipWarp = clamp(1.0 + field * 2.4 + (wet - 0.5) * 0.35, 0.62, 1.38);
      float primaryOwnershipOcclusion = ownershipOcclusion(
        baseRank,
        uOwnershipGateRank,
        uOwnershipCore,
        uOcclusionAlphaMin,
        ownershipWarp
      );
      float seamOcclusion = max(
        proceduralOcclusion,
        primaryOwnershipOcclusion
      );
      float veins = smoothstep(0.66, 0.97, wet + pore * 0.34) * feather;
      float openingSpatter = smoothstep(
        0.70,
        0.985,
        hash(floor((aspectUv + warp * 0.68) * uResolution.y * 0.052 + uTime * 4.4))
      );
      float ember = feather * openingSpatter * (0.12 + energy * 0.46);
      vec2 particleUv = aspectUv * vec2(42.0, 48.0) + warp * 1.35 + vec2(0.0, -uTime * 0.12);
      vec2 particleCell = floor(particleUv);
      vec2 particleLocal = fract(particleUv) - 0.5;
      float particleSeed = hash(particleCell + bodyPhase);
      vec2 particleJitter = vec2(
        hash(particleCell + vec2(17.3, 5.1) + bodyPhase),
        hash(particleCell + vec2(43.7, 9.8) - bodyPhase)
      ) - 0.5;
      float particleRadius = mix(0.075, 0.190, hash(particleCell + vec2(2.6, 11.9)));
      float particleDot = 1.0 - smoothstep(
        particleRadius * 0.28,
        particleRadius,
        length(particleLocal - particleJitter * 0.38)
      );
      float particleWindow = (1.0 - smoothstep(0.026, 0.290, abs(edge)))
        * smoothstep(0.06, 0.94, p);
      float sprayWindow = smoothstep(-0.240, -0.030, edge)
        * (1.0 - smoothstep(-0.030, 0.130, edge))
        * smoothstep(0.08, 0.86, p);
      particleWindow = max(particleWindow * 0.72, sprayWindow);
      float particles = particleDot
        * smoothstep(0.860, 0.975, particleSeed)
        * particleWindow
        * (0.40 + energy * 0.66);
      float particleCore = particles * smoothstep(0.55, 0.98, particleDot);
      float late = smoothstep(0.94, 1.0, p);

      vec3 ink = mix(vec3(0.006, 0.012, 0.010), vec3(0.016, 0.032, 0.026), broad * 0.56);
      vec3 jade = vec3(0.24, 0.66, 0.56);
      vec3 gold = vec3(0.88, 0.72, 0.38);
      vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.94, broad + pore * 0.24));
      vec3 color = ink;
      color += edgeColor
        * (feather * 0.24 + hot * 0.22 + veins * 0.082 + ember * 0.32 + particles * 0.88)
        * mix(0.24, 0.86, uColorLift);
      color += mix(jade, gold, particleSeed) * particles * mix(0.16, 0.58, uColorLift);
      color += mix(vec3(0.28, 0.78, 0.66), vec3(0.96, 0.80, 0.42), particleSeed)
        * particleCore * mix(0.22, 0.74, uColorLift);
      color += vec3(0.025, 0.075, 0.060)
        * openingBreakup * feather * mix(0.08, 0.34, uColorLift);
      color += edgeColor * tendril * mud * 0.08 * mix(0.20, 0.72, uColorLift);
      color = mix(color, vec3(0.004, 0.008, 0.007), late * 0.35);

      float coreWash = body * uCoverAlpha * (0.89 + late * 0.12);
      float alpha = coreWash;
      alpha += feather * 0.18 + hot * 0.13 + veins * 0.05
        + ember * 0.28 + particles * 0.76 + particleCore * 0.36;
      alpha = max(alpha, seamOcclusion);
      alpha = clamp(alpha, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Ink field shader compile failed:', gl.getShaderInfoLog(shader));
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
    console.warn('Ink field shader link failed:', gl.getProgramInfoLog(program));
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
    seed: gl.getUniformLocation(program, 'uSeed'),
    colorLift: gl.getUniformLocation(program, 'uColorLift'),
    coverAlpha: gl.getUniformLocation(program, 'uCoverAlpha'),
    fieldMode: gl.getUniformLocation(program, 'uFieldMode'),
    fieldDirection: gl.getUniformLocation(program, 'uFieldDirection'),
    fieldOrigin: gl.getUniformLocation(program, 'uFieldOrigin'),
    fieldRadiusScale: gl.getUniformLocation(program, 'uFieldRadiusScale'),
    depthMap: gl.getUniformLocation(program, 'uDepthMap'),
    depthReady: gl.getUniformLocation(program, 'uDepthReady'),
    depthViewport: gl.getUniformLocation(program, 'uDepthViewport'),
    depthCover: gl.getUniformLocation(program, 'uDepthCover'),
    depthCamera: gl.getUniformLocation(program, 'uDepthCamera'),
    depthOrigin: gl.getUniformLocation(program, 'uDepthOrigin'),
    ownershipGateRank: gl.getUniformLocation(program, 'uOwnershipGateRank'),
    ownershipCore: gl.getUniformLocation(program, 'uOwnershipCore'),
    occlusionAlphaMin: gl.getUniformLocation(program, 'uOcclusionAlphaMin')
  };

  const depthTexture = gl.createTexture();
  if (!depthTexture) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255])
  );

  let width = 0;
  let height = 0;
  let destroyed = false;
  let depthSource = '';
  let depthReady = false;
  let depthImage = null;

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

  const ensureDepthMap = (frame) => {
    if (frame?.spec?.kind !== 'depth' || frame.spec.depthSrc === depthSource) {
      return;
    }
    depthSource = frame.spec.depthSrc;
    depthReady = false;
    if (typeof Image === 'undefined') {
      return;
    }
    const image = new Image();
    depthImage = image;
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (destroyed || image !== depthImage || frame.spec.depthSrc !== depthSource) {
        return;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      depthReady = true;
    };
    image.onerror = () => {
      if (image === depthImage) {
        depthReady = false;
      }
    };
    image.src = depthSource;
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA
  );
  gl.clearColor(0, 0, 0, 0);

  return {
    render(frame) {
      if (destroyed || !frame) return;
      const visibleProgress = clamp(frame.progress ?? 0, 0, 1);
      const fadeIn = smoothStep(clamp(visibleProgress / 0.06, 0, 1));
      const fadeOut = 1 - smoothStep(
        clamp((visibleProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart), 0, 1)
      );
      const canvasOpacity = fadeIn * fadeOut;
      const active = canvasOpacity > 0.002;
      canvas.style.visibility = active ? 'visible' : 'hidden';
      canvas.style.opacity = active ? canvasOpacity.toFixed(4) : '0';
      ensureDepthMap(frame);
      if (!resize()) return;

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!active) return;

      const spec = frame.spec;
      const origin = spec.kind === 'radial'
        ? spec.origin
        : spec.kind === 'horizontal'
          ? { x: 0.5, y: spec.direction === 'bottom-to-top' ? 1 : 0 }
          : { x: 0.5, y: 0.5 };
      const aspect = width / Math.max(height, 1);
      const radiusScale = Math.max(
        Math.hypot(origin.x * aspect, origin.y),
        Math.hypot((1 - origin.x) * aspect, origin.y),
        Math.hypot(origin.x * aspect, 1 - origin.y),
        Math.hypot((1 - origin.x) * aspect, 1 - origin.y)
      );
      const transform = spec.kind === 'depth' ? spec.transform : null;
      const depthViewport = transform?.viewport ?? { width, height };
      const depthCover = transform?.cover ?? { x: 0, y: 0, width: depthViewport.width, height: depthViewport.height };
      const depthCamera = transform?.camera ?? {
        scale: 1,
        translateX: 0,
        translateY: 0,
        originX: 0.5,
        originY: 0.5
      };

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.progress, visibleProgress);
      gl.uniform1f(uniforms.time, performance.now() * 0.001);
      gl.uniform1f(uniforms.seed, frame.seed / 0xffffffff);
      gl.uniform1f(uniforms.colorLift, colorLift);
      gl.uniform1f(uniforms.coverAlpha, coverAlpha);
      gl.uniform1f(uniforms.fieldMode, spec.kind === 'radial' ? 1 : spec.kind === 'depth' ? 2 : 0);
      gl.uniform1f(
        uniforms.fieldDirection,
        spec.kind === 'horizontal' && spec.direction === 'bottom-to-top' ? 1 : 0
      );
      gl.uniform2f(uniforms.fieldOrigin, origin.x, 1 - origin.y);
      gl.uniform1f(uniforms.fieldRadiusScale, radiusScale);
      gl.uniform1i(uniforms.depthMap, 0);
      gl.uniform1f(uniforms.depthReady, spec.kind === 'depth' && depthReady ? 1 : 0);
      gl.uniform2f(uniforms.depthViewport, depthViewport.width, depthViewport.height);
      gl.uniform4f(
        uniforms.depthCover,
        depthCover.x,
        depthCover.y,
        depthCover.width,
        depthCover.height
      );
      gl.uniform4f(
        uniforms.depthCamera,
        depthCamera.scale,
        depthCamera.translateX,
        depthCamera.translateY,
        0
      );
      gl.uniform2f(uniforms.depthOrigin, depthCamera.originX, depthCamera.originY);
      gl.uniform1f(uniforms.ownershipGateRank, frame.occlusion.gateRank);
      gl.uniform2f(
        uniforms.ownershipCore,
        frame.occlusion.coreMin,
        frame.occlusion.coreMax
      );
      gl.uniform1f(uniforms.occlusionAlphaMin, frame.occlusion.alphaMin);
      if (canvas.dataset) {
        canvas.dataset.r4InkBoundaryKind = spec.kind;
        canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
        canvas.dataset.r4InkBoundaryProgress = visibleProgress.toFixed(4);
        canvas.dataset.r4InkFieldSeed = String(frame.seed);
        delete canvas.dataset.r4InkBoundaryRevision;
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    prewarm(frame) {
      this.render(frame);
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (depthImage) {
        depthImage.onload = null;
        depthImage.onerror = null;
      }
      releaseInkWebGlResources(gl, {
        buffer,
        program,
        shaders: [vertexShader, fragmentShader],
        textures: [depthTexture]
      });
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    }
  };
}
