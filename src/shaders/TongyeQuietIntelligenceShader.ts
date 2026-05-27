
export type TongyeShaderOptions = {
  pixelRatio?: number;
  intensity?: number;
  autoRender?: boolean;
  scrollLerp?: number;
  maxFps?: number;
  timeScale?: number;
};

export type TongyeShaderInstance = {
  setScroll: (progress: number) => void;
  setIntensity: (intensity: number) => void;
  renderNow: () => void;
  resize: (width: number, height: number, pixelRatio?: number) => void;
  dispose: () => void;
};

type ShaderCanvas = HTMLCanvasElement & {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
};

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const tongyeFragmentShaderSource = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_scroll;
uniform float u_intensity;

varying vec2 v_uv;

#define PI 3.14159265359
#define TAU 6.28318530718
#define SECTION_COUNT 9.0

float sat(float x){ return clamp(x, 0.0, 1.0); }
float ease(float x){ return x*x*(3.0-2.0*x); }

mat2 rot(float a){
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p){
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for(int i = 0; i < 4; i++){
    v += a * noise(p);
    p = rot(0.42) * p * 2.03 + vec2(5.2, -3.7);
    a *= 0.5;
  }
  return v;
}

float ridged(vec2 p){
  float n = fbm(p);
  return 1.0 - abs(n * 2.0 - 1.0);
}

float lineBand(float value, float width){
  return exp(-abs(value) * width);
}

