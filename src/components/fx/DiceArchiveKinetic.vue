<template>
  <view
    class="dice-kinetic"
    :class="[`dice-kinetic--${chapter.tone}`, `dice-kinetic--mode-${mode}`]"
    :style="rootStyle"
  >
    <view class="dice-kinetic__wash" :style="washStyle" />

    <view class="dice-kinetic__grid">
      <view v-for="line in gridLines" :key="line" class="dice-kinetic__grid-line" />
    </view>

    <view class="dice-kinetic__letters dice-kinetic__letters--back">
      <text class="dice-kinetic__letter dice-kinetic__letter--d" :style="letterStyle(0, 'back')">D</text>
      <text class="dice-kinetic__letter dice-kinetic__letter--i" :style="letterStyle(1, 'back')">I</text>
      <text class="dice-kinetic__letter dice-kinetic__letter--e" :style="letterStyle(3, 'back')">E</text>
    </view>

    <view class="dice-kinetic__css-shape" :style="shapeStyle">
      <view class="dice-kinetic__css-shape-core" />
      <view class="dice-kinetic__css-shape-sheen" />
    </view>

    <canvas
      id="diceWebglCanvas"
      canvas-id="diceWebglCanvas"
      class="dice-kinetic__webgl"
      type="webgl"
    />

    <view class="dice-kinetic__meta">
      <text>{{ chapter.meta }}</text>
      <text>{{ modeLabel }}</text>
      <text>{{ year }}</text>
    </view>

    <view class="dice-kinetic__shape-readout">
      <text>FORCE {{ shapeIntensity }}</text>
      <text>MATERIAL {{ materialName }}</text>
      <text>SCROLL {{ progressText }}</text>
    </view>

    <view class="dice-kinetic__letters dice-kinetic__letters--front">
      <text class="dice-kinetic__letter dice-kinetic__letter--c" :style="letterStyle(2, 'front')">C</text>
      <text class="dice-kinetic__letter dice-kinetic__letter--i-front" :style="letterStyle(1, 'front')">I</text>
    </view>

    <view class="dice-kinetic__chapter" :style="chapterStyle">
      <text class="dice-kinetic__chapter-kicker">{{ chapter.kicker }}</text>
      <text class="dice-kinetic__chapter-title">{{ chapter.title }}</text>
    </view>

    <view class="dice-kinetic__footer-rule">
      <text>DIGITAL IN BERLIN</text>
      <text>TYPE / MOTION / WEBGL</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted } from 'vue'

type DiceTone = 'archive' | 'programme' | 'gallery' | 'future'
type DiceMode = 'archive' | 'program' | 'tool' | 'media'
type LetterLayer = 'back' | 'front'

type DiceChapter = {
  kicker: string
  title: string
  meta: string
  tone: DiceTone
}

const props = withDefaults(
  defineProps<{
    progress: number
    velocity: number
    idlePhase: number
    chapter: DiceChapter
    mode: DiceMode
    year: string
    shapeIntensity: number
    materialIndex: number
  }>(),
  {
    progress: 0,
    velocity: 0,
    idlePhase: 0,
    mode: 'archive',
    year: '2022',
    shapeIntensity: 3,
    materialIndex: 0
  }
)

const instance = getCurrentInstance()
const gridLines = Array.from({ length: 10 }, (_, index) => `line-${index}`)
const energy = computed(() => Math.min(1.4, Math.abs(props.velocity) / 42 + (props.shapeIntensity - 3) * 0.08))
const phase = computed(() => props.progress * 8.2 + props.idlePhase * 0.18 + props.shapeIntensity * 0.11)
const modeLabel = computed(() => props.mode.toUpperCase())
const progressText = computed(() => `${Math.round(props.progress * 100).toString().padStart(2, '0')}%`)

let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let canvasNode: any = null
let rafId = 0
let timeoutId: ReturnType<typeof setTimeout> | null = null
let startTime = Date.now()
let lastWidth = 0
let lastHeight = 0

