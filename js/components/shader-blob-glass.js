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
uniform float u_kind;
varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.52;
  mat2 r = mat2(0.82, -0.57, 0.57, 0.82);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.08 + 13.7;
    a *= 0.52;
  }
  return v;
}

float blob(vec2 p, vec2 c, vec2 r, float edge) {
  vec2 q = (p - c) / r;
  float d = dot(q, q);
  return smoothstep(1.28, edge, d);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);

  float nav = step(1.5, u_kind);
  float card = step(0.5, u_kind) * (1.0 - nav);
  vec2 scale = mix(vec2(1.0, 0.92), vec2(1.18, 0.82), nav);
  p *= scale;

  float t = u_time * 0.055;
  float field = 0.0;
  field += blob(p, vec2(-0.48, 0.00), vec2(0.58, 0.74), 0.18);
  field += blob(p, vec2( 0.00, 0.03), vec2(0.86, 0.68), 0.18);
  field += blob(p, vec2( 0.52,-0.02), vec2(0.60, 0.78), 0.18);
  field += blob(p, vec2( 0.08,-0.48), vec2(0.62, 0.44), 0.20) * 0.55;
  field = clamp(field, 0.0, 1.0);

  vec2 flow = vec2(
    fbm(p * 1.55 + vec2(t, -t * 0.7)),
    fbm(p * 1.45 + vec2(-t * 0.8, t * 0.6))
  );
  vec2 warped = p + (flow - 0.5) * 0.26;
  float low = fbm(warped * 2.1 + vec2(t * 0.8, -t));
  float vein = pow(max(0.0, sin((warped.x * 2.2 - warped.y * 1.4 + low * 2.8) * 2.1) * 0.5 + 0.5), 5.0);

  vec3 milk = vec3(1.00, 0.96, 0.84);
  vec3 sage = vec3(0.55, 0.78, 0.62);
  vec3 rose = vec3(0.92, 0.62, 0.72);
  vec3 amber = vec3(0.92, 0.66, 0.28);
  vec3 cool = vec3(0.82, 0.93, 0.95);

  vec3 col = milk * 0.34;
  col += sage * smoothstep(0.92, -0.42, warped.y) * 0.38;
  col += rose * smoothstep(-0.75, 0.55, warped.x) * smoothstep(0.86, -0.18, warped.y) * 0.22;
  col += amber * smoothstep(-0.98, -0.14, warped.x) * smoothstep(0.86, -0.70, warped.y) * 0.20;
  col += cool * smoothstep(0.0, 0.92, warped.x) * 0.18;

  float leftGlow = exp(-dot((p - vec2(-0.62, 0.02)) / vec2(0.26, 0.52), (p - vec2(-0.62, 0.02)) / vec2(0.26, 0.52)));
  float topGlow = exp(-dot((p - vec2(0.05, 0.50)) / vec2(0.74, 0.22), (p - vec2(0.05, 0.50)) / vec2(0.74, 0.22)));
  float coreGlow = exp(-dot((p - vec2(-0.10, -0.04)) / vec2(0.84, 0.56), (p - vec2(-0.10, -0.04)) / vec2(0.84, 0.56)));
  col += milk * leftGlow * 0.78;
  col += milk * topGlow * 0.24;
  col += vec3(0.95, 0.90, 0.58) * coreGlow * 0.16;
  col += vec3(0.72, 0.90, 0.68) * vein * 0.12;

  float edge = smoothstep(0.0, 1.0, field);
  float inner = smoothstep(0.24, 0.94, field);
  float alpha = edge * (0.10 + inner * 0.58 + leftGlow * 0.20 + coreGlow * 0.10);
  alpha *= 0.82 + low * 0.22;
  alpha *= mix(0.96, 0.74, card);

  float sparkle = step(0.985, noise(uv * u_resolution.xy * 0.14 + 9.0)) * field * 0.10;
  col += sparkle;

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
  }
  return shader;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  }
  return program;
}

function getKind(element) {
  if (element.classList.contains('shader-blob--nav')) return 2;
  if (element.classList.contains('shader-blob--card')) return 1;
  return 0;
}

function mountBlob(element, reduceMotion) {
  const canvas = document.createElement('canvas');
  canvas.className = 'shader-blob-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.prepend(canvas);

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;

  const program = createProgram(gl);
  const position = gl.getAttribLocation(program, 'a_position');
  const resolution = gl.getUniformLocation(program, 'u_resolution');
  const time = gl.getUniformLocation(program, 'u_time');
  const kind = gl.getUniformLocation(program, 'u_kind');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]), gl.STATIC_DRAW);

  let width = 0;
  let height = 0;
  let visible = true;
  const maxDpr = reduceMotion ? 1 : 1.5;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const nextWidth = Math.max(2, Math.round(rect.width * dpr));
    const nextHeight = Math.max(2, Math.round(rect.height * dpr));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  const render = (now) => {
    resize();
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, width, height);
    gl.uniform1f(time, reduceMotion ? 0 : now * 0.001);
    gl.uniform1f(kind, getKind(element));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return {
    element,
    render,
    setVisible(value) {
      visible = value;
    },
    get visible() {
      return visible;
    }
  };
}

export function initShaderBlobGlass({ root = document, reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const elements = [...root.querySelectorAll('.shader-blob')];
  const blobs = elements.map((element) => mountBlob(element, reduceMotion)).filter(Boolean);
  if (!blobs.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const blob = blobs.find((item) => item.element === entry.target);
      if (blob) blob.setVisible(entry.isIntersecting);
    });
  }, { rootMargin: '160px' });
  blobs.forEach((blob) => observer.observe(blob.element));

  if (reduceMotion) {
    blobs.forEach((blob) => blob.render(0));
    return;
  }

  const tick = (now) => {
    blobs.forEach((blob) => {
      if (blob.visible) blob.render(now);
    });
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

initShaderBlobGlass();