float segmentDistance(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float lightRoute(vec2 p, vec2 a, vec2 b, float width){
  float d = segmentDistance(p, a, b);
  float core = exp(-(d * d) / (width * width));
  float halo = exp(-(d * d) / (width * width * 8.0));
  return core * 0.78 + halo * 0.22;
}

/* 从 neuro-noise-glsl-shader 借来的有机 sine-field，只作为纤维调料，不替代叙事结构 */
float organicNeuroTaste(vec2 uv, float t, float p){
  vec2 sineAcc = vec2(0.0);
  vec2 res = vec2(0.0);
  float scale = 8.6;

  for(int j = 0; j < 7; j++){
    uv = rot(1.0) * uv;
    sineAcc = rot(1.0) * sineAcc;
    vec2 layer = uv * scale + float(j) + sineAcc - t;
    sineAcc += sin(layer) * 0.72 + 0.95 * p;
    res += (0.5 + 0.5 * cos(layer)) / (scale * 1.42);
    scale *= 1.2;
  }

  float n = res.x + res.y;
  n = 0.92 * pow(max(n, 0.0), 3.0);
  n += 0.18 * pow(max(n, 0.0), 8.0);
  return max(0.0, n - 0.42);
}

/* neuro + noise 主质感：像神经纤维，不像普通星云 */
float neuroField(vec2 p, float scale, float warp, float speed){
  vec2 q = p * scale;
  float n1 = fbm(q * 0.78 + vec2(u_time * speed * 0.12, -u_time * speed * 0.08));
  float n2 = fbm(q * 1.60 - vec2(u_time * speed * 0.18, u_time * speed * 0.10));
  q += warp * vec2(
    sin(q.y * 2.2 + n1 * 5.5 + u_time * speed * 0.55),
    cos(q.x * 2.0 + n2 * 4.8 - u_time * speed * 0.45)
  );

  float a = lineBand(sin(q.x * 1.65 + q.y * 0.55 + n1 * 6.0), 8.5);
  float b = lineBand(sin(q.x * 2.6 - q.y * 1.1 + n2 * 8.0), 14.0);
  float c = lineBand(sin(q.x * 6.8 + q.y * 1.8 + n1 * 10.0), 34.0);
  float ridge = pow(ridged(q * 0.92 + vec2(0.0, u_time * speed * 0.12)), 2.4);

  return (a * 0.26 + b * 0.18 + c * 0.08) * (0.32 + ridge * 0.52);
}

/* 轨道不是土星：只保留抽象系统轨迹和粒子 */
float orbitalField(vec2 p, float weight, float radius, float openness){
  vec2 q = rot(-0.46 + 0.12 * sin(u_scroll * TAU)) * p;
  q.y *= 1.55 + 0.25 * openness;

  float r = length(q);
  float a = atan(q.y, q.x);
  float ring1 = exp(-abs(r - radius) * 34.0);
  float ring2 = exp(-abs(r - radius * 1.22) * 26.0);
  float ring3 = exp(-abs(r - radius * 0.78) * 38.0);

  float arcGate =
    pow(0.5 + 0.5 * cos(a * 2.0 - u_time * 0.20), 4.0) *
    (0.45 + 0.55 * smoothstep(-0.25, 0.85, sin(a * 3.0 + u_scroll * TAU)));

  float broken = 0.42 + 0.58 * fbm(q * 7.0 + vec2(u_time * 0.08, -u_time * 0.04));
  return weight * (ring1 + ring2 * 0.42 + ring3 * 0.22) * arcGate * broken;
}

/* 四个现场 / 方法论分叉 */
float branchField(vec2 p, float weight, float arms){
  float a = atan(p.y, p.x);
  float r = length(p);
  float spokes = pow(0.5 + 0.5 * cos(arms * a + 0.45 * sin(u_time * 0.12)), 16.0);
  float thread = lineBand(sin(arms * a + r * 8.0 - u_time * 0.22), 4.2);
  float fade = smoothstep(1.25, 0.12, r) * smoothstep(0.02, 0.5, r);
  return weight * (spokes * 0.72 + thread * 0.28) * fade;
}

/* 无限画布节点，不做成 SaaS 模板 */
float canvasGrid(vec2 p, float weight, float scale){
  vec2 q = p * scale;
  vec2 id = floor(q);
  vec2 gv = fract(q) - 0.5;

  float dotNode = exp(-dot(gv, gv) * 42.0);
  float keep = step(0.52, hash21(id + vec2(3.1, 7.7)));
  float point = dotNode * keep;

  float hKeep = step(0.73, hash21(id + vec2(12.4, 1.8)));
  float vKeep = step(0.74, hash21(id + vec2(4.6, 18.2)));
  float h = exp(-abs(gv.y) * 56.0) * hKeep * keep;
  float v = exp(-abs(gv.x) * 56.0) * vKeep * keep;

  return weight * (point + (h + v) * 0.30);
}

/* 生产管线 / 胶片分镜，不写死文字 */
float pipelineField(vec2 p, float weight){
  vec2 q = rot(0.12) * p;
  float lane = lineBand(q.y + 0.15 * sin(q.x * 2.0 + u_time * 0.18), 18.0);
  float tick = pow(0.5 + 0.5 * cos((q.x + u_scroll * 0.8) * 28.0), 12.0);
  float frames = 0.0;
  for(int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 c = vec2(-0.8 + fi * 0.4 + 0.1 * sin(u_time * 0.08 + fi), 0.10 * sin(fi * 1.7));
    vec2 d = q - c;
    float box = smoothstep(0.28, 0.25, abs(d.x)) * smoothstep(0.15, 0.12, abs(d.y));
    float inner = smoothstep(0.22, 0.20, abs(d.x)) * smoothstep(0.10, 0.08, abs(d.y));
    frames += max(box - inner * 0.55, 0.0) * (0.45 + 0.55 * hash21(vec2(fi, 2.0)));
  }
  return weight * (lane * (0.35 + 0.65 * tick) + frames);
}

/* 最后一屏 CTA 汇聚 */
float convergenceField(vec2 p, float weight){
  float core = exp(-length(p - vec2(0.0, -0.22)) * 5.3);
  float path = exp(-abs(p.x) * 18.0) * exp(-abs(p.y + 0.55) * 3.6);
  float halo = exp(-length(p - vec2(0.0, -0.72)) * 9.0);
  return weight * (core * 0.45 + path * 0.30 + halo * 0.90);
}

/* 微粒；密度低，避免太空化 */
float particleField(vec2 p, float density, float weight){
  vec2 q = p * density;
  vec2 base = floor(q);
  float acc = 0.0;
  for(int j=-1; j<=1; j++){
    for(int i=-1; i<=1; i++){
      vec2 cell = base + vec2(float(i), float(j));
      vec2 rnd = hash22(cell);
      vec2 pos = cell + 0.5 + 0.28 * vec2(
        sin(u_time * 0.22 + rnd.x * TAU),
        cos(u_time * 0.19 + rnd.y * TAU)
      );
      vec2 d = q - pos;
      float glow = exp(-dot(d, d) * 18.0);
      acc += glow * (0.16 + 0.84 * rnd.x);
    }
  }
  return acc * 0.055 * weight;
}

/*
  sceneA:
  x neuroScale
  y neuroWarp
  z orbitWeight
  w particleDensity
*/
vec4 sceneA(float idx){
  if(idx < 0.5) return vec4(1.80, 0.055, 0.06, 5.8);  // S01 黑箱初启
  if(idx < 1.5) return vec4(2.20, 0.095, 0.12, 6.4);  // S02 同野 / 观幂
  if(idx < 2.5) return vec4(2.60, 0.145, 0.10, 7.2);  // S03 四个现场展开
  if(idx < 3.5) return vec4(2.52, 0.082, 0.04, 6.8);  // S04 组织现场
  if(idx < 4.5) return vec4(3.00, 0.076, 0.08, 7.4);  // S05 无限画布 + Agent
  if(idx < 5.5) return vec4(3.34, 0.090, 0.04, 7.8);  // S06 AIGC 管线
  if(idx < 6.5) return vec4(2.22, 0.082, 0.07, 6.2);  // S07 个人能力
  if(idx < 7.5) return vec4(2.74, 0.112, 0.10, 6.8);  // S08 方法论
  return vec4(1.92, 0.045, 0.12, 5.8);                // S09 预约汇聚
}

/*
  sceneB:
  x branchWeight
  y gridWeight
  z pipelineWeight
  w convergeWeight
*/
vec4 sceneB(float idx){
  if(idx < 0.5) return vec4(0.02, 0.00, 0.00, 0.08);
  if(idx < 1.5) return vec4(0.08, 0.00, 0.00, 0.10);
  if(idx < 2.5) return vec4(0.38, 0.08, 0.00, 0.10);
  if(idx < 3.5) return vec4(0.10, 0.10, 0.00, 0.10);
  if(idx < 4.5) return vec4(0.06, 0.25, 0.00, 0.10);
  if(idx < 5.5) return vec4(0.05, 0.12, 0.28, 0.12);
  if(idx < 6.5) return vec4(0.10, 0.04, 0.04, 0.10);
  if(idx < 7.5) return vec4(0.18, 0.10, 0.06, 0.18);
  return vec4(0.04, 0.00, 0.00, 0.48);
}

vec3 sceneTint(float idx){
  if(idx < 0.5) return vec3(1.00, 0.96, 0.88);
  if(idx < 1.5) return vec3(1.00, 0.93, 0.82);
  if(idx < 2.5) return vec3(0.96, 0.91, 0.80);
  if(idx < 3.5) return vec3(0.88, 0.94, 0.89);
  if(idx < 4.5) return vec3(0.90, 0.93, 0.96);
  if(idx < 5.5) return vec3(0.98, 0.90, 0.78);
  if(idx < 6.5) return vec3(0.96, 0.89, 0.82);
  if(idx < 7.5) return vec3(0.95, 0.93, 0.86);
  return vec3(1.00, 0.95, 0.86);
}

void main(){
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

  float s = clamp(u_scroll, 0.0, 0.9999) * SECTION_COUNT;
  float idx = floor(s);
  float phase = fract(s);
  float local = ease(smoothstep(0.72, 0.98, phase));

  vec4 A = mix(sceneA(idx), sceneA(min(idx + 1.0, 8.0)), local);
  vec4 B = mix(sceneB(idx), sceneB(min(idx + 1.0, 8.0)), local);
  vec3 tint = mix(sceneTint(idx), sceneTint(min(idx + 1.0, 8.0)), local);

  vec2 q = p;
  q += 0.035 * vec2(
    sin(u_time * 0.045 + p.y * 3.0 + u_scroll * 2.0),
    cos(u_time * 0.040 + p.x * 2.5)
  );
  q *= rot(0.08 * sin(u_time * 0.035 + u_scroll * 4.0));

  float upperRoute = lightRoute(p, vec2(-0.88, 0.34), vec2(0.92, -0.16), 0.028);
  float lowerRoute = lightRoute(p, vec2(-0.86, -0.62), vec2(0.76, -0.32), 0.023);
  float routeArc =
    lightRoute(p, vec2(0.54, 0.58), vec2(0.86, 0.04), 0.020) * 0.88 +
    lightRoute(p, vec2(0.86, 0.04), vec2(0.46, -0.58), 0.022) * 1.10 +
    lightRoute(p, vec2(-0.54, -0.64), vec2(0.28, -0.80), 0.018) * 0.58;
  float routeSpark =
    exp(-dot(p - vec2(0.70, -0.38), p - vec2(0.70, -0.38)) * 58.0) * 0.74 +
    exp(-dot(p - vec2(-0.42, 0.16), p - vec2(-0.42, 0.16)) * 42.0) * 0.44;
  vec2 focusA = p - vec2(-0.56, 0.34);
  vec2 focusB = p - vec2(0.52, -0.25);
  float upperFocus = exp(-dot(focusA, focusA) * 8.5);
  float lowerFocus = exp(-dot(focusB, focusB) * 9.0);
  float routeMask = sat(upperRoute * 0.76 + lowerRoute * 0.42 + routeArc * 0.92 + routeSpark * 0.55 + upperFocus * 0.36 + lowerFocus * 0.28);
  float curatedMask = smoothstep(0.035, 0.64, routeMask);
  vec2 readingP = (p - vec2(-0.18, -0.06)) * vec2(1.18, 0.88);
  float readingQuiet = 1.0 - 0.58 * exp(-dot(readingP, readingP) * 2.4);
  float densityGate = mix(0.035, 0.82, curatedMask) * readingQuiet;
  float depthPlane = smoothstep(1.12, 0.12, length((p - vec2(0.12, 0.03)) * vec2(0.82, 1.0)));

  float neuro = neuroField(q, A.x, A.y, 0.9) * densityGate;
  float organic = organicNeuroTaste(q * (0.50 + A.x * 0.030), u_time * 0.46 + u_scroll * 1.4, A.y) * densityGate * 0.45;
  float orbit = orbitalField(q, A.z, 0.45, B.x) * (0.20 + curatedMask * 0.80);
  float branch = branchField(q * rot(-0.32), B.x, 4.0) * densityGate;
  float grid = canvasGrid(q + vec2(0.0, u_time * 0.006), B.y, 5.0 + B.y * 4.2) * (0.16 + curatedMask * 0.84);
  float pipe = pipelineField(q, B.z) * (0.18 + curatedMask * 0.82);
  float converge = convergenceField(q, B.w) * (0.35 + curatedMask * 0.65);
  float particle = particleField(q + vec2(0.0, -u_time * 0.004), A.w, 1.0) * (0.14 + curatedMask * 0.86);

  float vignette = smoothstep(1.34, 0.08, length(p * vec2(0.90, 0.86)));
  float grain = (noise(uv * u_resolution.xy * 0.28 + u_time * 0.08) - 0.5) * 0.018;

  vec3 obsidian = vec3(0.024, 0.023, 0.020);
  vec3 moss = vec3(0.10, 0.20, 0.17);
  vec3 ivory = vec3(0.92, 0.88, 0.78);
  vec3 warmGold = vec3(0.78, 0.67, 0.43);
  vec3 silver = vec3(0.70, 0.71, 0.68);
  vec3 clay = vec3(0.50, 0.34, 0.25);

  vec3 bg = obsidian + vec3(0.010, 0.009, 0.006);
  bg += 0.012 * vec3(fbm(p * 1.4 + 7.0), fbm(p * 1.3 + 17.0), fbm(p * 1.5 + 29.0));
  bg += 0.018 * moss * smoothstep(0.88, 0.18, length(p - vec2(-0.45, 0.18)));

  vec3 color = bg;
  float conversionCalm = smoothstep(7.4, 8.7, s);
  float fieldMapLift = smoothstep(1.65, 2.10, s) * (1.0 - smoothstep(3.05, 3.45, s));
  float openFieldLift = smoothstep(0.15, 1.2, s) * (1.0 - smoothstep(8.4, 8.95, s));
  float fiberMass = neuro * 0.52 + organic * 0.20 + branch * 0.32 + orbit * 0.22 + pipe * 0.14;
  float fiberCore = smoothstep(0.22, 0.78, fiberMass);
  float fiberGlow = pow(max(fiberMass, 0.0), 1.38);
  vec2 diagonal = rot(-0.48) * q;
  float warmVein = upperRoute * 0.56 + lowerRoute * 0.30;
  warmVein += 0.10 * exp(-abs(diagonal.x + 0.10 * sin(diagonal.y * 4.2 + u_time * 0.10)) * 5.6) * smoothstep(0.72, 0.08, abs(diagonal.y));

  color += warmGold * fieldMapLift * (0.010 + 0.018 * fbm(q * 1.2 + 2.0)) * curatedMask;
  color += neuro * mix(moss, warmGold, 0.70) * (0.26 + fieldMapLift * 0.08);
  color += organic * mix(moss, warmGold, 0.62) * (0.16 + fieldMapLift * 0.06 - conversionCalm * 0.05);
  color += orbit * warmGold * 0.30;
  color += branch * mix(ivory, warmGold, 0.52) * (0.32 + fieldMapLift * 0.12);
  color += grid * mix(silver, moss, 0.18) * (0.26 + fieldMapLift * 0.10);
  color += pipe * mix(warmGold, ivory, 0.25) * 0.28;
  color += converge * mix(warmGold, ivory, 0.38) * 0.48;
  color += particle * ivory * 0.20;
  color += warmGold * warmVein * (0.090 + fieldMapLift * 0.030 + openFieldLift * 0.018);
  color += mix(warmGold, ivory, 0.28) * routeArc * (0.145 + fieldMapLift * 0.038);
  color += ivory * pow(max(routeArc + upperRoute, 0.0), 1.55) * 0.054;
  color += warmGold * routeSpark * 0.060;
  color += mix(warmGold, ivory, 0.34) * fiberGlow * (0.036 + fieldMapLift * 0.026 + openFieldLift * 0.014);
  color += ivory * fiberCore * (0.010 + fieldMapLift * 0.008);
  color += warmGold * depthPlane * curatedMask * 0.012;

  /* 个人现场略微加温，但不变成教育广告色 */
  float personalWarm = smoothstep(6.15, 6.75, s) * (1.0 - smoothstep(7.05, 7.55, s));
  color += personalWarm * clay * 0.045;

  color *= tint;
  color *= mix(0.36, 0.98, vignette);
  color += grain;
  color *= 0.96 + 0.08 * smoothstep(0.02, 0.18, u_scroll);
  color *= u_intensity;
  color = pow(max(color, vec3(0.0)), vec3(0.94));

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compile failed.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program.');

  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, tongyeFragmentShaderSource);

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program link failed.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

export function createTongyeQuietIntelligenceShader(
  canvas: ShaderCanvas,
  options: TongyeShaderOptions = {}
): TongyeShaderInstance {
  const contextOptions = {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  };
  const maybeGl =
    getWebglContext(canvas, 'webgl', contextOptions) ||
    getWebglContext(canvas, 'experimental-webgl', contextOptions) ||
    getWebglContext(canvas, 'webgl');

  if (!maybeGl) {
    throw new Error('WebGL is not supported in this environment.');
  }

  const gl = maybeGl;
  const program = createProgram(gl);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) throw new Error('Unable to create position buffer.');

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPosition = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uScroll = gl.getUniformLocation(program, 'u_scroll');
  const uIntensity = gl.getUniformLocation(program, 'u_intensity');

  let width = 1;
  let height = 1;
  let scroll = 0;
  let targetScroll = 0;
  let intensity = options.intensity ?? 1;
  let disposed = false;
  let raf = 0;
  const scrollLerp = Math.max(0.02, Math.min(1, options.scrollLerp ?? 0.075));
  const autoRender = options.autoRender !== false;
  const frameIntervalMs = options.maxFps ? 1000 / Math.max(12, Math.min(60, options.maxFps)) : 0;
  const timeScale = Math.max(0.1, Math.min(3, options.timeScale ?? 1));
  let lastFrameAt = 0;
  const startedAt = Date.now();
  const fallbackRequestFrame = (callback: FrameRequestCallback) => {
    return setTimeout(() => callback(Date.now()), 16) as unknown as number;
  };
  const fallbackCancelFrame = (id: number) => {
    clearTimeout(id);
  };
  const requestFrame =
    canvas.requestAnimationFrame?.bind(canvas) ||
    globalThis.requestAnimationFrame?.bind(globalThis) ||
    fallbackRequestFrame;
  const cancelFrame =
    canvas.cancelAnimationFrame?.bind(canvas) ||
    globalThis.cancelAnimationFrame?.bind(globalThis) ||
    fallbackCancelFrame;

  function renderFrame() {
    scroll += (targetScroll - scroll) * scrollLerp;

    gl.viewport(0, 0, width, height);
    gl.uniform2f(uResolution, width, height);
    gl.uniform1f(uTime, (Date.now() - startedAt) * 0.001 * timeScale);
    gl.uniform1f(uScroll, scroll);
    gl.uniform1f(uIntensity, intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    gl.finish();
  }

  function draw(now = Date.now()) {
    if (disposed) return;

    if (!frameIntervalMs || !lastFrameAt || now - lastFrameAt >= frameIntervalMs) {
      lastFrameAt = now;
      renderFrame();
    }

    raf = requestFrame(draw);
  }

  if (autoRender) {
    raf = requestFrame(draw);
  }

  return {
    setScroll(progress: number) {
      targetScroll = Math.max(0, Math.min(0.9999, progress));
    },
    setIntensity(value: number) {
      intensity = Math.max(0, Math.min(2, value));
    },
    renderNow() {
      if (disposed) return;
      renderFrame();
    },
    resize(nextWidth: number, nextHeight: number, pixelRatio = options.pixelRatio ?? 1) {
      const dpr = Math.max(0.75, Math.min(2, pixelRatio));
      width = Math.max(1, Math.floor(nextWidth * dpr));
      height = Math.max(1, Math.floor(nextHeight * dpr));
      canvas.width = width;
      canvas.height = height;
      const isDomCanvas = typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
      if (isDomCanvas && canvas.style) {
        canvas.style.width = `${nextWidth}px`;
        canvas.style.height = `${nextHeight}px`;
      }
    },
    dispose() {
      disposed = true;
      if (raf) cancelFrame(raf);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    },
  };
}

function getWebglContext(
  canvas: ShaderCanvas,
  contextId: 'webgl' | 'experimental-webgl',
  options?: WebGLContextAttributes
) {
  try {
    return canvas.getContext(contextId, options) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
}