const palettes: Record<DiceTone, { base: [number, number, number]; deep: [number, number, number]; hot: [number, number, number] }> = {
  archive: {
    base: [0.36, 0.88, 0.63],
    deep: [0.02, 0.28, 0.22],
    hot: [0.82, 1.0, 0.88]
  },
  programme: {
    base: [0.64, 0.72, 0.94],
    deep: [0.82, 0.18, 0.30],
    hot: [1.0, 0.92, 0.76]
  },
  gallery: {
    base: [1.0, 0.74, 0.18],
    deep: [0.36, 0.16, 0.06],
    hot: [1.0, 0.92, 0.58]
  },
  future: {
    base: [0.78, 0.86, 0.82],
    deep: [0.18, 0.24, 0.34],
    hot: [1.0, 0.42, 0.52]
  }
}

const materialPalettes = [
  {
    name: 'MINT',
    css: '#58dc9f',
    base: [0.36, 0.88, 0.63],
    deep: [0.02, 0.28, 0.22],
    hot: [0.82, 1.0, 0.88]
  },
  {
    name: 'INK',
    css: '#111611',
    base: [0.66, 0.70, 0.66],
    deep: [0.02, 0.03, 0.025],
    hot: [0.98, 1.0, 0.88]
  },
  {
    name: 'CORAL',
    css: '#ff5f78',
    base: [1.0, 0.40, 0.50],
    deep: [0.28, 0.04, 0.08],
    hot: [1.0, 0.88, 0.72]
  },
  {
    name: 'AMBER',
    css: '#ffc438',
    base: [1.0, 0.74, 0.18],
    deep: [0.34, 0.16, 0.02],
    hot: [1.0, 0.94, 0.60]
  }
] satisfies Array<{ name: string; css: string; base: number[]; deep: number[]; hot: number[] }>

const material = computed(() => materialPalettes[Math.max(0, Math.min(materialPalettes.length - 1, props.materialIndex))] || materialPalettes[0])
const materialName = computed(() => material.value.name)
const rootStyle = computed(() => ({
  '--dice-accent': material.value.css,
  '--dice-force': `${0.75 + props.shapeIntensity * 0.1}`
}))

const washStyle = computed(() => {
  const x = Math.sin(phase.value * 0.7) * 18 + props.velocity * 0.24
  const y = Math.cos(phase.value * 0.58) * 16
  const scale = 1 + energy.value * 0.16

  return {
    transform: `translate3d(${x}rpx, ${y}rpx, 0) scale(${scale})`
  }
})

const chapterStyle = computed(() => {
  const x = props.progress * 72
  const y = Math.sin(phase.value * 0.8) * 10

  return {
    transform: `translate3d(${x}rpx, ${y}rpx, 0)`
  }
})

const shapeStyle = computed(() => {
  const force = props.shapeIntensity
  const x = Math.sin(phase.value * 0.42) * 26 + props.velocity * 0.28
  const y = Math.cos(phase.value * 0.36) * 18
  const rotate = Math.sin(phase.value * 0.3) * 18 + props.progress * 74
  const skew = Math.cos(phase.value * 0.24) * 7
  const scale = 0.94 + force * 0.035 + energy.value * 0.04

  return {
    transform: `translate3d(${x}rpx, ${y}rpx, 0) rotate(${rotate}deg) skew(${skew}deg) scale(${scale})`
  }
})

onMounted(() => {
  setTimeout(initWebgl, 80)
})

onBeforeUnmount(() => {
  stopLoop()
  gl = null
  program = null
  canvasNode = null
})

