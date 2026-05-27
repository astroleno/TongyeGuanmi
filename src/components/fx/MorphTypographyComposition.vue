<template>
  <view
    class="morph-type"
    :class="[
      `morph-type--${tone}`,
      `morph-type--${density}`,
      {
        'morph-type--active': active,
        'morph-type--still': motion === 'still',
        'morph-type--foreground-text': foregroundText
      }
    ]"
    :style="rootStyle"
    aria-hidden="true"
  >
    <view
      class="morph-type__text morph-type__text--base"
      :class="{ 'morph-type__text--base-top': !foregroundText }"
    >
      <text
        v-for="(line, index) in normalizedLines"
        :key="`base-${index}-${line}`"
        class="morph-type__line"
        :style="lineStyle(index, 'base')"
      >
        {{ line }}
      </text>
    </view>

    <view class="morph-type__shape" :style="shapeStyle">
      <view class="morph-type__blob morph-type__blob--shadow" :style="blobStyle(0)" />
      <view class="morph-type__blob morph-type__blob--core" :style="blobStyle(1)" />
      <view class="morph-type__blob morph-type__blob--skin" :style="blobStyle(2)" />
      <view class="morph-type__ridge morph-type__ridge--one" />
      <view class="morph-type__ridge morph-type__ridge--two" />
    </view>

    <view v-if="foregroundText" class="morph-type__text morph-type__text--front">
      <text
        v-for="(line, index) in normalizedLines"
        :key="`front-${index}-${line}`"
        class="morph-type__line"
        :style="lineStyle(index, 'front')"
      >
        {{ line }}
      </text>
    </view>

    <view v-if="caption || meta" class="morph-type__caption">
      <text v-if="caption" class="morph-type__caption-main">{{ caption }}</text>
      <text v-if="meta" class="morph-type__caption-meta">{{ meta }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type MorphTone = 'mint' | 'gold' | 'silver' | 'acid'
type MorphDensity = 'compact' | 'wide'
type MorphMotion = 'still' | 'drift'
type TextLayer = 'base' | 'front'

const props = withDefaults(
  defineProps<{
    lines: readonly string[]
    active?: boolean
    progress?: number
    tone?: MorphTone
    density?: MorphDensity
    motion?: MorphMotion
    caption?: string
    meta?: string
    foregroundText?: boolean
  }>(),
  {
    active: true,
    progress: 0,
    tone: 'mint',
    density: 'wide',
    motion: 'drift',
    caption: '',
    meta: '',
    foregroundText: true
  }
)

const tonePalettes: Record<MorphTone, { type: string; glow: string; deep: string; light: string; accent: string }> = {
  mint: {
    type: 'rgba(80, 229, 163, .9)',
    glow: 'rgba(44, 218, 143, .28)',
    deep: '#0f6a4f',
    light: '#60efad',
    accent: '#bff8d7'
  },
  gold: {
    type: 'rgba(231, 197, 112, .88)',
    glow: 'rgba(199, 177, 122, .24)',
    deep: '#7d5b27',
    light: '#f1d687',
    accent: '#fff0b8'
  },
  silver: {
    type: 'rgba(218, 220, 214, .86)',
    glow: 'rgba(184, 185, 179, .24)',
    deep: '#6f7772',
    light: '#e6e7df',
    accent: '#ffffff'
  },
  acid: {
    type: 'rgba(200, 242, 28, .86)',
    glow: 'rgba(200, 242, 28, .2)',
    deep: '#6e800a',
    light: '#d9ff39',
    accent: '#f3ffd1'
  }
}

const normalizedProgress = computed(() => clamp(props.progress))
const normalizedLines = computed(() => props.lines.filter(Boolean).slice(0, 4))
const palette = computed(() => tonePalettes[props.tone])

const rootStyle = computed(() => ({
  '--morph-type': palette.value.type,
  '--morph-glow': palette.value.glow,
  '--morph-deep': palette.value.deep,
  '--morph-light': palette.value.light,
  '--morph-accent': palette.value.accent
}))

const shapeStyle = computed(() => {
  const progress = normalizedProgress.value
  const driftX = (progress - 0.5) * 42
  const driftY = Math.sin(progress * Math.PI * 2) * 16
  const rotate = -8 + progress * 16

  return {
    transform: `translate3d(${driftX}rpx, ${driftY}rpx, 0) rotate(${rotate}deg)`
  }
})

function lineStyle(index: number, layer: TextLayer) {
  const progress = normalizedProgress.value
  const direction = index % 2 === 0 ? 1 : -1
  const y = index * (props.density === 'compact' ? 86 : 106)
  const x = (index % 2) * 28 - progress * 20 * direction
  const scale = layer === 'front' ? 1.003 : 1
  const opacity = layer === 'front' ? 0.16 : 0.92

  return {
    transform: `translate3d(${x}rpx, ${y}rpx, 0) scale(${scale})`,
    opacity
  }
}

function blobStyle(index: number) {
  const progress = normalizedProgress.value
  const phase = progress * Math.PI * 2 + index * 0.72
  const x = Math.cos(phase) * (index === 1 ? 20 : 13)
  const y = Math.sin(phase) * (index === 1 ? 24 : 18)
  const rotate = Math.sin(phase) * 18 + index * 20
  const scale = 1 + Math.cos(phase) * 0.035

  return {
    transform: `translate3d(${x}rpx, ${y}rpx, 0) rotate(${rotate}deg) scale(${scale})`
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value || 0))
}
</script>

