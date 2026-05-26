"use client"

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from "react"

/**
 * TongyeNeuroOrbitalFieldShader
 * --------------------------------
 * A quiet, neuro/noise-first WebGL2 shader background for 同野观幂.
 *
 * Shape direction:
 * - Neuro + noise texture as the main character.
 * - Abstract orbital / Saturn-like field as structure, not a literal planet.
 * - 9 scroll scenes, with obvious cross-screen morphing.
 * - Pointer / touch hover drives local distortion, glow, and particle response.
 *
 * Scene map, 0..8:
 * 0 Hero / AI black box opens
 * 1 同野 / 观幂: field grid + system curves
 * 2 四个现场: organization / product / content / personal
 * 3 组织现场: workflow lines
 * 4 产品现场: infinite canvas + Agent
 * 5 内容现场: AIGC video pipeline
 * 6 个人现场: warmer personal capability field
 * 7 方法论: five layered steps
 * 8 项目 / 服务 / 预约: calm path line
 */

type ScenePosition = "absolute" | "fixed" | "relative"

type TongyePalette = {
  obsidian: string
  ink: string
  ivory: string
  warmGold: string
  moss: string
  silver: string
  clay: string
}

export type TongyeNeuroOrbitalFieldShaderProps = {
  className?: string
  style?: CSSProperties
  children?: React.ReactNode

  /** Global scroll progress, 0..1. If omitted, the component reads window scroll. */
  progress?: number

  /** Optional explicit scene index, 0..8. */
  scene?: number

  /** Optional local scene progress, 0..1, added to `scene` when `scene` is provided. */
  sceneProgress?: number

  /** Default 9. */
  sceneCount?: number

  /** CSS positioning of the wrapper. */
  position?: ScenePosition

  /** CSS opacity of the shader canvas. */
  opacity?: number

  /** Animation speed multiplier. */
  speed?: number

  /** Overall shader brightness/intensity. */
  intensity?: number

  /** Procedural texture amount. */
  noiseAmount?: number

  /** Bayer / grain dithering amount. */
  dither?: number

  /** Device pixel ratio cap. Default: 1.75 desktop, 1.25 lowPower. */
  pixelRatio?: number

  /** Reduce cost and density. */
  lowPower?: boolean

  /** Listen to global pointer/touch movement. */
  interactive?: boolean

  /** Auto-read document scroll when `progress` is not provided. */
  autoScroll?: boolean

  /** Override brand colors. */
  colors?: Partial<TongyePalette>
}

export const TONGYE_FIELD_SCENES = [
  "Hero / Black box",
  "同野 / 观幂",
  "四个现场",
  "组织现场",
  "无限画布 + Agent",
  "AIGC 视频管线",
  "个人能力建设",
  "方法论",
  "项目 / 服务 / 预约",
] as const

const DEFAULT_SCENE_COUNT = 9

const DEFAULT_COLORS: TongyePalette = {
  obsidian: "#080807",
  ink: "#121412",
  ivory: "#E9E2D2",
  warmGold: "#C7B17A",
  moss: "#123A32",
  silver: "#B8B9B3",
  clay: "#8B5E45",
}

const vertexShaderSource = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec2 u_velocity;
uniform float u_interaction;
uniform float u_scene;
uniform float u_globalProgress;
uniform float u_intensity;
uniform float u_noiseAmount;
uniform float u_dither;
uniform float u_lowPower;

uniform vec3 u_obsidian;
uniform vec3 u_ink;
uniform vec3 u_ivory;
uniform vec3 u_warmGold;
uniform vec3 u_moss;
uniform vec3 u_silver;
uniform vec3 u_clay;

out vec4 outColor;

