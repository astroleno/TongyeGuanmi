(() => {
  'use strict';

  const SELECTOR = '.shader-glass';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animateShader = document.documentElement.dataset.shaderMotion === 'play';
  const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
  const instances = new Set();

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform float u_radius;
    uniform float u_border;
    uniform float u_intensity;
    varying vec2 v_uv;

    #define t u_time

    mat2 rot(float a) {
      float c = cos(a), s = sin(a);
      return mat2(c, -s, s, c);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float mapNebula(vec3 p) {
      p.xz *= rot(t * 0.4);
      p.xy *= rot(t * 0.3);
      vec3 q = p * 2.0 + t;
      return length(p + vec3(sin(t * 0.7))) * log(length(p) + 1.0)
        + sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
    }

    float roundedBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
      vec2 frag = v_uv * u_resolution;
      vec2 center = u_resolution * 0.5;
      vec2 p = frag - center;
      float minAxis = min(u_resolution.x, u_resolution.y);
      float d = roundedBox(p, center - vec2(1.5), u_radius);
      float inside = 1.0 - smoothstep(0.0, 1.5, d);
      float depth = max(-d, 0.0);
      float shell = inside * (1.0 - smoothstep(u_border * 0.18, u_border * 1.24, depth));
      float softBody = inside * (1.0 - smoothstep(u_border * 0.40, u_border * 3.80, depth));
      float core = inside * smoothstep(u_border * 0.24, u_border * 1.75, depth);
      float innerLip = inside * (1.0 - smoothstep(1.0, 8.0, abs(depth - u_border * 0.92)));
      float outerLip = 1.0 - smoothstep(0.0, 5.0, abs(d));

      vec2 uv = (frag / minAxis) - vec2(0.9, 0.5);
      uv.x += 0.4 + (u_pointer.x - 0.5) * 0.14;
      uv.y += (u_pointer.y - 0.5) * 0.09;
      vec3 col = vec3(0.0);
      float ray = 2.5;

      for (int i = 0; i <= 5; i++) {
        vec3 rp = vec3(0.0, 0.0, 5.0) + normalize(vec3(uv, -1.0)) * ray;
        float rz = mapNebula(rp);
        float f = clamp((rz - mapNebula(rp + 0.1)) * 0.5, -0.1, 1.0);
        vec3 base = vec3(0.1, 0.3, 0.4) + vec3(5.0, 2.5, 3.0) * f;
        col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
        ray += min(rz, 1.0);
      }

      col = 1.0 - exp(-col * 0.68);

      float sweep = smoothstep(0.20, 0.88, -v_uv.y + v_uv.x * 0.28 + 0.30);
      float grain = (hash(frag + floor(t * 20.0)) - 0.5) * 0.032;
      float edgeFlow = 0.5 + 0.5 * sin((p.x / max(u_resolution.x, 1.0) - p.y / max(u_resolution.y, 1.0)) * 14.0 + t * 1.05);
      float ribbon = 0.5 + 0.5 * sin((v_uv.x * 19.0 + v_uv.y * 7.0) + t * 1.35 + col.g * 2.0);
      float luma = dot(col, vec3(0.24, 0.47, 0.29));
      float crescent = smoothstep(0.30, 0.86, col.b + ribbon * 0.26 + sweep * 0.16);
      float hotArc = smoothstep(0.54, 0.96, col.r + col.b + sweep * 0.24) * smoothstep(0.18, 0.78, edgeFlow);
      float leftMass = 1.0 - smoothstep(0.04, 0.76, distance(v_uv * vec2(0.90, 1.0), vec2(0.04, 0.62)));
      float bottomMass = 1.0 - smoothstep(0.05, 0.86, distance(v_uv * vec2(1.0, 0.70), vec2(0.28, 0.02)));
      float topArc = 1.0 - smoothstep(0.04, 0.54, distance(v_uv * vec2(0.96, 1.0), vec2(0.48, 0.94)));
      float darkPool = 1.0 - smoothstep(0.08, 0.50, distance(v_uv * vec2(1.06, 0.92), vec2(0.62, 0.48)));
      float upperVoid = 1.0 - smoothstep(0.08, 0.42, distance(v_uv * vec2(1.16, 1.0), vec2(0.78, 0.24)));
      float fieldRaw = clamp(pow(luma, 0.78) * 0.70 + crescent * 0.14 + leftMass * 0.34 + bottomMass * 0.28 + topArc * 0.06, 0.0, 1.0);
      float field = smoothstep(0.20, 0.74, fieldRaw);
      float voidMask = clamp(darkPool * 0.72 + upperVoid * 0.44, 0.0, 0.82);
      float materialShape = smoothstep(0.16, 0.68, fieldRaw + leftMass * 0.22 + bottomMass * 0.16 + topArc * 0.03 - voidMask * 0.36);
      float edgeShape = shell * smoothstep(0.18, 0.76, fieldRaw + leftMass * 0.22 + bottomMass * 0.20 + topArc * 0.05 - voidMask * 0.18);
      float density = clamp(materialShape * (1.0 - voidMask * 0.52) + edgeShape * 0.42 + outerLip * edgeShape * 0.28, 0.0, 1.0);

      vec3 ink = vec3(0.004, 0.009, 0.022);
      vec3 midnight = vec3(0.018, 0.045, 0.105);
      vec3 blue = vec3(0.19, 0.38, 0.72);
      vec3 cyan = vec3(0.11, 0.48, 0.64);
      vec3 violet = vec3(0.42, 0.30, 0.88);
      vec3 lavender = vec3(0.78, 0.64, 1.00);
      vec3 milk = vec3(0.94, 0.90, 1.00);

      vec3 nebula = mix(midnight, blue, density);
      nebula = mix(nebula, cyan, clamp(col.g * 0.24 + edgeFlow * 0.10 + leftMass * 0.10, 0.0, 0.40));
      nebula = mix(nebula, violet, clamp(crescent * 0.42 + sweep * 0.16 + bottomMass * 0.18, 0.0, 0.68));
      nebula += col * vec3(0.20, 0.24, 0.46);

      vec3 rim = mix(ink, nebula, 0.24 + density * 0.70);
      rim = mix(rim, ink, voidMask * core);
      rim += blue * softBody * density * (0.04 + 0.20 * field);
      rim += violet * softBody * density * (0.04 + 0.16 * crescent);
      rim += lavender * edgeShape * (0.18 + 0.38 * crescent);
      rim += milk * edgeShape * hotArc * 0.40;
      rim += lavender * softBody * leftMass * materialShape * 0.20;
      rim += violet * softBody * bottomMass * materialShape * 0.18;
      rim += blue * softBody * topArc * materialShape * 0.14;
      rim += cyan * innerLip * edgeShape * (0.07 + 0.12 * edgeFlow);
      rim += milk * outerLip * edgeShape * (0.18 + 0.18 * hotArc);
      rim += grain * (softBody * density + edgeShape + innerLip * edgeShape) * vec3(0.72, 0.78, 1.0);

      float alpha = (
        softBody * materialShape * (0.12 + density * 0.46) +
        edgeShape * (0.34 + density * 0.30 + sweep * 0.10) +
        innerLip * edgeShape * 0.18 +
        outerLip * edgeShape * 0.20
      ) * (1.0 - voidMask * 0.38) * u_intensity;
      gl_FragColor = vec4(rim, clamp(alpha, 0.0, 0.98));
    }
  `;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function makeShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
    }
    return shader;
  }

  function makeProgram(gl) {
    const program = gl.createProgram();
    gl.attachShader(program, makeShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, makeShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    }
    return program;
  }

  function cssNumber(el, name, fallback) {
    const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function attachPointer(el) {
    let raf = 0;
    let targetX = 0.5;
    let targetY = 0.18;

    const write = () => {
      raf = 0;
      const nx = (targetX - 0.5) * 2;
      const ny = (targetY - 0.5) * 2;
      el.style.setProperty('--shader-x', `${(targetX * 100).toFixed(2)}%`);
      el.style.setProperty('--shader-y', `${(targetY * 100).toFixed(2)}%`);
      el.style.setProperty('--shader-nx', clamp(nx, -1, 1).toFixed(3));
      el.style.setProperty('--shader-ny', clamp(ny, -1, 1).toFixed(3));
      if (el._shaderInstance) {
        el._shaderInstance.pointer[0] = targetX;
        el._shaderInstance.pointer[1] = targetY;
        if (!animateShader || reduceMotion) {
          renderInstance(el._shaderInstance, 0);
        }
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    const reset = () => {
      targetX = 0.5;
      targetY = 0.18;
      el.dataset.glassActive = 'false';
      schedule();
    };

    if (supportsFinePointer) {
      el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        targetX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        targetY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        el.dataset.glassActive = 'true';
        schedule();
      }, { passive: true });
      el.addEventListener('pointerleave', reset, { passive: true });
    }
  }

  function createInstance(el) {
    const canvas = document.createElement('canvas');
    canvas.className = 'shader-border-canvas';
    el.prepend(canvas);

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      canvas.remove();
      return null;
    }

    const program = makeProgram(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      radius: gl.getUniformLocation(program, 'u_radius'),
      border: gl.getUniformLocation(program, 'u_border'),
      intensity: gl.getUniformLocation(program, 'u_intensity')
    };

    const instance = {
      el,
      canvas,
      gl,
      program,
      buffer,
      locations,
      pointer: [0.5, 0.18],
      visible: true,
      width: 0,
      height: 0,
      radius: 34,
      border: 10,
      timeSeed: el.dataset.shaderKind === 'button' ? 1.85 : el.dataset.shaderKind === 'nav' ? 2.35 : 3.15,
      intensity: el.dataset.shaderKind === 'button' ? 0.84 : el.dataset.shaderKind === 'nav' ? 0.90 : 0.98
    };

    el._shaderInstance = instance;
    instances.add(instance);
    attachPointer(el);
    resizeInstance(instance);
    if (!animateShader || reduceMotion) renderInstance(instance, 0);
    return instance;
  }

  function resizeInstance(instance) {
    const rect = instance.el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (instance.width !== width || instance.height !== height) {
      instance.width = width;
      instance.height = height;
      instance.canvas.width = width;
      instance.canvas.height = height;
      instance.gl.viewport(0, 0, width, height);
    }
    instance.radius = cssNumber(instance.el, '--shader-radius', 34) * dpr;
    instance.border = cssNumber(instance.el, '--shader-border', 10) * dpr;
  }

  function renderInstance(instance, time) {
    if (!instance.visible) return;
    const { gl, program, locations } = instance;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, instance.buffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(locations.resolution, instance.width, instance.height);
    gl.uniform1f(locations.time, animateShader && !reduceMotion ? time * 0.001 : instance.timeSeed);
    gl.uniform2f(locations.pointer, instance.pointer[0], instance.pointer[1]);
    gl.uniform1f(locations.radius, instance.radius);
    gl.uniform1f(locations.border, instance.border);
    gl.uniform1f(locations.intensity, instance.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function tick(time) {
    instances.forEach((instance) => renderInstance(instance, time));
    if (animateShader && !reduceMotion) requestAnimationFrame(tick);
  }

  function ensureInstance(el) {
    if (el._shaderInstance || el.dataset.shaderFailed === 'true') {
      return el._shaderInstance || null;
    }
    try {
      return createInstance(el);
    } catch (error) {
      el.dataset.shaderFailed = 'true';
      console.warn('Shader border failed', error);
      return null;
    }
  }

  function init() {
    const nodes = [...document.querySelectorAll(SELECTOR)];
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const instance = ensureInstance(entry.target);
            if (instance) {
              instance.visible = true;
              resizeInstance(instance);
              if (!animateShader || reduceMotion) renderInstance(instance, 0);
            }
          } else {
            const instance = entry.target._shaderInstance;
            if (instance) instance.visible = false;
          }
        });
      }, { rootMargin: '180px 0px' });
      nodes.forEach((el) => observer.observe(el));
    } else {
      nodes.forEach(ensureInstance);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const instance = entry.target._shaderInstance;
        if (instance) {
          resizeInstance(instance);
          if (!animateShader || reduceMotion) renderInstance(instance, 0);
        }
      });
    });
    nodes.forEach((el) => resizeObserver.observe(el));
    window.addEventListener('resize', () => {
      instances.forEach((instance) => {
        resizeInstance(instance);
        if (!animateShader || reduceMotion) renderInstance(instance, 0);
      });
    }, { passive: true });

    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