function letterStyle(index: number, layer: LetterLayer) {
  const direction = index % 2 === 0 ? 1 : -1
  const p = phase.value + index * 0.82
  const fast = energy.value * direction
  const force = 1 + props.shapeIntensity * 0.09
  const modeOffset = props.mode === 'tool' ? 22 : props.mode === 'media' ? -12 : 0
  const x = Math.sin(p) * 34 * force + props.velocity * 0.92 * direction + modeOffset * direction
  const y = Math.cos(p * 0.77) * 28 * force + props.progress * 210 * (layer === 'front' ? -0.18 : -0.32)
  const rotate = Math.sin(p * 0.64) * 6 * force + fast * 8
  const scale = 1 + energy.value * 0.05 + (props.mode === 'tool' ? 0.03 : 0)
  const opacity = layer === 'front' ? 0.92 : 0.78

  return {
    opacity,
    transform: `translate3d(${x}rpx, ${y}rpx, 0) rotate(${rotate}deg) scale(${scale})`
  }
}

function initWebgl() {
  // #ifdef MP-WEIXIN
  const query = (uni.createSelectorQuery() as any).in(instance?.proxy)
  query
    .select('#diceWebglCanvas')
    .fields({ node: true, size: true })
    .exec((res: any[]) => {
      const item = res && res[0]
      if (!item?.node) return
      setupWebgl(item.node, item.width || 375, item.height || 667)
    })
  // #endif

  // #ifdef H5
  const canvasHost = document.getElementById('diceWebglCanvas')
  const canvas = (
    canvasHost instanceof HTMLCanvasElement
      ? canvasHost
      : canvasHost?.querySelector('canvas')
  ) as HTMLCanvasElement | null
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  setupWebgl(canvas, rect.width || window.innerWidth, rect.height || window.innerHeight)
  // #endif
}

function setupWebgl(canvas: any, width: number, height: number) {
  if (typeof canvas?.getContext !== 'function') return

  canvasNode = canvas
  const context = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false
  }) as WebGLRenderingContext | null

  if (!context) return

  gl = context
  program = createProgram(context, vertexShaderSource, fragmentShaderSource)
  if (!program) return

  const buffer = context.createBuffer()
  context.bindBuffer(context.ARRAY_BUFFER, buffer)
  context.bufferData(
    context.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    context.STATIC_DRAW
  )

  context.useProgram(program)
  const position = context.getAttribLocation(program, 'a_position')
  context.enableVertexAttribArray(position)
  context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0)
  context.enable(context.BLEND)
  context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA)
  context.clearColor(0, 0, 0, 0)

  startTime = Date.now()
  resizeCanvas(width, height)
  drawFrame()
}

function resizeCanvas(width: number, height: number) {
  if (!gl || !canvasNode) return
  const info = uni.getSystemInfoSync()
  const dpr = Math.min(1.35, Number(info.pixelRatio || 1))
  const renderScale = 0.78
  const targetWidth = Math.max(1, Math.floor(width * dpr * renderScale))
  const targetHeight = Math.max(1, Math.floor(height * dpr * renderScale))

  if (targetWidth === lastWidth && targetHeight === lastHeight) return
  lastWidth = targetWidth
  lastHeight = targetHeight
  canvasNode.width = targetWidth
  canvasNode.height = targetHeight
  gl.viewport(0, 0, targetWidth, targetHeight)
}

function drawFrame() {
  if (!gl || !program) return
  const tonePalette = palettes[props.chapter.tone] || palettes.archive
  const palette = props.mode === 'tool' ? material.value : tonePalette
  const time = (Date.now() - startTime) / 1000

  gl.useProgram(program)
  setUniform2f('u_resolution', lastWidth || 1, lastHeight || 1)
  setUniform1f('u_time', time)
  setUniform1f('u_progress', props.progress)
  setUniform1f('u_velocity', props.velocity)
  setUniform1f('u_force', props.shapeIntensity)
  setUniform3f('u_base', palette.base as [number, number, number])
  setUniform3f('u_deep', palette.deep as [number, number, number])
  setUniform3f('u_hot', palette.hot as [number, number, number])
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  rafId = requestCanvasFrame(drawFrame)
}