#define PI 3.14159265358979323846264
#define TAU 6.28318530717958647692

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x) { return clamp(x, 0.0, 1.0); }

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + n + 19.19));
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash12(i + vec2(0.0, 0.0));
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.62, 1.21, -1.21, 1.62);
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = m * p + 0.13;
    a *= 0.5;
  }
  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 m = mat2(1.54, -1.18, 1.18, 1.54);
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(2.0 * noise2(p) - 1.0);
    v += a * n * n;
    p = m * p + 1.7;
    a *= 0.55;
  }
  return sat(v);
}

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int idx = q.x + q.y * 4;
  float v = 0.0;
  if (idx == 0) v = 0.0;
  else if (idx == 1) v = 8.0;
  else if (idx == 2) v = 2.0;
  else if (idx == 3) v = 10.0;
  else if (idx == 4) v = 12.0;
  else if (idx == 5) v = 4.0;
  else if (idx == 6) v = 14.0;
  else if (idx == 7) v = 6.0;
  else if (idx == 8) v = 3.0;
  else if (idx == 9) v = 11.0;
  else if (idx == 10) v = 1.0;
  else if (idx == 11) v = 9.0;
  else if (idx == 12) v = 15.0;
  else if (idx == 13) v = 7.0;
  else if (idx == 14) v = 13.0;
  else v = 5.0;
  return (v + 0.5) / 16.0;
}

float lineSoft(float d, float width, float blur) {
  return 1.0 - smoothstep(max(width - blur, 0.00001), width + blur, d);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float boxLine(vec2 p, vec2 b, float width, float blur) {
  return lineSoft(abs(sdBox(p, b)), width, blur);
}

float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}

float sceneWeight(float i, float s) {
  return sat(1.0 - abs(s - i));
}

float gridLines(vec2 p, float scale, float width) {
  vec2 g = abs(fract(p * scale) - 0.5);
  float l = min(g.x, g.y);
  return 1.0 - smoothstep(0.0, width, l);
}

float orbitalLayer(vec2 p, vec2 center, float tilt, float rx, float ry, float density, float t) {
  vec2 q = rot(-tilt) * (p - center);
  vec2 e = q / vec2(rx, ry);
  float er = length(e);
  float dist = abs(er - 1.0);
  float a = atan(e.y, e.x);

  float dashNoise = fbm(vec2(a * 1.7, er * 2.0) + vec2(t * 0.035, -t * 0.02));
  float dash = 0.5 + 0.5 * sin(a * density + dashNoise * 5.0 + t * 0.25);
  dash = smoothstep(0.16, 0.92, dash);

  float ringA = lineSoft(dist, 0.010, 0.024) * (0.45 + 0.55 * dash);
  float ringB = lineSoft(abs(er - 1.19), 0.006, 0.018) * (0.25 + 0.75 * smoothstep(0.2, 0.9, dashNoise));
  float ringC = lineSoft(abs(er - 0.76), 0.004, 0.015) * (0.15 + 0.85 * dash);
  float halo = exp(-dist * 9.5) * 0.08;

  return sat(ringA + ringB + ringC + halo);
}

float neuroLayer(vec2 p, float scene, float t) {
  float acc = 0.0;
  vec2 q = p;
  q += 0.16 * vec2(
    fbm(q * 1.6 + vec2(0.0, t * 0.035)),
    fbm(q * 1.7 + vec2(t * 0.025, 1.2))
  ) - 0.08;

  float detail = mix(5.0, 3.0, u_lowPower);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= detail) break;
    float fi = float(i);
    vec2 r = rot(0.36 * scene + fi * 0.58) * q;
    r *= 1.12 + fi * 0.32;
    float n = fbm(r * (0.72 + fi * 0.07) + vec2(t * (0.020 + fi * 0.004), -t * 0.015));
    float wave = sin(r.x * (5.7 + fi * 0.9) + r.y * (0.9 - fi * 0.08) + n * 5.2 + t * (0.07 + fi * 0.012));
    float fiber = 1.0 - smoothstep(0.0, 0.055, abs(wave));
    float gate = smoothstep(0.20, 0.86, ridged(r * 0.52 + fi * 0.31));
    acc += fiber * gate * (0.46 / (1.0 + fi * 0.35));
  }
  return sat(acc);
}