<style scoped lang="scss">
.morph-type {
  position: relative;
  width: 100%;
  max-width: 640rpx;
  height: 430rpx;
  overflow: hidden;
  border-radius: 8rpx;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 18%, var(--morph-glow), transparent 34%),
    linear-gradient(150deg, rgba(233, 226, 210, .06), rgba(18, 20, 18, .18) 54%, rgba(8, 8, 7, .22));
  box-shadow: inset 0 0 0 1rpx rgba(233, 226, 210, .08);
}

.morph-type__text {
  position: absolute;
  top: 34rpx;
  right: 0;
  bottom: 0;
  left: 34rpx;
  z-index: 1;
}

.morph-type__text--front {
  z-index: 4;
  color: var(--morph-accent);
  mix-blend-mode: screen;
}

.morph-type__line {
  position: absolute;
  left: 0;
  display: block;
  color: var(--morph-type);
  font-size: 112rpx;
  font-weight: 300;
  line-height: .9;
  letter-spacing: 0;
  white-space: nowrap;
  transition: transform .64s var(--ease-cinematic), opacity .42s var(--ease-soft);
  will-change: transform;
}

.morph-type__text--front .morph-type__line {
  color: var(--morph-accent);
  text-shadow: 0 0 18rpx rgba(255, 255, 255, .14);
}

.morph-type__shape {
  position: absolute;
  top: 86rpx;
  left: 176rpx;
  z-index: 3;
  width: 260rpx;
  height: 238rpx;
  transition: transform .72s var(--ease-cinematic);
  will-change: transform;
}

.morph-type__blob,
.morph-type__ridge {
  position: absolute;
  will-change: transform;
}

.morph-type__blob {
  border-radius: 58% 42% 54% 46% / 44% 58% 42% 56%;
  transition: transform .72s var(--ease-cinematic);
}

.morph-type__blob--shadow {
  top: 18rpx;
  left: 42rpx;
  width: 198rpx;
  height: 190rpx;
  opacity: .54;
  background: radial-gradient(circle at 32% 22%, rgba(255, 255, 255, .28), transparent 18%), linear-gradient(145deg, rgba(0, 0, 0, .18), var(--morph-deep));
  box-shadow: 0 28rpx 76rpx rgba(0, 0, 0, .3);
}

.morph-type__blob--core {
  top: 28rpx;
  left: 24rpx;
  width: 224rpx;
  height: 178rpx;
  opacity: .94;
  background:
    radial-gradient(circle at 35% 24%, rgba(255, 255, 255, .42), transparent 17%),
    radial-gradient(circle at 78% 74%, rgba(0, 0, 0, .18), transparent 28%),
    linear-gradient(135deg, var(--morph-light), var(--morph-deep));
}

.morph-type__blob--skin {
  top: 0;
  left: 72rpx;
  width: 134rpx;
  height: 238rpx;
  opacity: .72;
  background: linear-gradient(168deg, rgba(255, 255, 255, .36), var(--morph-light) 32%, var(--morph-deep) 100%);
  box-shadow: inset -18rpx -20rpx 34rpx rgba(0, 0, 0, .14), inset 12rpx 12rpx 24rpx rgba(255, 255, 255, .16);
}

.morph-type__ridge {
  z-index: 4;
  height: 2rpx;
  opacity: .2;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .84), transparent);
  transform-origin: center;
}

.morph-type__ridge--one {
  top: 72rpx;
  left: 74rpx;
  width: 132rpx;
  transform: rotate(-23deg);
}

.morph-type__ridge--two {
  top: 152rpx;
  left: 44rpx;
  width: 154rpx;
  transform: rotate(18deg);
}

.morph-type__caption {
  position: absolute;
  top: 22rpx;
  right: 24rpx;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12rpx;
  max-width: 340rpx;
  color: rgba(233, 226, 210, .62);
  font-size: 18rpx;
  line-height: 1.2;
  white-space: nowrap;
}

.morph-type__caption-main,
.morph-type__caption-meta {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.morph-type__caption-meta {
  opacity: .56;
}

.morph-type--compact {
  height: 360rpx;
}

.morph-type--compact .morph-type__line {
  font-size: 92rpx;
}

.morph-type--compact .morph-type__shape {
  top: 72rpx;
  left: 168rpx;
  transform-origin: center;
}

.morph-type--still .morph-type__shape,
.morph-type--still .morph-type__blob,
.morph-type--still .morph-type__line {
  transition: none;
}

.morph-type__text--base-top {
  z-index: 4;
}

@media (max-width: 360px) {
  .morph-type {
    height: 370rpx;
  }

  .morph-type__text {
    top: 40rpx;
    left: 26rpx;
  }

  .morph-type__line {
    font-size: 92rpx;
  }

  .morph-type__shape {
    top: 76rpx;
    left: 132rpx;
    transform: scale(.88);
  }
}
</style>
