<template>
  <view class="shader-runtime-backdrop">
    <!-- #ifdef MP-WEIXIN -->
    <canvas
      id="tongyeRuntimeShader"
      type="webgl"
      class="shader-runtime-backdrop__canvas"
    />
    <text v-if="shaderStatus" class="shader-runtime-backdrop__status">{{ shaderStatus }}</text>
    <!-- #endif -->
    <view class="shader-runtime-backdrop__shade" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SHADER_SCENE_MAP } from '@/config/runtime'
import type { SceneBackdropProps } from '@/types/scene'

const props = defineProps<SceneBackdropProps>()
const componentProxy = getCurrentInstance()?.proxy

type ShaderInstance = {
  setScroll: (progress: number) => void
  renderNow?: () => void
  resize: (width: number, height: number, pixelRatio?: number) => void
  dispose?: () => void
}

const CANVAS_ID = 'tongyeRuntimeShader'
const shaderStatus = ref('shader boot')
const renderSize = ref({ width: 360, height: 720, pixelRatio: 1 })
let shader: ShaderInstance | null = null
let canvasNode: any = null
let initializing = false
let disposed = false
let teardownResize: null | (() => void) = null

const shaderProgress = computed(() => {
  const scene = SHADER_SCENE_MAP[props.sceneId] ?? 0
  return Math.max(0, Math.min(.9999, (scene + props.progress) / 9))
})

onMounted(() => {
  // #ifdef MP-WEIXIN
  void setupMpRuntimeShader()
  // #endif
})

onBeforeUnmount(() => {
  disposed = true
  teardownResize?.()
  teardownResize = null
  shader?.dispose?.()
  shader = null
  canvasNode = null
})

watch(
  () => shaderProgress.value,
  (value) => {
    shader?.setScroll(value)
  }
)

async function setupMpRuntimeShader() {
  if (initializing) return
  initializing = true

  try {
    shaderStatus.value = 'shader init'
    renderSize.value = getRenderSize()
    canvasNode = await resolveCanvasNode()
    if (!canvasNode) throw new Error('runtime canvas unavailable')

    const mod = await import('@/shaders/TongyeQuietIntelligenceShader')
    shader = mod.createTongyeQuietIntelligenceShader(canvasNode, {
      autoRender: true,
      intensity: 1.18,
      maxFps: 30,
      timeScale: 1.08,
      scrollLerp: .30
    })
    resizeShader()
    shader.setScroll(shaderProgress.value)
    teardownResize = listenForResize(resizeShader)
    shaderStatus.value = ''
  } catch {
    shaderStatus.value = 'shader failed'
  } finally {
    initializing = false
  }
}

function resizeShader() {
  if (disposed || !shader) return
  renderSize.value = getRenderSize()
  shader.resize(renderSize.value.width, renderSize.value.height, renderSize.value.pixelRatio)
  shader.renderNow?.()
}

function resolveCanvasNode() {
  return new Promise<any>((resolve) => {
    const query = uni.createSelectorQuery().in(componentProxy as any)
    ;(query.select(`#${CANVAS_ID}`) as any)
      .node((result: { node?: unknown }) => {
        resolve(result?.node || null)
      })
      .exec()
  })
}

function listenForResize(callback: () => void) {
  const uniAny = uni as any
  if (typeof uniAny.onWindowResize !== 'function') return null
  uniAny.onWindowResize(callback)

  return () => {
    if (typeof uniAny.offWindowResize === 'function') {
      uniAny.offWindowResize(callback)
    }
  }
}

function getRenderSize() {
  const uniAny = uni as any
  const info = typeof uniAny.getWindowInfo === 'function'
    ? uniAny.getWindowInfo()
    : uniAny.getSystemInfoSync?.() || {}
  const windowWidth = info.windowWidth || 375
  const windowHeight = info.windowHeight || 812
  const pixelRatio = Math.min(1.6, Math.max(1, info.pixelRatio || 1))
  const width = Math.min(430, Math.max(300, Math.round(windowWidth)))
  const height = Math.min(900, Math.max(560, Math.round(width * windowHeight / windowWidth)))

  return {
    width,
    height,
    pixelRatio
  }
}
</script>

<style scoped lang="scss">
.shader-runtime-backdrop,
.shader-runtime-backdrop__canvas,
.shader-runtime-backdrop__shade {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.shader-runtime-backdrop {
  overflow: hidden;
  background: #080807;
}

.shader-runtime-backdrop__canvas {
  width: 100%;
  height: 100%;
  z-index: 0;
  opacity: .96;
  pointer-events: none;
  background: #080807;
}

.shader-runtime-backdrop__shade {
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(8, 8, 7, .12), transparent 46%, rgba(8, 8, 7, .05)),
    radial-gradient(circle at 42% 34%, transparent, rgba(8, 8, 7, .04) 64%, rgba(8, 8, 7, .18)),
    linear-gradient(180deg, rgba(8, 8, 7, 0), rgba(8, 8, 7, .08));
  animation: shader-shade-breathe 7.8s ease-in-out infinite alternate;
}

.shader-runtime-backdrop__status {
  position: absolute;
  left: 18rpx;
  bottom: 18rpx;
  z-index: 2;
  color: rgba(233, 226, 210, .42);
  font-size: 18rpx;
  line-height: 1;
}

@keyframes shader-shade-breathe {
  0% {
    opacity: .86;
  }

  100% {
    opacity: .96;
  }
}
</style>