float particleLayer(vec2 p, float t, float scene, float orbitalMask) {
  vec2 grid = p * vec2(18.0, 32.0);
  vec2 id = floor(grid);
  vec2 gv = fract(grid) - 0.5;
  float rnd = hash12(id + scene * 17.0);
  vec2 off = hash22(id + 4.7) - 0.5;
  float visible = step(mix(0.88, 0.80, u_lowPower), rnd);
  float size = mix(0.018, 0.032, hash12(id + 9.2));
  float d = length(gv - off * 0.72);
  float dotp = 1.0 - smoothstep(0.0, size, d);
  float twinkle = 0.48 + 0.52 * sin(t * (0.28 + rnd) + rnd * TAU);
  return dotp * visible * twinkle * (0.22 + 0.78 * sat(orbitalMask * 1.6));
}

float blackBoxLayer(vec2 p, float t) {
  vec2 q = rot(0.08 + 0.02 * sin(t * 0.1)) * p;
  float b = boxLine(q, vec2(0.17, 0.13), 0.004, 0.012);
  b += 0.55 * boxLine(q, vec2(0.24, 0.18), 0.0025, 0.010);
  float openA = lineSoft(segmentDist(q, vec2(-0.17, 0.00), vec2(-0.52, 0.22)), 0.003, 0.012);
  float openB = lineSoft(segmentDist(q, vec2(0.17, 0.00), vec2(0.48, -0.16)), 0.003, 0.012);
  float openC = lineSoft(segmentDist(q, vec2(0.00, 0.13), vec2(0.17, 0.62)), 0.002, 0.010);
  float core = (1.0 - smoothstep(0.0, 0.18, length(q))) * 0.18;
  return sat(b + openA + openB + openC + core);
}

float brandGridLayer(vec2 p, float t) {
  vec2 q = rot(-0.18) * (p + vec2(0.08, 0.03));
  q += 0.02 * vec2(sin(t * 0.05 + q.y * 2.0), cos(t * 0.04 + q.x * 2.0));
  float g = gridLines(q, 4.6, 0.030) * 0.32;
  float curve1 = lineSoft(abs(q.y - 0.22 * sin(q.x * 3.1 + t * 0.06)), 0.004, 0.018);
  float curve2 = lineSoft(abs(q.y + 0.20 * cos(q.x * 2.5 - t * 0.05)), 0.003, 0.014);
  return sat(g + curve1 * 0.6 + curve2 * 0.42);
}

float fourFieldsLayer(vec2 p, float t) {
  vec2 c = vec2(0.0, 0.0);
  vec2 a = vec2(-0.34, 0.34);
  vec2 b = vec2(0.34, 0.28);
  vec2 d = vec2(-0.30, -0.35);
  vec2 e = vec2(0.33, -0.30);

  float l = 0.0;
  l += lineSoft(segmentDist(p, c, a), 0.004, 0.018);
  l += lineSoft(segmentDist(p, c, b), 0.004, 0.018);
  l += lineSoft(segmentDist(p, c, d), 0.004, 0.018);
  l += lineSoft(segmentDist(p, c, e), 0.004, 0.018);

  float n = 0.0;
  n += 1.0 - smoothstep(0.0, 0.070, length(p - a));
  n += 1.0 - smoothstep(0.0, 0.070, length(p - b));
  n += 1.0 - smoothstep(0.0, 0.070, length(p - d));
  n += 1.0 - smoothstep(0.0, 0.070, length(p - e));
  n += 1.0 - smoothstep(0.0, 0.055, length(p - c));

  float pulse = 0.75 + 0.25 * sin(t * 0.45);
  return sat(l * 0.56 + n * pulse);
}

float orgFlowLayer(vec2 p, float t) {
  float v = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.33 - fi * 0.22;
    vec2 a = vec2(-0.48, y);
    vec2 b = vec2(-0.18, y + 0.035 * sin(t * 0.08 + fi));
    vec2 c = vec2(0.15, y - 0.055);
    vec2 d = vec2(0.48, y - 0.015 * cos(t * 0.06 + fi));
    v += lineSoft(segmentDist(p, a, b), 0.004, 0.012);
    v += lineSoft(segmentDist(p, b, c), 0.004, 0.012);
    v += lineSoft(segmentDist(p, c, d), 0.004, 0.012);
    v += (1.0 - smoothstep(0.0, 0.035, length(p - a))) * 0.6;
    v += (1.0 - smoothstep(0.0, 0.035, length(p - b))) * 0.7;
    v += (1.0 - smoothstep(0.0, 0.035, length(p - c))) * 0.7;
    v += (1.0 - smoothstep(0.0, 0.035, length(p - d))) * 0.6;
  }
  return sat(v * 0.54);
}

