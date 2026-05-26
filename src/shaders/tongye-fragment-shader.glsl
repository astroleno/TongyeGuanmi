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
  for(int i = 0; i < 5; i++){
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

  return (a * 0.35 + b * 0.28 + c * 0.16) * (0.45 + ridge * 0.95);
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
  for(int i = 0; i < 5; i++){
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
  return acc * 0.13 * weight;
}

/*
  sceneA:
  x neuroScale
  y neuroWarp
  z orbitWeight
  w particleDensity
*/
vec4 sceneA(float idx){
  if(idx < 0.5) return vec4(2.15, 0.10, 0.10, 9.5);   // S01 黑箱初启
  if(idx < 1.5) return vec4(2.75, 0.18, 0.20, 10.5);  // S02 同野 / 观幂
  if(idx < 2.5) return vec4(3.05, 0.22, 0.12, 12.0);  // S03 四个现场展开
  if(idx < 3.5) return vec4(3.35, 0.14, 0.06, 12.5);  // S04 组织现场
  if(idx < 4.5) return vec4(3.90, 0.13, 0.13, 13.5);  // S05 无限画布 + Agent
  if(idx < 5.5) return vec4(4.65, 0.15, 0.06, 14.0);  // S06 AIGC 管线
  if(idx < 6.5) return vec4(3.05, 0.16, 0.10, 11.5);  // S07 个人能力
  if(idx < 7.5) return vec4(3.55, 0.20, 0.16, 12.5);  // S08 方法论
  return vec4(2.45, 0.08, 0.20, 10.0);                // S09 预约汇聚
}

/*
  sceneB:
  x branchWeight
  y gridWeight
  z pipelineWeight
  w convergeWeight
*/
vec4 sceneB(float idx){
  if(idx < 0.5) return vec4(0.05, 0.00, 0.00, 0.08);
  if(idx < 1.5) return vec4(0.14, 0.00, 0.00, 0.10);
  if(idx < 2.5) return vec4(0.54, 0.06, 0.00, 0.10);
  if(idx < 3.5) return vec4(0.18, 0.18, 0.00, 0.10);
  if(idx < 4.5) return vec4(0.08, 0.48, 0.00, 0.10);
  if(idx < 5.5) return vec4(0.08, 0.22, 0.48, 0.12);
  if(idx < 6.5) return vec4(0.18, 0.08, 0.08, 0.10);
  if(idx < 7.5) return vec4(0.28, 0.20, 0.10, 0.20);
  return vec4(0.08, 0.00, 0.00, 0.60);
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
  float local = ease(fract(s));

  vec4 A = mix(sceneA(idx), sceneA(min(idx + 1.0, 8.0)), local);
  vec4 B = mix(sceneB(idx), sceneB(min(idx + 1.0, 8.0)), local);
  vec3 tint = mix(sceneTint(idx), sceneTint(min(idx + 1.0, 8.0)), local);

  vec2 q = p;
  q += 0.035 * vec2(
    sin(u_time * 0.045 + p.y * 3.0 + u_scroll * 2.0),
    cos(u_time * 0.040 + p.x * 2.5)
  );
  q *= rot(0.08 * sin(u_time * 0.035 + u_scroll * 4.0));

  float neuro = neuroField(q, A.x, A.y, 0.9);
  float orbit = orbitalField(q, A.z, 0.45, B.x);
  float branch = branchField(q * rot(-0.32), B.x, 4.0);
  float grid = canvasGrid(q + vec2(0.0, u_time * 0.012), B.y, 5.4 + B.y * 5.0);
  float pipe = pipelineField(q, B.z);
  float converge = convergenceField(q, B.w);
  float particle = particleField(q + vec2(0.0, -u_time * 0.01), A.w, 1.0);

  float vignette = smoothstep(1.18, 0.18, length(p * vec2(0.92, 0.88)));
  float grain = (noise(uv * u_resolution.xy * 0.38 + u_time * 0.18) - 0.5) * 0.055;

  vec3 obsidian = vec3(0.024, 0.023, 0.020);
  vec3 moss = vec3(0.10, 0.20, 0.17);
  vec3 ivory = vec3(0.92, 0.88, 0.78);
  vec3 warmGold = vec3(0.78, 0.67, 0.43);
  vec3 silver = vec3(0.70, 0.71, 0.68);
  vec3 clay = vec3(0.50, 0.34, 0.25);

  vec3 bg = obsidian;
  bg += 0.024 * vec3(fbm(p * 2.1 + 7.0), fbm(p * 2.0 + 17.0), fbm(p * 2.2 + 29.0));
  bg += 0.020 * moss * smoothstep(0.9, 0.1, length(p - vec2(-0.45, 0.18)));

  vec3 color = bg;
  color += neuro * mix(moss, warmGold, 0.64) * 0.52;
  color += orbit * warmGold * 0.65;
  color += branch * mix(ivory, warmGold, 0.45) * 0.58;
  color += grid * mix(silver, moss, 0.30) * 0.55;
  color += pipe * mix(warmGold, ivory, 0.25) * 0.52;
  color += converge * mix(warmGold, ivory, 0.38) * 0.72;
  color += particle * ivory * 0.38;

  /* 个人现场略微加温，但不变成教育广告色 */
  float personalWarm = smoothstep(6.15, 6.75, s) * (1.0 - smoothstep(7.05, 7.55, s));
  color += personalWarm * clay * 0.07;

  color *= tint;
  color *= vignette;
  color += grain;
  color *= 0.86 + 0.14 * smoothstep(0.02, 0.18, u_scroll);
  color *= u_intensity;

  gl_FragColor = vec4(color, 1.0);
}
