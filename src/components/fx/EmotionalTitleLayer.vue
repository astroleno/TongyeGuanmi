<template>
  <view class="emotional-title" :class="[`emotional-title--${mode}`, { 'emotional-title--active': active, 'emotional-title--pulsing': pulseActive }]">
    <view class="emotional-title__ruler emotional-title__ruler--top" :style="rulerStyle(0)" />
    <view v-for="(line, lineIndex) in displayLines" :key="`${sceneId}-${lineIndex}`" class="emotional-title__line">
      <text
        v-for="(char, charIndex) in splitLine(line)"
        :key="`${lineIndex}-${charIndex}-${char}`"
        class="emotional-title__char"
        :style="charStyle(lineIndex, charIndex)"
      >
        {{ char }}
      </text>
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
const motionReady = ref(false)
const pulseActive = computed(() => Boolean(props.pulse?.active))

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
  const scatterBoost = props.mode === 'scatter' ? 1.75 : props.mode === 'emerge' ? 1.15 : .72
  const dx = direction * (10 + (seed % 5) * 5) * scatterBoost
  const dy = ((seed % 3) - 1) * 18 * scatterBoost + 20
  const rotate = direction * (props.mode === 'scatter' ? 4 + (seed % 4) : 1.5)
  const settled = props.mode === 'none' || (props.active && motionReady.value)
  const pulseImpact = localPulseImpact(lineIndex, charIndex)
  const pulseDx = direction * (16 + (seed % 6) * 5) * pulseImpact
  const pulseDy = (((seed + charIndex) % 5) - 2) * 9 * pulseImpact
  const pulseRotate = direction * (3 + (seed % 5)) * pulseImpact
  const opacity = pulseImpact > 0 ? .86 + pulseImpact * .14 : settled ? 1 : .18 + (seed % 4) * .08

  return {
    opacity,
    textShadow: pulseImpact > 0
      ? `0 0 ${18 + pulseImpact * 26}rpx rgba(200, 242, 28, ${0.18 + pulseImpact * 0.28}), 0 0 ${30 + pulseImpact * 18}rpx rgba(233, 226, 210, .18)`
      : props.active
      ? '0 0 18rpx rgba(233, 226, 210, .16)'
      : 'none',
    transform: pulseImpact > 0
      ? `translate3d(${pulseDx}rpx, ${pulseDy}rpx, 0) rotate(${pulseRotate}deg)`
      : settled
      ? 'translate3d(0, 0, 0) rotate(0deg)'
      : `translate3d(${dx}rpx, ${dy}rpx, 0) rotate(${rotate}deg)`,
    transitionDelay: pulseImpact > 0 ? `${Math.min(80, charIndex * 4)}ms` : `${Math.min(360, charIndex * 22 + lineIndex * 70)}ms`
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
  const distance = Math.sqrt(dx * dx * 1.35 + dy * dy * 0.8)
  return Math.pow(Math.max(0, 1 - distance / 0.68), 2)
}

function rulerStyle(index: number) {
  const width = props.active ? 68 + props.progress * 24 : 18
  const opacity = props.mode === 'none' ? 0 : props.active ? .55 : .18
  return {
    width: `${width}%`,
    opacity,
    transform: `translate3d(${index === 0 ? props.progress * 18 : -props.progress * 18}rpx, 0, 0)`
  }
}
</script>

<style scoped lang="scss">
.emotional-title {
  display: grid;
  gap: 8rpx;
  pointer-events: none;
}

.emotional-title__ruler {
  height: 2rpx;
  max-width: 420rpx;
  background: linear-gradient(90deg, var(--c-acid-dot), rgba(199, 177, 122, .5), transparent);
  transition: width .7s var(--ease-cinematic), opacity .7s var(--ease-soft), transform .7s var(--ease-soft);
}

.emotional-title__ruler--bottom {
  justify-self: end;
  background: linear-gradient(270deg, rgba(233, 226, 210, .42), rgba(199, 177, 122, .3), transparent);
}

.emotional-title__line {
  display: flex;
  flex-wrap: wrap;
  row-gap: 4rpx;
}

.emotional-title__char {
  display: inline-block;
  color: var(--c-ivory);
  font-size: 72rpx;
  font-weight: 300;
  line-height: 1.08;
  letter-spacing: 0;
  transition: opacity .72s var(--ease-cinematic), transform .72s var(--ease-cinematic), text-shadow .32s var(--ease-soft);
}

.emotional-title--pulsing .emotional-title__char {
  transition-duration: .30s;
}

@media (max-width: 360px) {
  .emotional-title__char {
    font-size: 64rpx;
  }
}

</style>