float canvasAgentLayer(vec2 p, float t) {
  float v = 0.0;
  vec2 q = p + vec2(0.02 * sin(t * 0.05), 0.02 * cos(t * 0.04));
  vec2 grid = (q + vec2(0.56, 0.92)) * vec2(5.2, 5.0);
  vec2 id = floor(grid);
  vec2 gv = fract(grid) - 0.5;
  float rnd = hash12(id + 23.0);
  float active = step(0.38, rnd);
  float card = boxLine(gv, vec2(0.30, 0.17), 0.010, 0.020) * active;
  float node = (1.0 - smoothstep(0.0, 0.040, length(gv - (hash22(id + 3.0) - 0.5) * 0.44))) * active;

  v += card * 0.36 + node * 0.78;
  v += gridLines(q + vec2(t * 0.004, -t * 0.003), 3.8, 0.020) * 0.18;

  float agent = 1.0 - smoothstep(0.0, 0.045, length(p - vec2(0.28 * sin(t * 0.23), 0.38 * cos(t * 0.17))));
  v += agent * 1.2;
  return sat(v);
}

float pipelineLayer(vec2 p, float t) {
  vec2 q = rot(-0.10) * p;
  float v = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float y = -0.52 + fi * 0.17 + 0.015 * sin(t * 0.08 + fi);
    float frame = boxLine(vec2(q.x * 1.05, q.y - y), vec2(0.34, 0.052), 0.004, 0.012);
    float tick = lineSoft(abs(q.x - (-0.42 + fi * 0.14)), 0.002, 0.010) * (1.0 - smoothstep(0.0, 0.08, abs(q.y - y)));
    v += frame * (0.55 + 0.06 * fi) + tick * 0.4;
    if (i < 6) {
      float y2 = -0.52 + (fi + 1.0) * 0.17;
      v += lineSoft(segmentDist(q, vec2(0.36, y), vec2(0.36, y2)), 0.0025, 0.010) * 0.45;
    }
  }
  return sat(v * 0.75);
}

float personalLayer(vec2 p, float t) {
  vec2 q = p + vec2(0.05, -0.05);
  float halo = exp(-dot(q, q) * 2.6) * 0.36;
  float cardA = boxLine(rot(0.07) * (p - vec2(-0.13, 0.10)), vec2(0.22, 0.13), 0.004, 0.015);
  float cardB = boxLine(rot(-0.05) * (p - vec2(0.17, -0.05)), vec2(0.20, 0.12), 0.004, 0.015);
  float cardC = boxLine(rot(0.03) * (p - vec2(0.03, -0.25)), vec2(0.26, 0.10), 0.003, 0.012);
  float softLine = lineSoft(abs(p.y + 0.42 + 0.04 * sin(p.x * 5.0 + t * 0.06)), 0.003, 0.020);
  return sat(halo + cardA * 0.65 + cardB * 0.52 + cardC * 0.42 + softLine * 0.45);
}

float methodLayer(vec2 p, float t) {
  float v = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = -0.40 + fi * 0.20;
    float wave = y + 0.025 * sin(p.x * 3.0 + t * 0.05 + fi);
    float l = lineSoft(abs(p.y - wave), 0.004, 0.014);
    float node = 1.0 - smoothstep(0.0, 0.040, length(p - vec2(-0.34 + fi * 0.17, y)));
    float panel = boxLine(vec2(p.x - 0.03, p.y - y), vec2(0.43, 0.066), 0.002, 0.010) * 0.35;
    v += l * 0.35 + node * 0.85 + panel;
  }
  return sat(v);
}

