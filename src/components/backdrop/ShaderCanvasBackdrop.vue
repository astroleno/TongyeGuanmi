<template>
  <view class="shader-backdrop" :style="viewportStyle">
    <!-- #ifdef H5 -->
    <canvas id="tongyeShader" type="webgl" class="shader-backdrop__canvas" :style="viewportStyle" />
    <!-- #endif -->
    <text v-if="shaderStatus" class="shader-backdrop__status">{{ shaderStatus }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SHADER_SCENE_MAP } from '@/config/runtime'
import type { SceneBackdropProps } from '@/types/scene'

const props = defineProps<SceneBackdropProps>()

let shader: null | {
  setScroll: (progress: number) => void
  renderNow?: () => void
  resize: (width: number, height: number, pixelRatio?: number) => void
  dispose?: () => void
} = null
const shaderReady = ref(false)
const shaderStatus = ref('')
const viewportMetrics = ref(getWindowMetrics())
const viewportStyle = computed(() => ({
  width: `${viewportMetrics.value.windowWidth}px`,
  height: `${viewportMetrics.value.windowHeight}px`
}))

let teardownResize: null | (() => void) = null
const SHADER_DEBUG = false

const shaderProgress = computed(() => {
  const scene = SHADER_SCENE_MAP[props.sceneId] ?? 0
  return Math.max(0, Math.min(.9999, (scene + props.progress) / 9))
})

onMounted(() => {
  refreshViewport()
  teardownResize = listenForResize(refreshViewport)
  // #ifdef H5
  void setupH5TongyeShader()
  // #endif
})

onBeforeUnmount(() => {
  teardownResize?.()
  shader?.dispose?.()
})

watch(
  () => shaderProgress.value,
  (value) => {
    shader?.setScroll(value)
  }
)

async function setupH5TongyeShader() {
  try {
    const mod = await import('@/shaders/TongyeQuietIntelligenceShader')
    const canvas = resolveH5Canvas()
    if (!canvas) return
    shader = mod.createTongyeQuietIntelligenceShader(canvas, { intensity: 0.96 })
    const info = refreshViewport()
    shader.resize(info.windowWidth, info.windowHeight, Math.min(info.pixelRatio || 1, 2))
    shader.setScroll(shaderProgress.value)
    shaderReady.value = true
    shaderStatus.value = ''
  } catch (error) {
    shader = null
    failShader('h5-init-failed', error)
  }
}

function resolveH5Canvas() {
  const host = document.querySelector('#tongyeShader') as HTMLElement | HTMLCanvasElement | null
  if (!host) return null
  if (host instanceof HTMLCanvasElement) return host
  return host.querySelector('canvas') as HTMLCanvasElement | null
}

function refreshViewport() {
  const info = getWindowMetrics()
  viewportMetrics.value = info
  shader?.resize(info.windowWidth, info.windowHeight, shaderPixelRatio(info))
  return info
}

function shaderPixelRatio(info: ReturnType<typeof getWindowMetrics>) {
  return Math.min(info.pixelRatio || 1, 2)
}

function failShader(status: string, error?: unknown) {
  shaderReady.value = false
  shaderStatus.value = status
  warnShader(status, error)
}

function markShader(status: string, error?: unknown) {
  if (!SHADER_DEBUG) return
  shaderStatus.value = status
  warnShader(status, error)
}

function warnShader(status: string, error?: unknown) {
  console.warn(`[Tongye shader] ${status}`, error || '')
}

function listenForResize(callback: () => void) {
  const uniAny = uni as any
  if (typeof uniAny.onWindowResize === 'function') {
    uniAny.onWindowResize(callback)
    return () => {
      if (typeof uniAny.offWindowResize === 'function') {
        uniAny.offWindowResize(callback)
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', callback)
    return () => window.removeEventListener('resize', callback)
  }

  return null
}

function getWindowMetrics() {
  const uniAny = uni as any
  if (typeof uniAny.getWindowInfo === 'function') {
    const info = uniAny.getWindowInfo()
    return {
      windowWidth: info.windowWidth || 375,
      windowHeight: info.windowHeight || 812,
      pixelRatio: info.pixelRatio || 1
    }
  }

  if (typeof window !== 'undefined') {
    return {
      windowWidth: window.innerWidth || 375,
      windowHeight: window.innerHeight || 812,
      pixelRatio: window.devicePixelRatio || 1
    }
  }

  return {
    windowWidth: 375,
    windowHeight: 812,
    pixelRatio: 1
  }
}
</script>

<style scoped lang="scss">
.shader-backdrop,
.shader-backdrop__canvas {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.shader-backdrop {
  background: #080807;
}

.shader-backdrop__canvas {
  z-index: 0;
  opacity: .9;
  background: #080807;
}

.shader-backdrop__status {
  position: absolute;
  left: 24rpx;
  bottom: 24rpx;
  z-index: 3;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: rgba(233, 226, 210, .72);
  background: rgba(0, 0, 0, .42);
  font-size: 18rpx;
  line-height: 1.2;
}

</style>
