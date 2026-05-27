<template>
  <view
    class="emotional-title"
    :class="[`emotional-title--${mode}`, { 'emotional-title--active': active, 'emotional-title--pulsing': pulseActive }]"
    :aria-label="readableTitle"
  >
    <view class="emotional-title__ruler emotional-title__ruler--top" :style="rulerStyle(0)" />
    <view class="emotional-title__body">
      <view class="emotional-title__readable">
        <text
          v-for="(line, lineIndex) in displayLines"
          :key="`${sceneId}-readable-${lineIndex}`"
          class="emotional-title__readable-line"
        >
          {{ line }}
        </text>
      </view>
      <view v-if="fxVisible" class="emotional-title__fx" aria-hidden="true">
        <view v-for="(line, lineIndex) in displayLines" :key="`${sceneId}-fx-${lineIndex}`" class="emotional-title__line">
          <text
            v-for="(char, charIndex) in splitLine(line)"
            :key="`${lineIndex}-${charIndex}-${char}`"
            class="emotional-title__char"
            :style="charStyle(lineIndex, charIndex)"
          >
            {{ char }}
          </text>
        </view>
      </view>
    </view>
    <view class="emotional-title__ruler emotional-title__ruler--bottom" :style="rulerStyle(1)" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { EmotionalPulse, EmotionalTextMode, LineBreakPolicy } from '@/types/scene'

const props = withDefaults(
  defineProps<{
    text: string
    lines?: string[]
    maxLines: number
    lineBreakPolicy: LineBreakPolicy
    sceneId: string
    active: boolean
    progress: number
    mode: EmotionalTextMode
    pulse?: EmotionalPulse | null
  }>(),
  {
    lineBreakPolicy: 'manual'
  }
)

const displayLines = computed(() => {
  const lines = props.lines?.length ? props.lines : [props.text]
  return lines.slice(0, props.maxLines)
})
const readableTitle = computed(() => displayLines.value.join(' '))
const motionReady = ref(false)
const pulseActive = computed(() => Boolean(props.pulse?.active))
const fxVisible = computed(() => props.active && props.mode !== 'none' && pulseActive.value)

onMounted(() => {
  setTimeout(() => {
    motionReady.value = true
  }, 90)
})

watch(
  () => props.active,
  (active) => {
    if (!active && props.mode !== 'none') {
      motionReady.value = false
      return
    }

    if (active) {
      setTimeout(() => {
        motionReady.value = true
      }, 70)
    }
  }
)

function splitLine(line: string) {
  return Array.from(line)
}

function charStyle(lineIndex: number, charIndex: number) {
  const seed = (charIndex * 37 + lineIndex * 19 + props.sceneId.length * 11) % 29
  const direction = seed % 2 === 0 ? 1 : -1
  const pulseImpact = localPulseImpact(lineIndex, charIndex)
  const pulseDx = direction * (12 + (seed % 4) * 3) * pulseImpact
  const pulseDy = (((seed + charIndex) % 5) - 2) * 5.5 * pulseImpact
  const pulseRotate = direction * (1.2 + (seed % 3) * 1.2) * pulseImpact
  const opacity = pulseImpact > 0 ? .16 + pulseImpact * .58 : 0

  return {
    opacity,
    textShadow: pulseImpact > 0
      ? `0 0 ${10 + pulseImpact * 16}rpx rgba(199, 177, 122, ${0.18 + pulseImpact * 0.20}), 0 0 ${20 + pulseImpact * 10}rpx rgba(233, 226, 210, .12)`
      : 'none',
    transform: pulseImpact > 0
      ? `translate3d(${pulseDx}rpx, ${pulseDy}rpx, 0) rotate(${pulseRotate}deg) scale(${1 + pulseImpact * .026})`
      : 'translate3d(0, 0, 0) rotate(0deg)',
    transitionDelay: pulseImpact > 0 ? `${Math.min(28, charIndex * 2)}ms` : '0ms'
  }
}

function localPulseImpact(lineIndex: number, charIndex: number) {
  if (!props.pulse?.active) return 0
  const line = displayLines.value[lineIndex] || ''
  const lineLength = Math.max(1, splitLine(line).length)
  const lineCount = Math.max(1, displayLines.value.length)
  const charX = (charIndex + 0.5) / lineLength
  const charY = (lineIndex + 0.5) / lineCount
  const dx = charX - props.pulse.x
  const dy = charY - props.pulse.y
  const distance = Math.sqrt(dx * dx * 2.4 + dy * dy * 1.35)
  return Math.pow(Math.max(0, 1 - distance / 0.68), 2)
}

function rulerStyle(index: number) {
  const width = props.active ? 46 + props.progress * 18 : 16
  const opacity = pulseActive.value && props.mode !== 'none' ? .34 : fxVisible.value ? .08 : 0
  return {
    width: `${width}%`,
    opacity,
    transform: `translate3d(${index === 0 ? props.progress * 10 : -props.progress * 10}rpx, 0, 0)`
  }
}
</script>

<style scoped lang="scss">
.emotional-title {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  pointer-events: none;
}

.emotional-title__body {
  position: relative;
}

.emotional-title__readable {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.emotional-title__readable-line {
  display: block;
  color: var(--c-ivory);
  font-size: 64rpx;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: 0;
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
}

.emotional-title__fx {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  pointer-events: none;
}

.emotional-title__ruler {
  height: 2rpx;
  max-width: 420rpx;
  background: linear-gradient(90deg, rgba(199, 177, 122, .72), rgba(233, 226, 210, .34), transparent);
  transition: width .7s var(--ease-cinematic), opacity .7s var(--ease-soft), transform .7s var(--ease-soft);
}

.emotional-title__ruler--bottom {
  justify-self: end;
  background: linear-gradient(270deg, rgba(233, 226, 210, .42), rgba(199, 177, 122, .3), transparent);
}

.emotional-title__line {
  display: flex;
  flex-wrap: nowrap;
  min-height: 73.6rpx;
  row-gap: 4rpx;
}

.emotional-title__char {
  display: inline-block;
  color: var(--c-ivory);
  font-size: 64rpx;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: 0;
  transition: opacity .52s var(--ease-cinematic), transform .52s var(--ease-cinematic), text-shadow .32s var(--ease-soft);
  will-change: transform, opacity;
}

.emotional-title--pulsing .emotional-title__char {
  transition-duration: .28s;
}

@media (max-width: 360px) {
  .emotional-title__readable-line,
  .emotional-title__char {
    font-size: 58rpx;
  }

  .emotional-title__line {
    min-height: 66.7rpx;
  }
}

</style>