float leadPathLayer(vec2 p, float t) {
  vec2 a = vec2(-0.02, -0.98);
  vec2 b = vec2(0.05 + 0.04 * sin(t * 0.06), -0.15);
  vec2 c = vec2(0.18, 0.60);
  float v = lineSoft(segmentDist(p, a, b), 0.004, 0.020);
  v += lineSoft(segmentDist(p, b, c), 0.004, 0.020);
  v += (1.0 - smoothstep(0.0, 0.055, length(p - c))) * 0.7;
  v += exp(-abs(p.y + 0.05) * 5.0) * (1.0 - smoothstep(0.0, 0.62, abs(p.x))) * 0.08;
  return sat(v);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= aspect;

  float t = u_time;
  float scene = clamp(u_scene, 0.0, 8.0);

  float w0 = sceneWeight(0.0, scene);
  float w1 = sceneWeight(1.0, scene);
  float w2 = sceneWeight(2.0, scene);
  float w3 = sceneWeight(3.0, scene);
  float w4 = sceneWeight(4.0, scene);
  float w5 = sceneWeight(5.0, scene);
  float w6 = sceneWeight(6.0, scene);
  float w7 = sceneWeight(7.0, scene);
  float w8 = sceneWeight(8.0, scene);
  float ws = max(w0 + w1 + w2 + w3 + w4 + w5 + w6 + w7 + w8, 0.0001);

  vec2 pointer = (u_pointer - 0.5) * 2.0;
  pointer.x *= aspect;
  float pd = length(p - pointer);
  float cursor = exp(-pd * pd * 14.0) * u_interaction;
  float motion = sat(length(u_velocity) * 16.0);

  vec2 q = p;
  vec2 toPointer = q - pointer;
  q += rot(1.5708) * toPointer * cursor * (0.035 + motion * 0.055);
  q -= normalize(toPointer + vec2(0.0001)) * cursor * 0.030;

  vec2 warp = vec2(
    fbm(q * 1.18 + vec2(t * 0.020, scene * 0.173)),
    fbm(q * 1.24 + vec2(scene * 0.217, -t * 0.018))
  ) - 0.5;
  q += warp * (0.11 + 0.13 * u_noiseAmount + cursor * 0.08);

  vec2 center = (
    w0 * vec2(0.08, -0.05) +
    w1 * vec2(-0.18, 0.08) +
    w2 * vec2(0.00, 0.00) +
    w3 * vec2(-0.10, -0.02) +
    w4 * vec2(0.06, 0.09) +
    w5 * vec2(0.00, -0.02) +
    w6 * vec2(-0.04, -0.12) +
    w7 * vec2(0.00, 0.06) +
    w8 * vec2(0.06, -0.34)
  ) / ws;

  float tilt = (
    w0 * 0.86 + w1 * (-0.20) + w2 * 0.20 + w3 * (-0.10) + w4 * 0.68 +
    w5 * (-0.10) + w6 * 0.35 + w7 * 0.04 + w8 * 0.18
  ) / ws;

  float rx = (
    w0 * 0.72 + w1 * 0.92 + w2 * 0.58 + w3 * 0.70 + w4 * 0.82 +
    w5 * 0.55 + w6 * 0.52 + w7 * 0.62 + w8 * 0.92
  ) / ws;

  float ry = (
    w0 * 0.20 + w1 * 0.34 + w2 * 0.36 + w3 * 0.22 + w4 * 0.42 +
    w5 * 0.18 + w6 * 0.46 + w7 * 0.30 + w8 * 0.18
  ) / ws;

  float density = (
    w0 * 18.0 + w1 * 12.0 + w2 * 16.0 + w3 * 10.0 + w4 * 24.0 +
    w5 * 8.0 + w6 * 14.0 + w7 * 9.0 + w8 * 7.0
  ) / ws;

  float orbit = orbitalLayer(q, center, tilt, rx, ry, density, t);
  float neuro = neuroLayer(q, scene, t);

  float structure = 0.0;
  structure += w0 * blackBoxLayer(q, t);
  structure += w1 * brandGridLayer(q, t);
  structure += w2 * fourFieldsLayer(q, t);
  structure += w3 * orgFlowLayer(q, t);
  structure += w4 * canvasAgentLayer(q, t);
  structure += w5 * pipelineLayer(q, t);
  structure += w6 * personalLayer(q, t);
  structure += w7 * methodLayer(q, t);
  structure += w8 * leadPathLayer(q, t);

  float particles = particleLayer(q, t, scene, orbit + structure);
  float cloudy = fbm(q * 1.35 + vec2(-t * 0.011, t * 0.007));
  float deep = ridged(q * 0.82 + scene * 0.11);

  float vignette = 1.0 - smoothstep(0.18, 1.28, length(p * vec2(1.22, 0.88)));
  float verticalShade = 1.0 - smoothstep(-0.28, 1.05, uv.y);

  vec3 base = mix(u_obsidian, u_ink, 0.54 + 0.16 * cloudy);
  base = mix(base, u_moss * 0.45 + u_obsidian * 0.55, (w1 + w2 + w3 + w4) * 0.23 * deep);
  base = mix(base, u_clay * 0.26 + u_obsidian * 0.74, w6 * 0.28);
  base *= 0.72 + 0.40 * vignette;
  base *= 0.86 + 0.16 * verticalShade;

  float sceneWarmth = sat(w0 * 0.7 + w5 * 0.6 + w6 * 0.95 + w8 * 0.75);
  vec3 lineColor = mix(u_silver, u_ivory, 0.58);
  vec3 warmLine = mix(u_warmGold, u_ivory, 0.18 + 0.25 * sceneWarmth);

  vec3 col = base;
  col += u_moss * (neuro * 0.10) * (w1 + w2 + w3 + w4);
  col += lineColor * neuro * (0.26 + 0.10 * u_noiseAmount);
  col += warmLine * orbit * (0.52 + 0.18 * sceneWarmth);
  col += mix(u_silver, u_warmGold, sceneWarmth) * structure * 0.55;
  col += u_ivory * particles * 0.85;
  col += u_warmGold * cursor * (0.22 + 0.24 * motion);
  col += u_ivory * exp(-pd * pd * 30.0) * u_interaction * 0.12;

  float bloom = sat(orbit * 0.9 + structure * 0.75 + neuro * 0.36 + particles * 0.65);
  col += warmLine * bloom * bloom * 0.18;

  float grain = hash12(gl_FragCoord.xy + floor(t * 24.0));
  float ordered = bayer4(gl_FragCoord.xy / max(1.0, 1.0 + u_dither * 2.0));
  col += (grain - 0.5) * (0.045 * u_noiseAmount);
  col += (ordered - 0.5) * (0.050 * u_dither);

  // Gentle posterization makes the noise shader feel tactile without becoming harsh.
  float poster = mix(255.0, 42.0, sat(u_dither * 0.55));
  col = floor(max(col, 0.0) * poster) / poster;

  col *= u_intensity;
  col = pow(max(col, 0.0), vec3(0.92));

  outColor = vec4(col, 1.0);
}
`

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "")
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [1, 1, 1]
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ]
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Tongye shader compile error:", gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Tongye shader link error:", gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  return program
}

type UniformMap = Record<string, WebGLUniformLocation | null>

function getPageProgress() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0
  const doc = document.documentElement
  const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight)
  return clamp((window.scrollY || doc.scrollTop || 0) / maxScroll, 0, 1)
}

export default function TongyeNeuroOrbitalFieldShader({
  className,
  style,
  children,
  progress,
  scene,
  sceneProgress = 0,
  sceneCount = DEFAULT_SCENE_COUNT,
  position = "absolute",
  opacity = 1,
  speed = 1,
  intensity = 1,
  noiseAmount = 0.88,
  dither = 0.55,
  pixelRatio,
  lowPower = false,
  interactive = true,
  autoScroll = true,
  colors,
}: TongyeNeuroOrbitalFieldShaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const uniformRef = useRef<UniformMap>({})
  const startRef = useRef<number>(0)
  const [webglOk, setWebglOk] = useState(true)

  const propsRef = useRef({
    progress,
    scene,
    sceneProgress,
    sceneCount,
    speed,
    intensity,
    noiseAmount,
    dither,
    lowPower,
    interactive,
    autoScroll,
    palette: { ...DEFAULT_COLORS, ...colors },
  })

  propsRef.current = {
    progress,
    scene,
    sceneProgress,
    sceneCount,
    speed,
    intensity,
    noiseAmount,
    dither,
    lowPower,
    interactive,
    autoScroll,
    palette: { ...DEFAULT_COLORS, ...colors },
  }

  const pointerRef = useRef({
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
    vx: 0,
    vy: 0,
    lastX: 0.5,
    lastY: 0.5,
    interaction: 0,
    interactionTarget: 0,
    pressed: false,
  })

  const wrapperStyle = useMemo<CSSProperties>(() => {
    const positioned: CSSProperties =
      position === "relative"
        ? { position: "relative", width: "100%", height: "100%" }
        : { position, inset: 0, width: "100%", height: "100%" }

    return {
      ...positioned,
      overflow: "hidden",
      pointerEvents: "none",
      opacity,
      background: DEFAULT_COLORS.obsidian,
      ...style,
    }
  }, [opacity, position, style])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: lowPower ? "low-power" : "high-performance",
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      setWebglOk(false)
      return
    }

    setWebglOk(true)
    glRef.current = gl

    const program = createProgram(gl)
    if (!program) {
      setWebglOk(false)
      return
    }

    programRef.current = program
    gl.useProgram(program)

    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const uniforms = [
      "u_time",
      "u_resolution",
      "u_pointer",
      "u_velocity",
      "u_interaction",
      "u_scene",
      "u_globalProgress",
      "u_intensity",
      "u_noiseAmount",
      "u_dither",
      "u_lowPower",
      "u_obsidian",
      "u_ink",
      "u_ivory",
      "u_warmGold",
      "u_moss",
      "u_silver",
      "u_clay",
    ]

    uniformRef.current = Object.fromEntries(
      uniforms.map((name) => [name, gl.getUniformLocation(program, name)]),
    )

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.clearColor(0, 0, 0, 1)

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, propsRef.current.lowPower ? 1.25 : 1.75)
      const width = Math.max(2, Math.floor(rect.width * dpr))
      const height = Math.max(2, Math.floor(rect.height * dpr))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        gl.viewport(0, 0, width, height)
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const updatePointer = (clientX: number, clientY: number, strong = false) => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const nx = clamp((clientX - rect.left) / rect.width, 0, 1)
      const ny = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
      const pointer = pointerRef.current
      pointer.vx = nx - pointer.lastX
      pointer.vy = ny - pointer.lastY
      pointer.lastX = nx
      pointer.lastY = ny
      pointer.tx = nx
      pointer.ty = ny
      pointer.interactionTarget = Math.max(pointer.interactionTarget, strong ? 1.15 : 0.52)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!propsRef.current.interactive) return
      updatePointer(event.clientX, event.clientY, false)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!propsRef.current.interactive) return
      pointerRef.current.pressed = true
      updatePointer(event.clientX, event.clientY, true)
    }

    const handlePointerUp = () => {
      pointerRef.current.pressed = false
      pointerRef.current.interactionTarget = 0.38
    }

    const handlePointerLeave = () => {
      if (!pointerRef.current.pressed) pointerRef.current.interactionTarget = 0.0
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerdown", handlePointerDown, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    window.addEventListener("pointercancel", handlePointerUp, { passive: true })
    window.addEventListener("blur", handlePointerLeave)

    startRef.current = performance.now()

    const render = (now: number) => {
      const context = glRef.current
      const shaderProgram = programRef.current
      if (!context || !shaderProgram) return

      resize()

      const current = propsRef.current
      const pointer = pointerRef.current
      const uniforms = uniformRef.current
      const palette = current.palette

      pointer.x += (pointer.tx - pointer.x) * 0.085
      pointer.y += (pointer.ty - pointer.y) * 0.085
      pointer.vx *= 0.90
      pointer.vy *= 0.90

      if (!pointer.pressed) pointer.interactionTarget *= 0.94
      pointer.interaction += (pointer.interactionTarget - pointer.interaction) * 0.075

      const globalProgress = clamp(
        current.progress ?? (current.autoScroll ? getPageProgress() : 0),
        0,
        1,
      )

      const count = Math.max(2, current.sceneCount || DEFAULT_SCENE_COUNT)
      const sceneFloat =
        typeof current.scene === "number"
          ? clamp(current.scene + clamp(current.sceneProgress || 0, 0, 1), 0, count - 1)
          : globalProgress * (count - 1)

      const time = ((now - startRef.current) / 1000) * current.speed

      context.useProgram(shaderProgram)
      context.clear(context.COLOR_BUFFER_BIT)

      const set3 = (name: string, color: string) => {
        const rgb = hexToRgb(color)
        const loc = uniforms[name]
        if (loc) context.uniform3f(loc, rgb[0], rgb[1], rgb[2])
      }

      if (uniforms.u_time) context.uniform1f(uniforms.u_time, time)
      if (uniforms.u_resolution) context.uniform2f(uniforms.u_resolution, canvas.width, canvas.height)
      if (uniforms.u_pointer) context.uniform2f(uniforms.u_pointer, pointer.x, pointer.y)
      if (uniforms.u_velocity) context.uniform2f(uniforms.u_velocity, pointer.vx, pointer.vy)
      if (uniforms.u_interaction) context.uniform1f(uniforms.u_interaction, clamp(pointer.interaction, 0, 1.35))
      if (uniforms.u_scene) context.uniform1f(uniforms.u_scene, sceneFloat)
      if (uniforms.u_globalProgress) context.uniform1f(uniforms.u_globalProgress, globalProgress)
      if (uniforms.u_intensity) context.uniform1f(uniforms.u_intensity, current.intensity)
      if (uniforms.u_noiseAmount) context.uniform1f(uniforms.u_noiseAmount, current.noiseAmount)
      if (uniforms.u_dither) context.uniform1f(uniforms.u_dither, current.dither)
      if (uniforms.u_lowPower) context.uniform1f(uniforms.u_lowPower, current.lowPower ? 1 : 0)

      set3("u_obsidian", palette.obsidian)
      set3("u_ink", palette.ink)
      set3("u_ivory", palette.ivory)
      set3("u_warmGold", palette.warmGold)
      set3("u_moss", palette.moss)
      set3("u_silver", palette.silver)
      set3("u_clay", palette.clay)

      context.drawArrays(context.TRIANGLES, 0, 6)
      frameRef.current = requestAnimationFrame(render)
    }

    frameRef.current = requestAnimationFrame(render)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      window.removeEventListener("blur", handlePointerLeave)
      resizeObserver.disconnect()
      if (buffer) gl.deleteBuffer(buffer)
      if (programRef.current) gl.deleteProgram(programRef.current)
      programRef.current = null
      glRef.current = null
    }
  }, [lowPower, pixelRatio])

  return (
    <div ref={containerRef} className={className} style={wrapperStyle} aria-hidden={!children}>
      {webglOk ? (
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 45% 30%, rgba(199,177,122,.26), transparent 32%), radial-gradient(circle at 60% 70%, rgba(18,58,50,.32), transparent 42%), #080807",
          }}
        />
      )}
      {children ? <div style={{ position: "relative", zIndex: 1 }}>{children}</div> : null}
    </div>
  )
}

export function TongyeShaderDebugScenes() {
  return (
    <div style={{ position: "relative", minHeight: `${DEFAULT_SCENE_COUNT * 100}vh`, background: "#080807" }}>
      <TongyeNeuroOrbitalFieldShader position="fixed" opacity={1} />
      <div style={{ position: "relative", zIndex: 2, color: "#E9E2D2", padding: "12vh 8vw" }}>
        {TONGYE_FIELD_SCENES.map((name, index) => (
          <section
            key={name}
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              fontFamily: '"PingFang SC", system-ui, sans-serif',
            }}
          >
            <div>
              <div style={{ opacity: 0.55, marginBottom: 16 }}>S{String(index).padStart(2, "0")}</div>
              <h2 style={{ fontSize: "clamp(40px, 9vw, 92px)", fontWeight: 300, lineHeight: 1.05, margin: 0 }}>{name}</h2>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
