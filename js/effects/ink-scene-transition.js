const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);

export function createInkCurtainTransition(canvas, options = {}) {
    if (!canvas) return null;
    const colorLift = clamp(options.colorLift ?? 0.32, 0, 1);
    const progressSpan = Math.max(0.01, options.progressSpan || 1);
    const direction = options.direction === 'top-down' ? 1 : 0;

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
      uniform float uDirection;
      uniform float uProgressSpan;

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

        float coreWash = body * (0.14 + late * 0.08);
        float alpha = coreWash;
        alpha += feather * 0.18 + hot * 0.13 + veins * 0.05 + ember * 0.28 + particles * 0.76 + particleCore * 0.36;
        alpha = clamp(alpha, 0.0, 1.0);

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
      direction: gl.getUniformLocation(program, 'uDirection'),
      progressSpan: gl.getUniformLocation(program, 'uProgressSpan')
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

    return {
      render(progress, pointerX = 0, pointerY = 0) {
        const visibleProgress = clamp(progress, 0, 1);
        const active = visibleProgress > 0.002;
        canvas.style.visibility = active ? 'visible' : 'hidden';
        canvas.style.opacity = active ? smoothStep(clamp(visibleProgress / 0.08, 0, 1)).toFixed(4) : '0';
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
        gl.uniform1f(uniforms.direction, direction);
        gl.uniform1f(uniforms.progressSpan, progressSpan);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      prewarm() {
        this.render(0.003, 0, 0);
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
      uniform vec4 uImageRect;
      uniform float uUseImageRect;
      uniform sampler2D uFigureMask;
      uniform vec4 uFigureRect;
      uniform float uFigureReady;
      uniform float uUseFigureMask;

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
        float flashWindow = smoothstep(0.0, 0.045, p) * (1.0 - smoothstep(0.56, 0.82, p));
        float ringSuppress = 1.0 - smoothstep(0.42, 0.72, p);
        float openingBreakup = smoothstep(0.30, 0.72, fbm(aspectUv * 8.4 + warp * 2.6 - uTime * 0.08));
        openingBreakup *= smoothstep(0.22, 0.62, fbm(aspectUv * 23.0 - warp * 3.4 + uTime * 0.13));
        float edgeParticleBand = clamp(max(softBand * 1.08, hotBand * 1.22), 0.0, 1.0);
        float openingSpatter = smoothstep(0.70, 0.975, hash(floor((aspectUv + warp * 0.68) * uResolution.y * 0.052 + uTime * 4.4))) * edgeParticleBand;
        float openingInkMask = clamp(max(openingBreakup * 0.95 + openingSpatter * 0.50, figureInk * figureMask * 0.86), 0.0, 1.0);
        float continuousGlow = softBand * (0.32 + energy * 0.30) + hotBand * (0.34 + energy * 0.28) + ember * 0.58;
        glow = mix(continuousGlow, continuousGlow * openingInkMask * 0.18 + figureSeed * 0.13 + figureIgnite * 0.20, ringSuppress);
        float interiorGlow = smoothstep(0.18, 0.54, dissolve) * (1.0 - figureMask * ringSuppress * 0.68);
        float figureFlash = figureSeed * (0.38 + figureCore * 0.18) + figureIgnite * (0.56 + figureCore * 0.16);
        float farFlashFactor = mix(0.58, 0.76, clamp(uColorLift, 0.0, 1.0));
        float openingFlash = (figureFlash * 0.92 + interiorGlow * 0.78 + ember * 0.24)
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
        nextScene = mix(vec3(0.020, 0.034, 0.030), nextScene, uNextReady);
        float innerLift = smoothstep(0.06, 0.74, p);
        vec3 innerColor = mix(nextScene * 0.42, nextScene * 1.14 + vec3(0.055, 0.043, 0.018), innerLift);
        innerColor = mix(innerColor, nextScene * 1.02, late * 0.65);
        innerColor = mix(innerColor, innerColor * 1.08 + vec3(0.015, 0.035, 0.026), nearSoftBand * 0.34);
        innerColor = mix(innerColor, nextScene, uFarOnly);

        float outsideAlpha = (1.0 - dissolve) * (0.05 + p * 0.34 + late * 0.22);
        float insideMask = smoothstep(0.08, 0.42, dissolve);
        vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.90, fbm(aspectUv * (4.5 + zDepth * 4.0) + uTime * 0.04)));
        vec3 outsideColor = vec3(0.012, 0.022, 0.018);
        vec3 color = mix(outsideColor, innerColor, insideMask);
        float farGlowFactor = mix(0.14, 0.46, clamp(uColorLift, 0.0, 1.0));
        color = mix(color, edgeColor, clamp(glow * mix(1.0, farGlowFactor, uFarOnly), 0.0, 0.80));
        vec3 flashColor = mix(vec3(1.0, 0.92, 0.62), edgeColor, smoothstep(0.18, 0.46, p));
        color += flashColor * figureAura * 1.90;
        color += flashColor * clamp(openingFlash, 0.0, 0.78) * 0.98;

        float alpha = mix(outsideAlpha, 1.0, insideMask);
        float edgeAlpha = softBand * 0.10 + hotBand * 0.18 + nearSoftBand * 0.12 + ember * 0.24;
        alpha += mix(edgeAlpha, edgeAlpha * openingInkMask * 0.28, ringSuppress);
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
        imageRect: gl.getUniformLocation(program, 'uImageRect'),
      useImageRect: gl.getUniformLocation(program, 'uUseImageRect'),
      figureMask: gl.getUniformLocation(program, 'uFigureMask'),
      figureRect: gl.getUniformLocation(program, 'uFigureRect'),
      figureReady: gl.getUniformLocation(program, 'uFigureReady'),
      useFigureMask: gl.getUniformLocation(program, 'uUseFigureMask')
    };

    const createTextureLayer = (src, fallback) => {
      const texture = gl.createTexture();
      const layer = { texture, width: 1, height: 1, ready: 0 };
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));

      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        layer.width = image.naturalWidth || 1;
        layer.height = image.naturalHeight || 1;
        layer.ready = 1;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      };
      image.src = src;
      return layer;
    };

    const bindLayer = (unit, layer) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
    };

    const nextLayer = createTextureLayer(targetSrc, [5, 8, 7, 255]);
    const backDepthLayer = createTextureLayer(assets.backDepthSrc || '', [0, 0, 0, 255]);
    const middleDepthLayer = createTextureLayer(assets.middleDepthSrc || '', [0, 0, 0, 255]);
    const figureLayer = {
      texture: gl.createTexture(),
      width: 1,
      height: 1,
      ready: 0,
      element: options.figureMaskElement || null
    };
    gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    const updateFigureLayer = () => {
      const video = figureLayer.element;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        figureLayer.ready = 0;
        return;
      }
      try {
        figureLayer.width = video.videoWidth;
        figureLayer.height = video.videoHeight;
        figureLayer.ready = 1;
        gl.bindTexture(gl.TEXTURE_2D, figureLayer.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch {
        figureLayer.ready = 0;
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
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
      render(progress, pointerX, pointerY, visibilityProgress = progress) {
        const active = visibilityProgress > 0.002 && !(hideAtEnd && visibilityProgress > 0.999);
        const exitFade = hideAtEnd
          ? 1 - smoothStep(clamp((visibilityProgress - 0.94) / 0.055, 0, 1))
          : 1;
        canvas.style.visibility = active ? 'visible' : 'hidden';
        canvas.style.opacity = active ? exitFade.toFixed(4) : '0';
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
        gl.uniform1f(uniforms.progress, progress);
        gl.uniform1f(uniforms.time, performance.now() * 0.001);
        updateFigureLayer();
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
      }
    };
  }
