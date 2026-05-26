"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Warp } from "@paper-design/shaders-react"

type WarpParams = {
  proportion: number
  softness: number
  distortion: number
  swirl: number
  shapeScale: number
  rotation: number
  speed: number
  scale: number
}

type PointerState = {
  x: number
  y: number
  dx: number
  dy: number
  active: number
  down: number
}

type InteractiveWarpNoiseShaderProps = {
  className?: string
  children?: React.ReactNode
  colors?: string[]
  noiseOpacity?: number
  pixelSize?: number
}

const DEFAULT_COLORS = [
  "hsl(200, 100%, 18%)",
  "hsl(160, 100%, 74%)",
  "hsl(185, 90%, 30%)",
  "hsl(170, 100%, 86%)",
]

const BASE_WARP: WarpParams = {
  proportion: 0.45,
  softness: 1,
  distortion: 0.25,
  swirl: 0.8,
  shapeScale: 0.1,
  rotation: 0,
  speed: 1,
  scale: 1,
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

function almostSame(a: WarpParams, b: WarpParams) {
  return (
    Math.abs(a.proportion - b.proportion) < 0.0005 &&
    Math.abs(a.softness - b.softness) < 0.0005 &&
    Math.abs(a.distortion - b.distortion) < 0.0005 &&
    Math.abs(a.swirl - b.swirl) < 0.0005 &&
    Math.abs(a.shapeScale - b.shapeScale) < 0.0005 &&
    Math.abs(a.rotation - b.rotation) < 0.0005 &&
    Math.abs(a.speed - b.speed) < 0.0005 &&
    Math.abs(a.scale - b.scale) < 0.0005
  )
}

export default function InteractiveWarpNoiseShader({
  className = "",
  children,
  colors = DEFAULT_COLORS,
  noiseOpacity = 0.72,
  pixelSize = 4,
}: InteractiveWarpNoiseShaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<PointerState>({ x: 0.5, y: 0.5, dx: 0, dy: 0, active: 0, down: 0 })
  const [warp, setWarp] = useState<WarpParams>(BASE_WARP)

  const updatePointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = rootRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return

    const x = clamp((event.clientX - bounds.left) / bounds.width)
    const y = clamp((event.clientY - bounds.top) / bounds.height)
    const pointer = pointerRef.current

    pointer.dx = x - pointer.x
    pointer.dy = y - pointer.y
    pointer.x = x
    pointer.y = y
    pointer.active = 1
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      updatePointer(event)
    },
    [updatePointer],
  )

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      updatePointer(event)
      pointerRef.current.active = 1
    },
    [updatePointer],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      updatePointer(event)
      pointerRef.current.down = 1
      pointerRef.current.active = 1
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [updatePointer],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointerRef.current.down = 0
    pointerRef.current.active = event.pointerType === "mouse" ? 1 : 0
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [])

  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current.down === 0) pointerRef.current.active = 0
    if (event.pointerType !== "mouse") pointerRef.current.down = 0
  }, [])

  useEffect(() => {
    let raf = 0

    const tick = () => {
      const pointer = pointerRef.current
      const motion = clamp(Math.hypot(pointer.dx, pointer.dy) * 28)
      const centeredX = pointer.x - 0.5
      const centeredY = pointer.y - 0.5
      const force = pointer.active * (0.52 + motion * 0.42 + pointer.down * 0.35)

      const target: WarpParams = {
        proportion: clamp(0.45 + centeredY * 0.12 * force, 0.32, 0.62),
        softness: clamp(0.92 + force * 0.35, 0.7, 1.55),
        distortion: clamp(0.25 + force * 0.32 + motion * 0.18, 0.18, 0.82),
        swirl: clamp(0.8 + force * 1.05 + centeredX * 0.3, 0.35, 2.4),
        shapeScale: clamp(0.1 - force * 0.025, 0.04, 0.16),
        rotation: centeredX * 0.35 + pointer.dx * 2.2,
        speed: clamp(0.85 + force * 0.95 + motion * 0.35, 0.35, 2.4),
        scale: clamp(1 + force * 0.05, 0.95, 1.08),
      }

      setWarp((current) => {
        const next: WarpParams = {
          proportion: lerp(current.proportion, target.proportion, 0.09),
          softness: lerp(current.softness, target.softness, 0.08),
          distortion: lerp(current.distortion, target.distortion, 0.09),
          swirl: lerp(current.swirl, target.swirl, 0.08),
          shapeScale: lerp(current.shapeScale, target.shapeScale, 0.08),
          rotation: lerp(current.rotation, target.rotation, 0.08),
          speed: lerp(current.speed, target.speed, 0.07),
          scale: lerp(current.scale, target.scale, 0.08),
        }

        return almostSame(current, next) ? current : next
      })

      pointer.dx = lerp(pointer.dx, 0, 0.18)
      pointer.dy = lerp(pointer.dy, 0, 0.18)

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <main
      ref={rootRef}
      className={`relative min-h-screen overflow-hidden bg-black ${className}`}
      style={{ touchAction: "pan-y" }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <div className="absolute inset-0">
        <Warp
          style={{ height: "100%", width: "100%" }}
          proportion={warp.proportion}
          softness={warp.softness}
          distortion={warp.distortion}
          swirl={warp.swirl}
          swirlIterations={10}
          shape="checks"
          shapeScale={warp.shapeScale}
          scale={warp.scale}
          rotation={warp.rotation}
          speed={warp.speed}
          colors={colors}
        />
      </div>

      <NoiseDitherOverlay pointerRef={pointerRef} opacity={noiseOpacity} pixelSize={pixelSize} />

      <div className="pointer-events-none relative z-10 flex min-h-screen items-center justify-center px-8">
        {children ?? (
          <div className="max-w-4xl space-y-8 text-center">
            <h1 className="text-balance font-sans text-5xl font-light text-white md:text-7xl">
              Interactive Warp Noise
            </h1>
            <p className="mx-auto max-w-3xl font-sans text-xl font-light leading-relaxed text-white/85 md:text-2xl">
              Hover with your mouse or touch with your finger to push the warp field and wake the dithered noise layer.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function NoiseDitherOverlay({
  pointerRef,
  opacity,
  pixelSize,
}: {
  pointerRef: React.MutableRefObject<PointerState>
  opacity: number
  pixelSize: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    })

    if (!gl) {
      console.error("WebGL2 is not supported in this browser.")
      return
    }

    const program = createProgram(gl, noiseVertexShader, noiseFragmentShader)
    if (!program) return

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const positionLocation = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      pointer: gl.getUniformLocation(program, "u_pointer"),
      active: gl.getUniformLocation(program, "u_active"),
      down: gl.getUniformLocation(program, "u_down"),
      pixelSize: gl.getUniformLocation(program, "u_pixelSize"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      gl.viewport(0, 0, width, height)
      return dpr
    }

    let raf = 0
    const startedAt = performance.now()

    const render = () => {
      const dpr = resize()
      const pointer = pointerRef.current
      const time = (performance.now() - startedAt) * 0.001

      gl.useProgram(program)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      if (uniforms.time) gl.uniform1f(uniforms.time, time)
      if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      if (uniforms.pointer) gl.uniform2f(uniforms.pointer, pointer.x, 1 - pointer.y)
      if (uniforms.active) gl.uniform1f(uniforms.active, pointer.active)
      if (uniforms.down) gl.uniform1f(uniforms.down, pointer.down)
      if (uniforms.pixelSize) gl.uniform1f(uniforms.pixelSize, Math.max(1, pixelSize) * dpr)
      if (uniforms.opacity) gl.uniform1f(uniforms.opacity, opacity)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      raf = requestAnimationFrame(render)
    }

    window.addEventListener("resize", resize)
    render()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      if (positionBuffer) gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
    }
  }, [opacity, pixelSize, pointerRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full mix-blend-screen"
    />
  )
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  return program
}

const noiseVertexShader = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const noiseFragmentShader = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_active;
uniform float u_down;
uniform float u_pixelSize;
uniform float u_opacity;

in vec2 v_uv;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;

  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }

  return sum;
}

const int bayer4[16] = int[16](
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5
);

float bayer4x4(vec2 cell) {
  ivec2 p = ivec2(mod(cell, vec2(4.0)));
  int index = p.y * 4 + p.x;
  return float(bayer4[index]) / 16.0;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  float px = max(1.0, u_pixelSize);

  vec2 frag = gl_FragCoord.xy;
  vec2 cell = floor(frag / px);
  vec2 uv = (cell * px + 0.5 * px) / res;

  vec2 p = uv - 0.5;
  p.x *= res.x / res.y;

  vec2 pointer = u_pointer - 0.5;
  pointer.x *= res.x / res.y;

  float t = u_time * 0.55;
  float cursorGlow = (1.0 - smoothstep(0.0, 0.55, length(p - pointer))) * u_active;

  float n = fbm(p * 3.4 + vec2(0.0, -t * 0.18));
  n += 0.35 * fbm(p * 7.0 + pointer * 1.5 + vec2(t));

  float wave = 0.5 + 0.5 * sin((uv.y + n * 0.22 - t * 0.18) * 18.0);
  float shape = smoothstep(
    0.32,
    0.86,
    n * 0.72 + wave * 0.28 + cursorGlow * (0.45 + 0.35 * u_down)
  );

  float dither = bayer4x4(cell);
  float dots = step(dither, shape);
  float grain = hash21(frag + vec2(u_time * 90.0));
  float vignette = 1.0 - smoothstep(0.15, 0.86, length(v_uv - 0.5));

  vec3 cold = vec3(0.08, 0.28, 0.42);
  vec3 hot = vec3(0.62, 1.0, 0.84);
  vec3 electric = vec3(0.10, 0.52, 1.0);

  vec3 color = mix(cold, hot, dots);
  color = mix(color, electric, cursorGlow * (0.25 + 0.55 * u_active));
  color += (grain - 0.5) * 0.12;

  float alpha = (0.035 + 0.12 * dots + 0.22 * cursorGlow * u_active) * u_opacity * vignette;
  fragColor = vec4(color, alpha);
}
`
