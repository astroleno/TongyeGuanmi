<template>
  <view
    class="scene-shell"
    :id="id"
    :class="[`scene-shell--${id}`, { 'scene-shell--active': active }]"
    @touchstart="triggerPulse"
  >
    <view class="scene-shell__content">
      <view class="scene-shell__copy">
        <text class="scene-shell__eyebrow">{{ eyebrow }}</text>
        <EmotionalTitleLayer
          v-if="effectiveTitleFx !== 'none'"
          :text="title"
          :lines="titleLines"
          :max-lines="titleMaxLines || 2"
          :line-break-policy="lineBreakPolicy"
          :scene-id="id"
          :active="active"
          :progress="progress"
          :mode="effectiveTitleFx"
          :pulse="pulse"
        />
        <text v-else class="scene-shell__title">{{ title }}</text>
        <text v-if="subtitle" class="scene-shell__subtitle">{{ subtitle }}</text>
        <slot name="body" />
      </view>
      <view v-if="$slots.default" class="scene-shell__stage">
        <slot />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import EmotionalTitleLayer from '@/components/fx/EmotionalTitleLayer.vue'
import { PRETEXT_MODE } from '@/config/runtime'
import type { EmotionalPulse, EmotionalTextMode, LineBreakPolicy } from '@/types/scene'

const props = withDefaults(
  defineProps<{
    id: string
    eyebrow: string
    title: string
    titleLines?: string[]
    titleMaxLines?: number
    subtitle?: string
    active: boolean
    progress: number
    titleFx?: EmotionalTextMode
    lineBreakPolicy?: LineBreakPolicy
  }>(),
  {
    titleFx: 'settle',
    lineBreakPolicy: 'manual'
  }
)

const effectiveTitleFx = computed(() => (PRETEXT_MODE === 'none' ? 'none' : props.titleFx))
const pulse = ref<EmotionalPulse | null>(null)
let pulseTimer: ReturnType<typeof setTimeout> | null = null
let autoPulseTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (pulseTimer) clearTimeout(pulseTimer)
  if (autoPulseTimer) clearTimeout(autoPulseTimer)
})

watch(
  () => props.active,
  (active) => {
    if (!active || effectiveTitleFx.value === 'none') return
    if (autoPulseTimer) clearTimeout(autoPulseTimer)
    autoPulseTimer = setTimeout(() => {
      if (props.active && effectiveTitleFx.value !== 'none') {
        setPulse(0.52, 0.36, 340)
      }
    }, 180)
  },
  { immediate: true }
)

function triggerPulse(event: any) {
  if (!props.active || effectiveTitleFx.value === 'none') return
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  if (!touch) return

  const info = getWindowMetrics()
  setPulse(clamp((touch.clientX || 0) / info.windowWidth), clamp((touch.clientY || 0) / info.windowHeight), 340)
}

function setPulse(x: number, y: number, duration: number) {
  const id = Date.now()
  pulse.value = {
    id,
    x,
    y,
    active: true
  }

  if (pulseTimer) clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => {
    if (pulse.value?.id === id) {
      pulse.value = { ...pulse.value, active: false }
    }
  }, duration)
}

function getWindowMetrics() {
  const uniAny = uni as any
  if (typeof uniAny.getWindowInfo === 'function') {
    const info = uniAny.getWindowInfo()
    return {
      windowWidth: info.windowWidth || 375,
      windowHeight: info.windowHeight || 812
    }
  }

  if (typeof window !== 'undefined') {
    return {
      windowWidth: window.innerWidth || 375,
      windowHeight: window.innerHeight || 812
    }
  }

  return {
    windowWidth: 375,
    windowHeight: 812
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}
</script>

<style scoped lang="scss">
.scene-shell {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  overflow: hidden;
}

.scene-shell__content {
  position: relative;
  min-height: 100vh;
  padding: 204rpx var(--content-x) 126rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 52rpx;
}

.scene-shell--projects .scene-shell__content,
.scene-shell--service-packages .scene-shell__content,
.scene-shell--lead .scene-shell__content {
  justify-content: flex-start;
  padding-top: 176rpx;
}

.scene-shell__copy {
  display: grid;
  gap: 28rpx;
  width: 100%;
  min-width: 0;
}

.scene-shell__stage {
  width: 100%;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 48rpx;
}

.scene-shell__eyebrow {
  color: rgba(233, 226, 210, .6);
  font-size: 24rpx;
  line-height: 1.35;
}

.scene-shell__title {
  color: var(--c-ivory);
  font-size: 72rpx;
  font-weight: 300;
  line-height: 1.08;
  letter-spacing: 0;
}

.scene-shell__subtitle {
  max-width: 640rpx;
  color: rgba(233, 226, 210, .72);
  font-size: 29rpx;
  line-height: 1.62;
}

@media (max-width: 360px) {
  .scene-shell__content {
    padding-left: 36rpx;
    padding-right: 36rpx;
  }

  .scene-shell__title {
    font-size: 64rpx;
  }
}
</style>