function requestCanvasFrame(callback: () => void) {
  if (canvasNode?.requestAnimationFrame) {
    return canvasNode.requestAnimationFrame(callback)
  }

  // #ifdef H5
  return window.requestAnimationFrame(callback)
  // #endif

  timeoutId = setTimeout(callback, 33)
  return 0
}

function stopLoop() {
  if (canvasNode?.cancelAnimationFrame && rafId) {
    canvasNode.cancelAnimationFrame(rafId)
  }
  // #ifdef H5
  if (rafId) window.cancelAnimationFrame(rafId)
  // #endif
  if (timeoutId) clearTimeout(timeoutId)
  rafId = 0
  timeoutId = null
}

function setUniform1f(name: string, value: number) {
  if (!gl || !program) return
  const location = gl.getUniformLocation(program, name)
  if (location) gl.uniform1f(location, value)
}

function setUniform2f(name: string, x: number, y: number) {
  if (!gl || !program) return
  const location = gl.getUniformLocation(program, name)
  if (location) gl.uniform2f(location, x, y)
}

function setUniform3f(name: string, value: [number, number, number]) {
  if (!gl || !program) return
  const location = gl.getUniformLocation(program, name)
  if (location) gl.uniform3f(location, value[0], value[1], value[2])
}

function createProgram(context: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compileShader(context, context.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(context, context.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) return null

  const nextProgram = context.createProgram()
  if (!nextProgram) return null

  context.attachShader(nextProgram, vertex)
  context.attachShader(nextProgram, fragment)
  context.linkProgram(nextProgram)

  if (!context.getProgramParameter(nextProgram, context.LINK_STATUS)) {
    console.error(context.getProgramInfoLog(nextProgram))
    return null
  }

  return nextProgram
}

function compileShader(context: WebGLRenderingContext, type: number, source: string) {
  const shader = context.createShader(type)
  if (!shader) return null

  context.shaderSource(shader, source)
  context.compileShader(shader)

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.error(context.getShaderInfoLog(shader))
    return null
  }

  return shader
}

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShaderSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_progress;
uniform float u_velocity;
uniform float u_force;
uniform vec3 u_base;
uniform vec3 u_deep;
uniform vec3 u_hot;

varying vec2 v_uv;

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float radius) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

vec3 bend(vec3 p) {
  float scroll = u_progress * 6.2831853;
  float force = 0.74 + u_force * 0.10;
  p.xz *= rot(force * 0.58 * sin(scroll + p.y * 1.6) + u_velocity * 0.012);
  p.xy *= rot(force * 0.18 * sin(u_time * 0.55 + p.z * 2.0));
  p += force * 0.055 * vec3(
    sin(p.y * 5.0 + u_time * 0.7),
    sin(p.z * 4.0 + scroll),
    sin(p.x * 4.5 - u_time * 0.6)
  );
  return p;
}

