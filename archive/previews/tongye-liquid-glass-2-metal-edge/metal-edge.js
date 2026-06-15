(() => {
  'use strict';

  const SELECTOR = '.metal-glass';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
  const shaderInstances = new Set();

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
    uniform float u_repetition;
    uniform float u_softness;
    uniform float u_shiftRed;
    uniform float u_shiftBlue;
    uniform float u_distortion;
    uniform float u_contour;
    uniform float u_angle;
    uniform float u_intensity;
    varying vec2 v_uv;

    const float PI = 3.141592653589793;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    mat2 rot(float a) {
      float c = cos(a), s = sin(a);
      return mat2(c, -s, s, c);
    }

    float roundedBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    float stripeChannel(float c1, float c2, float stripe, float blur, float tint) {
      float ch = mix(c2, c1, smoothstep(0.0, blur, stripe));
      ch = mix(ch, c2, smoothstep(0.18, 0.18 + blur, stripe));
      ch = mix(ch, c1, smoothstep(0.30, 0.30 + blur, stripe));
      ch = mix(ch, c2, smoothstep(0.38, 0.38 + blur, stripe));
      ch = mix(ch, c1, smoothstep(0.52, 0.52 + blur, stripe));
      float gradient = mix(c1, c2, smoothstep(0.55, 1.0, stripe));
      ch = mix(ch, gradient, smoothstep(0.52, 0.52 + blur * 0.5, stripe));
      ch = mix(ch, 1.0 - min(1.0, (1.0 - ch) / max(tint, 0.0001)), 0.18);
      return ch;
    }

    void main() {
      vec2 frag = v_uv * u_resolution;
      vec2 center = u_resolution * 0.5;
      vec2 p = frag - center;
      float d = roundedBox(p, center - vec2(1.5), u_radius);
      float rim = 1.0 - smoothstep(u_border - 1.2, u_border + 1.2, abs(d));
      float innerSheen = smoothstep(-u_border * 5.8, -1.0, d) * (1.0 - smoothstep(-u_border * 1.1, -0.5, d));

      vec2 uv = v_uv;
      vec2 ruv = uv - 0.5;
      float angle = (-u_angle + 70.0) * PI / 180.0;
      ruv = rot(angle) * ruv + 0.5;

      float diagA = ruv.x - ruv.y;
      float diagB = ruv.x + ruv.y;
      vec2 gradUv = uv - 0.5;
      float dist = length(gradUv + vec2(0.0, 0.20 * diagA));
      float bump = 1.0 - pow(1.78 * dist, 1.2);
      bump *= pow(max(uv.y, 0.001), 0.3);
      bump = clamp(bump, 0.0, 1.0);

      float n = noise(uv * 8.0 + u_time * 0.18);
      float edge = clamp(abs(d) / max(u_border, 1.0), 0.0, 1.0);
      edge += (1.0 - edge) * u_distortion * (n - 0.5);

      float direction = gradUv.x;
      direction += diagA;
      direction -= 2.0 * (n - 0.5) * diagA * smoothstep(0.0, 1.0, edge) * (1.0 - smoothstep(0.0, 1.0, edge));
      direction *= mix(1.0, 1.0 - edge, smoothstep(0.5, 1.0, u_contour));
      direction -= 1.7 * edge * smoothstep(0.5, 1.0, u_contour);
      direction *= (0.10 + (1.1 - edge) * bump);
      direction *= (0.5 + 0.5 * pow(uv.y, 2.0));
      direction *= u_repetition;
      direction -= u_time * 0.34;

      float dispersion = clamp(1.0 - bump, 0.0, 1.0);
      float redShift = (dispersion + 0.03 * bump * n - diagA) * (u_shiftRed / 20.0);
      float blueShift = (dispersion * 1.3 - 0.2 * edge) * (u_shiftBlue / 20.0);
      float blur = u_softness / 15.0 + 0.30 * u_contour + 0.008;

      vec3 bright = vec3(0.98, 0.98, 1.0);
      vec3 dark = vec3(0.10, 0.11, 0.12 + 0.10 * smoothstep(0.7, 1.3, diagB));
      vec3 tint = vec3(0.76, 0.82, 0.74);
      float stripeR = fract(direction + redShift);
      float stripeG = fract(direction);
      float stripeB = fract(direction - blueShift);
      vec3 color = vec3(
        stripeChannel(bright.r, dark.r, stripeR, blur, tint.r),
        stripeChannel(bright.g, dark.g, stripeG, blur, tint.g),
        stripeChannel(bright.b, dark.b, stripeB, blur, tint.b)
      );

      vec3 warm = vec3(0.96, 0.80, 0.44);
      vec3 jade = vec3(0.42, 0.78, 0.68);
      color = mix(color, color * jade + warm * 0.22, 0.24);
      color += bright * smoothstep(0.20, 0.82, -uv.y + uv.x * 0.22 + 0.34) * rim * 0.16;

      float alpha = (rim * 0.78 + innerSheen * 0.12) * u_intensity;
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.94));
    }
  `;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function attachPointer(el) {
    let raf = 0;
    let targetX = 0.5;
    let targetY = 0.18;

    const write = () => {
      raf = 0;
      const nx = (targetX - 0.5) * 2;
      const ny = (targetY - 0.5) * 2;
      el.style.setProperty('--metal-x', `${(targetX * 100).toFixed(2)}%`);
      el.style.setProperty('--metal-y', `${(targetY * 100).toFixed(2)}%`);
      el.style.setProperty('--metal-nx', clamp(nx, -1, 1).toFixed(3));
      el.style.setProperty('--metal-ny', clamp(ny, -1, 1).toFixed(3));
      if (el._metalShaderInstance) {
        el._metalShaderInstance.pointer[0] = targetX;
        el._metalShaderInstance.pointer[1] = targetY;
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

    el.addEventListener('focusin', () => {
      el.dataset.glassActive = 'true';
    });
    el.addEventListener('focusout', reset);
  }

  function attachRipple(button) {
    button.addEventListener('click', (event) => {
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'metal-ripple';
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    });
  }

  function attachScrollBackdrop() {
    let raf = 0;
    const write = () => {
      raf = 0;
      const y = window.scrollY || 0;
      document.documentElement.style.setProperty('--material-shift', `${(-y * 0.075).toFixed(1)}px`);
      document.documentElement.style.setProperty('--material-counter-shift', `${(y * 0.045).toFixed(1)}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
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

  function createMetalShader(el) {
    const canvas = document.createElement('canvas');
    canvas.className = 'metal-shader-canvas';
    el.prepend(canvas);

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      canvas.remove();
      return;
    }

    const program = makeProgram(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const instance = {
      el,
      canvas,
      gl,
      program,
      buffer,
      pointer: [0.5, 0.18],
      visible: true,
      width: 0,
      height: 0,
      radius: 34,
      border: el.classList.contains('metal-glass--button') ? 7 : el.classList.contains('metal-glass--nav') ? 7 : 11,
      intensity: el.classList.contains('metal-glass--button') ? 0.76 : el.classList.contains('metal-glass--nav') ? 0.82 : 0.92,
      locations: {
        position: gl.getAttribLocation(program, 'a_position'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        time: gl.getUniformLocation(program, 'u_time'),
        pointer: gl.getUniformLocation(program, 'u_pointer'),
        radius: gl.getUniformLocation(program, 'u_radius'),
        border: gl.getUniformLocation(program, 'u_border'),
        repetition: gl.getUniformLocation(program, 'u_repetition'),
        softness: gl.getUniformLocation(program, 'u_softness'),
        shiftRed: gl.getUniformLocation(program, 'u_shiftRed'),
        shiftBlue: gl.getUniformLocation(program, 'u_shiftBlue'),
        distortion: gl.getUniformLocation(program, 'u_distortion'),
        contour: gl.getUniformLocation(program, 'u_contour'),
        angle: gl.getUniformLocation(program, 'u_angle'),
        intensity: gl.getUniformLocation(program, 'u_intensity')
      }
    };

    el._metalShaderInstance = instance;
    shaderInstances.add(instance);
    resizeMetalShader(instance);
    return instance;
  }

  function resizeMetalShader(instance) {
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
    instance.radius = cssNumber(instance.el, '--metal-radius', 34) * dpr;
    instance.border = (instance.el.classList.contains('metal-glass--button') ? 7 : instance.el.classList.contains('metal-glass--nav') ? 7 : 11) * dpr;
  }

  function renderMetalShader(instance, time) {
    if (!instance.visible) return;
    const { gl, program, locations } = instance;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, instance.buffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(locations.resolution, instance.width, instance.height);
    gl.uniform1f(locations.time, reduceMotion ? 0 : time * 0.001);
    gl.uniform2f(locations.pointer, instance.pointer[0], instance.pointer[1]);
    gl.uniform1f(locations.radius, instance.radius);
    gl.uniform1f(locations.border, instance.border);
    gl.uniform1f(locations.repetition, 4.0);
    gl.uniform1f(locations.softness, 0.5);
    gl.uniform1f(locations.shiftRed, 0.3);
    gl.uniform1f(locations.shiftBlue, 0.3);
    gl.uniform1f(locations.distortion, 0.22);
    gl.uniform1f(locations.contour, 0.68);
    gl.uniform1f(locations.angle, 45.0);
    gl.uniform1f(locations.intensity, instance.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function tick(time) {
    shaderInstances.forEach((instance) => renderMetalShader(instance, time));
    if (!reduceMotion) requestAnimationFrame(tick);
  }

  function ensureMetalShader(el) {
    if (el._metalShaderInstance || el.dataset.shaderFailed === 'true') {
      return el._metalShaderInstance || null;
    }
    try {
      return createMetalShader(el);
    } catch (error) {
      el.dataset.shaderFailed = 'true';
      console.warn('Liquid metal shader failed', error);
      return null;
    }
  }

  function init() {
    const nodes = [...document.querySelectorAll(SELECTOR)];
    nodes.forEach(attachPointer);
    document.querySelectorAll('.metal-glass--button').forEach(attachRipple);
    if (!reduceMotion) attachScrollBackdrop();

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const instance = ensureMetalShader(entry.target);
            if (instance) {
              instance.visible = true;
              resizeMetalShader(instance);
            }
          } else {
            const instance = entry.target._metalShaderInstance;
            if (instance) instance.visible = false;
          }
        });
      }, { rootMargin: '180px 0px' });
      nodes.forEach((el) => observer.observe(el));
    } else {
      nodes.forEach(ensureMetalShader);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const instance = entry.target._metalShaderInstance;
        if (instance) resizeMetalShader(instance);
      });
    });
    nodes.forEach((el) => resizeObserver.observe(el));
    window.addEventListener('resize', () => shaderInstances.forEach(resizeMetalShader), { passive: true });
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
