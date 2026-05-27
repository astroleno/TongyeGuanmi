<template>
  <view
    class="scene-shell"
    :id="id"
    :class="[`scene-shell--${id}`, { 'scene-shell--active': active }]"
  >
    <view class="scene-shell__content">
      <view class="scene-shell__copy">
        <text class="scene-shell__eyebrow scene-shell__reveal scene-shell__reveal--1">{{ eyebrow }}</text>
        <view
          :id="titleAnchorId"
          class="scene-shell__title-wrap scene-shell__reveal scene-shell__reveal--2"
          @tap.stop="triggerTitlePulse"
        >
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
          <view v-else class="scene-shell__title">
            <text
              v-for="(line, index) in fallbackTitleLines"
              :key="`${line}-${index}`"
              class="scene-shell__title-line"
            >
              {{ line }}
            </text>
          </view>
        </view>
        <text v-if="subtitle" class="scene-shell__subtitle scene-shell__reveal scene-shell__reveal--3">{{ subtitle }}</text>
        <view v-if="$slots.body" class="scene-shell__body scene-shell__reveal scene-shell__reveal--4">
          <slot name="body" />
        </view>
      </view>
      <view v-if="$slots.default" class="scene-shell__stage">
        <view class="scene-shell__stage-item scene-shell__reveal scene-shell__reveal--stage">
          <slot />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
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
    titleFx: 'none',
    lineBreakPolicy: 'manual'
  }
)

const componentProxy = getCurrentInstance()?.proxy
const effectiveTitleFx = computed(() => (PRETEXT_MODE === 'none' ? 'none' : props.titleFx))
const fallbackTitleLines = computed(() => (props.titleLines?.length ? props.titleLines : [props.title]))
const titleAnchorId = computed(() => `${props.id}-title`)
const autoPulseScenes = new Set(['hero', 'about', 'method', 'projects'])
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
    if (!active || effectiveTitleFx.value === 'none' || !autoPulseScenes.has(props.id)) return
    if (autoPulseTimer) clearTimeout(autoPulseTimer)
    autoPulseTimer = setTimeout(() => {
      if (props.active && effectiveTitleFx.value !== 'none') {
        setPulse(0.52, 0.50, 780)
      }
    }, 180)
  },
  { immediate: true }
)

async function triggerTitlePulse(event: any) {
  if (!props.active || effectiveTitleFx.value === 'none') return
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  const eventDetail = event.detail || {}

  const point = {
    x: Number(touch?.clientX ?? touch?.pageX ?? eventDetail.x),
    y: Number(touch?.clientY ?? touch?.pageY ?? eventDetail.y)
  }

  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    setPulse(0.52, 0.50, 640)
    return
  }

  const rect = await measureTitleRect()
  if (!rect) {
    setPulse(0.52, 0.50, 640)
    return
  }

  setPulse(
    clamp((point.x - rect.left) / rect.width),
    clamp((point.y - rect.top) / rect.height),
    640
  )
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

function measureTitleRect() {
  return new Promise<null | { left: number; top: number; width: number; height: number }>((resolve) => {
    const query = uni.createSelectorQuery().in(componentProxy as any)
    query
      .select(`#${titleAnchorId.value}`)
      .boundingClientRect((rect) => {
        if (!rect || Array.isArray(rect)) {
          resolve(null)
          return
        }

        const box = rect as { left: number; top: number; width: number; height: number }
        if (!box.width || !box.height) {
          resolve(null)
          return
        }

        resolve(box)
      })
      .exec()
  })
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
  overflow: visible;
}

.scene-shell__content {
  position: relative;
  min-height: 100vh;
  padding: 204rpx var(--content-x) 148rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 56rpx;
}

.scene-shell--projects .scene-shell__content,
.scene-shell--service-packages .scene-shell__content,
.scene-shell--lead .scene-shell__content {
  justify-content: flex-start;
  padding-top: 228rpx;
}

.scene-shell__copy {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  width: 100%;
  max-width: 660rpx;
  min-width: 0;
}

.scene-shell__stage {
  width: 100%;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 38rpx;
}

.scene-shell__reveal {
  opacity: .18;
  transform: translate3d(0, 34rpx, 0);
  transition:
    opacity .82s var(--ease-cinematic),
    transform .82s var(--ease-cinematic);
}

.scene-shell--active .scene-shell__reveal {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.scene-shell--active .scene-shell__reveal--1 { transition-delay: 20ms; }
.scene-shell--active .scene-shell__reveal--2 { transition-delay: 90ms; }
.scene-shell--active .scene-shell__reveal--3 { transition-delay: 150ms; }
.scene-shell--active .scene-shell__reveal--4 { transition-delay: 210ms; }
.scene-shell--active .scene-shell__reveal--stage { transition-delay: 180ms; }

.scene-shell__body,
.scene-shell__stage-item {
  width: 100%;
  min-width: 0;
}

.scene-shell__stage-item {
  display: flex;
  flex-direction: column;
  gap: 38rpx;
}

.scene-shell__eyebrow {
  color: rgba(233, 226, 210, .56);
  font-size: 24rpx;
  line-height: 1.42;
}

.scene-shell__title {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  color: var(--c-ivory);
  font-size: 64rpx;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: 0;
}

.scene-shell__title-line {
  display: block;
  font: inherit;
  line-height: inherit;
  color: inherit;
  min-width: 0;
  max-width: 100%;
}

.scene-shell__subtitle {
  max-width: 640rpx;
  color: rgba(233, 226, 210, .66);
  font-size: 24rpx;
  line-height: 1.72;
}

@media (max-width: 360px) {
  .scene-shell__content {
    padding-left: 36rpx;
    padding-right: 36rpx;
  }

  .scene-shell__title {
    font-size: 58rpx;
  }
}
</style>