float mapShape(vec3 p) {
  p = bend(p);

  float body = sdEllipsoid(p - vec3(0.0, -0.04, 0.0), vec3(0.55, 0.76, 0.38));

  vec3 q = p;
  q.xy *= rot(-0.38);
  float ribbon = sdCapsule(q, vec3(-0.82, 0.18, -0.08), vec3(0.78, 0.30, 0.10), 0.25);

  vec3 tail = p - vec3(0.12, -0.56, 0.05);
  tail.xy *= rot(0.38 + 0.2 * sin(u_progress * 6.2831853));
  float tailD = sdEllipsoid(tail, vec3(0.62, 0.22, 0.30));

  vec3 lip = p - vec3(-0.25, 0.42, -0.02);
  lip.xy *= rot(-0.45);
  float lipD = sdEllipsoid(lip, vec3(0.46, 0.20, 0.26));

  float d = smin(body, ribbon, 0.42);
  d = smin(d, tailD, 0.32);
  d = smin(d, lipD, 0.26);
  d += 0.025 * sin(10.0 * p.x + u_time) * sin(7.0 * p.y - u_progress * 9.0);
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(
    mapShape(p + e.xyy) - mapShape(p - e.xyy),
    mapShape(p + e.yxy) - mapShape(p - e.yxy),
    mapShape(p + e.yyx) - mapShape(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  uv.x *= 1.04;
  uv.y -= 0.02;

  vec3 ro = vec3(0.0, 0.02, 3.15);
  vec3 rd = normalize(vec3(uv * 1.78, -2.35));

  float yaw = (0.40 + u_force * 0.045) * sin(u_progress * 6.2831853) + u_velocity * 0.012;
  float pitch = 0.25 * cos(u_progress * 4.4 + u_time * 0.12);
  ro.xz *= rot(yaw);
  rd.xz *= rot(yaw);
  ro.yz *= rot(pitch);
  rd.yz *= rot(pitch);

  float t = 0.0;
  float d = 0.0;
  bool hit = false;

  for (int i = 0; i < 58; i++) {
    vec3 p = ro + rd * t;
    d = mapShape(p);
    if (d < 0.006) {
      hit = true;
      break;
    }
    if (t > 6.0) break;
    t += d * 0.72;
  }

  if (!hit) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 lightDir = normalize(vec3(-0.38, 0.74, 0.52));
  vec3 fillDir = normalize(vec3(0.64, -0.22, 0.58));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);
  float fill = clamp(dot(n, fillDir), 0.0, 1.0);
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
  float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 36.0);
  float bands = 0.5 + 0.5 * sin((p.x + p.y * 0.75 + p.z * 0.35) * 12.0 + u_progress * 8.0);

  vec3 color = mix(u_deep, u_base, 0.42 + 0.58 * diff);
  color += u_hot * spec * 0.72;
  color += u_hot * rim * 0.28;
  color += u_base * fill * 0.16;
  color = mix(color, color + u_hot * 0.12, bands * 0.22);

  float alpha = clamp(0.82 + rim * 0.18, 0.0, 0.98);
  gl_FragColor = vec4(color, alpha);
}
`
</script>

<style scoped lang="scss">
.dice-kinetic {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  --dice-accent: #58dc9f;
  color: #101611;
  background: #eceed8;
}

.dice-kinetic__wash {
  position: absolute;
  inset: -18vh -20vw;
  z-index: 0;
  opacity: .9;
  background:
    radial-gradient(circle at 18% 22%, rgba(255, 196, 178, .62), transparent 22%),
    radial-gradient(circle at 78% 64%, rgba(94, 221, 160, .52), transparent 34%),
    radial-gradient(circle at 52% 48%, rgba(255, 255, 255, .38), transparent 28%);
  transition: transform .42s cubic-bezier(.16, 1, .3, 1);
}

.dice-kinetic__grid {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: .18;
  pointer-events: none;
}

.dice-kinetic__grid-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1rpx;
  background: currentColor;
}

.dice-kinetic__grid-line:nth-child(1) {
  top: 12%;
}

.dice-kinetic__grid-line:nth-child(2) {
  top: 22%;
}

.dice-kinetic__grid-line:nth-child(3) {
  top: 32%;
}

.dice-kinetic__grid-line:nth-child(4) {
  top: 42%;
}

.dice-kinetic__grid-line:nth-child(5) {
  top: 52%;
}

.dice-kinetic__grid-line:nth-child(6) {
  top: 62%;
}

.dice-kinetic__grid-line:nth-child(7) {
  top: 72%;
}

.dice-kinetic__grid-line:nth-child(8) {
  top: 82%;
}

.dice-kinetic__grid-line:nth-child(9) {
  top: 92%;
}

.dice-kinetic__grid-line:nth-child(10) {
  top: 50%;
  height: 100%;
  width: 1rpx;
  left: 50%;
  right: auto;
  transform: translateY(-50%);
}

.dice-kinetic--archive {
  background: #eaedd7;
}

.dice-kinetic--programme {
  background: #dfe3e8;
}

.dice-kinetic--gallery {
  background: #50936f;
}

.dice-kinetic--future {
  background: #eff0e6;
}

.dice-kinetic--programme .dice-kinetic__wash {
  background:
    radial-gradient(circle at 72% 36%, rgba(255, 82, 110, .56), transparent 22%),
    radial-gradient(circle at 32% 58%, rgba(125, 160, 226, .52), transparent 32%),
    radial-gradient(circle at 58% 48%, rgba(248, 242, 188, .58), transparent 30%);
}

.dice-kinetic--gallery .dice-kinetic__wash {
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 206, 189, .74), transparent 22%),
    radial-gradient(circle at 76% 52%, rgba(255, 244, 217, .62), transparent 28%),
    radial-gradient(circle at 48% 58%, rgba(40, 126, 82, .88), transparent 42%);
}

.dice-kinetic__webgl {
  position: absolute;
  inset: 0;
  z-index: 3;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

.dice-kinetic__css-shape {
  position: absolute;
  top: 20vh;
  left: 28vw;
  z-index: 2;
  width: 390rpx;
  height: 450rpx;
  pointer-events: none;
  transition: transform .38s cubic-bezier(.16, 1, .3, 1);
}

.dice-kinetic__css-shape-core {
  position: absolute;
  inset: 12rpx 28rpx;
  border-radius: 46% 54% 36% 64% / 58% 32% 68% 42%;
  opacity: .78;
  background:
    radial-gradient(circle at 30% 26%, rgba(255, 255, 255, .78), transparent 20%),
    radial-gradient(circle at 70% 68%, rgba(17, 22, 17, .34), transparent 36%),
    linear-gradient(135deg, rgba(255, 255, 255, .20), transparent 46%),
    var(--dice-accent);
  box-shadow:
    0 38rpx 80rpx rgba(17, 22, 17, .16),
    inset 34rpx 28rpx 56rpx rgba(255, 255, 255, .24),
    inset -34rpx -28rpx 64rpx rgba(17, 22, 17, .20);
  filter: saturate(1.18);
}

.dice-kinetic__css-shape-core::before,
.dice-kinetic__css-shape-core::after {
  content: "";
  position: absolute;
  background: inherit;
  box-shadow: inherit;
}

.dice-kinetic__css-shape-core::before {
  width: 70%;
  height: 38%;
  left: -20%;
  top: 22%;
  border-radius: 55% 45% 64% 36% / 42% 70% 30% 58%;
  transform: rotate(-22deg);
}

.dice-kinetic__css-shape-core::after {
  width: 58%;
  height: 36%;
  right: -12%;
  bottom: 4%;
  border-radius: 44% 56% 34% 66% / 58% 42% 58% 42%;
  transform: rotate(18deg);
}

.dice-kinetic__css-shape-sheen {
  position: absolute;
  top: 26%;
  left: 28%;
  z-index: 2;
  width: 42%;
  height: 18%;
  border-radius: 999rpx;
  opacity: .42;
  background: rgba(255, 255, 255, .9);
  filter: blur(8rpx);
  transform: rotate(-28deg);
}

.dice-kinetic__meta {
  position: absolute;
  top: calc(var(--safe-top) + 72rpx);
  right: 34rpx;
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  color: rgba(13, 18, 14, .86);
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0;
  text-align: right;
  white-space: nowrap;
}

.dice-kinetic__shape-readout {
  position: absolute;
  top: 18vh;
  right: 34rpx;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
  color: rgba(13, 18, 14, .58);
  font-size: 16rpx;
  font-weight: 800;
  line-height: 1;
  text-align: right;
  pointer-events: none;
}

.dice-kinetic__letters {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.dice-kinetic__letters--front {
  z-index: 5;
}

.dice-kinetic__letter {
  position: absolute;
  display: block;
  color: var(--dice-accent);
  font-size: 236rpx;
  font-weight: 600;
  line-height: .8;
  transition: transform .28s cubic-bezier(.16, 1, .3, 1), opacity .28s ease;
  white-space: nowrap;
}

.dice-kinetic--programme .dice-kinetic__letter,
.dice-kinetic--future .dice-kinetic__letter {
  color: #101412;
}

.dice-kinetic--gallery .dice-kinetic__letter {
  color: rgba(255, 255, 255, .94);
}

.dice-kinetic__letter--d {
  top: 128rpx;
  left: 202rpx;
}

.dice-kinetic__letter--i {
  top: 102rpx;
  left: 418rpx;
}

.dice-kinetic__letter--c {
  top: 270rpx;
  left: 170rpx;
}

.dice-kinetic__letter--i-front {
  top: 222rpx;
  left: 432rpx;
  opacity: .34;
}

.dice-kinetic__letter--e {
  top: 298rpx;
  left: 418rpx;
}

.dice-kinetic__chapter {
  position: absolute;
  left: auto;
  right: 34rpx;
  bottom: 20vh;
  z-index: 2;
  display: none;
  flex-direction: column;
  gap: 12rpx;
  align-items: flex-end;
  color: var(--dice-accent);
  opacity: .26;
  text-align: right;
  transition: transform .32s cubic-bezier(.16, 1, .3, 1);
  pointer-events: none;
}

.dice-kinetic--programme .dice-kinetic__chapter,
.dice-kinetic--future .dice-kinetic__chapter {
  color: rgba(8, 10, 9, .94);
}

.dice-kinetic--gallery .dice-kinetic__chapter {
  color: rgba(255, 255, 255, .94);
}

.dice-kinetic__chapter-kicker {
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
}

.dice-kinetic__chapter-title {
  max-width: 520rpx;
  font-size: 58rpx;
  font-weight: 500;
  line-height: .9;
  text-transform: uppercase;
}

.dice-kinetic__footer-rule {
  position: absolute;
  left: 34rpx;
  right: 34rpx;
  bottom: 26rpx;
  z-index: 6;
  display: flex;
  justify-content: space-between;
  border-top: 1rpx solid rgba(13, 18, 14, .22);
  padding-top: 10rpx;
  color: rgba(13, 18, 14, .58);
  font-size: 16rpx;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
}

.dice-kinetic--mode-tool .dice-kinetic__grid {
  opacity: .28;
}

.dice-kinetic--mode-tool .dice-kinetic__shape-readout {
  color: rgba(13, 18, 14, .78);
}

.dice-kinetic--gallery .dice-kinetic__grid,
.dice-kinetic--gallery .dice-kinetic__footer-rule {
  color: rgba(255, 255, 255, .86);
}

.dice-kinetic--gallery .dice-kinetic__meta,
.dice-kinetic--gallery .dice-kinetic__shape-readout {
  color: rgba(255, 255, 255, .82);
}

@media (max-width: 360px) {
  .dice-kinetic__letter {
    font-size: 206rpx;
  }

  .dice-kinetic__letter--d {
    left: 176rpx;
  }

  .dice-kinetic__letter--i,
  .dice-kinetic__letter--i-front,
  .dice-kinetic__letter--e {
    left: 382rpx;
  }

  .dice-kinetic__letter--c {
    left: 144rpx;
  }

  .dice-kinetic__css-shape {
    top: 18vh;
    left: 20vw;
    width: 330rpx;
    height: 390rpx;
  }

  .dice-kinetic__chapter {
    right: 24rpx;
    bottom: 35vh;
  }

  .dice-kinetic__chapter-title {
    font-size: 44rpx;
  }
}
</style>
