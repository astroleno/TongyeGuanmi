<template>
  <view
    v-if="active && toScene"
    :key="layerKey"
    class="scene-turn"
    :class="[`scene-turn--${tone}`]"
    :style="rootStyle"
    aria-hidden="true"
  >
    <view class="scene-turn__veil" />

    <view v-if="fromScene && fromScene.id !== toScene.id" class="scene-turn__group scene-turn__group--from">
      <text class="scene-turn__eyebrow">{{ fromScene.eyebrow }}</text>
      <view class="scene-turn__title" :style="{ '--turn-lines': String(fromLines.length) }">
        <view v-for="(line, lineIndex) in fromLines" :key="`from-${lineIndex}`" class="scene-turn__line">
          <text
            v-for="(char, charIndex) in splitLine(line)"
            :key="`from-${lineIndex}-${charIndex}`"
            class="scene-turn__char"
            :style="charVars('from', lineIndex, charIndex)"
          >
            {{ char }}
          </text>
        </view>
      </view>
    </view>

    <view class="scene-turn__group scene-turn__group--to">
      <text class="scene-turn__eyebrow">{{ toScene.eyebrow }}</text>
      <view class="scene-turn__title" :style="{ '--turn-lines': String(toLines.length) }">
        <view v-for="(line, lineIndex) in toLines" :key="`to-${lineIndex}`" class="scene-turn__line">
          <text
            v-for="(char, charIndex) in splitLine(line)"
            :key="`to-${lineIndex}-${charIndex}`"
            class="scene-turn__char"
            :style="charVars('to', lineIndex, charIndex)"
          >
            {{ char }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SceneBackdropVideo } from '@/data/backdropVideos'
import type { SceneRegistryItem } from '@/types/scene'

type TransitionTone = SceneBackdropVideo['tone']

interface Props {
  active: boolean
  progress?: number
  tone?: TransitionTone
  fromScene?: SceneRegistryItem | null
  toScene?: SceneRegistryItem | null
}

const props = withDefaults(defineProps<Props>(), {
  progress: 0,
  tone: 'calm',
  fromScene: null,
  toScene: null,
})

const sceneLines = (scene?: SceneRegistryItem | null) =>
  (scene?.titleLines?.length ? scene.titleLines : scene?.title ? [scene.title] : []).slice(0, 3)

const fromLines = computed(() => sceneLines(props.fromScene))
const toLines = computed(() => sceneLines(props.toScene))
const layerKey = computed(() => `${props.fromScene?.id || 'none'}-${props.toScene?.id || 'none'}`)
const rootStyle = computed(() => ({
  '--turn-progress': String(Math.max(0, Math.min(1, props.progress || 0))),
}))

const splitLine = (line: string) => Array.from(line)

const signedSeed = (lineIndex: number, charIndex: number) => {
  const seed = ((lineIndex + 3) * 17 + (charIndex + 5) * 11) % 29
  return seed - 14
}

const charVars = (phase: 'from' | 'to', lineIndex: number, charIndex: number) => {
  const seed = signedSeed(lineIndex, charIndex)
  const distance = props.tone === 'conversion' ? 10 : props.tone === 'pipeline' ? 18 : 28
  const angle = seed * 1.8
  const direction = phase === 'from' ? 1 : -1
  const x = props.tone === 'pipeline' ? direction * (24 + charIndex * 2) : seed * distance * 0.08
  const y = props.tone === 'ring' ? direction * Math.abs(seed) * 2.8 : direction * (lineIndex - 1) * 8
  const delay = phase === 'from' ? charIndex * 4 : 70 + charIndex * 7 + lineIndex * 12

  return {
    '--turn-x': `${x}rpx`,
    '--turn-y': `${y}rpx`,
    '--turn-rot': `${angle}deg`,
    '--turn-delay': `${delay}ms`,
  }
}
</script>

<style scoped>
.scene-turn {
  position: fixed;
  inset: 0;
  z-index: 18;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
  color: #f7f2e8;
}

.scene-turn__veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 44%, rgba(6, 6, 5, 0.2) 0%, rgba(6, 6, 5, 0.56) 62%, rgba(6, 6, 5, 0.72) 100%),
    linear-gradient(180deg, rgba(6, 6, 5, 0.68), rgba(6, 6, 5, 0.34) 46%, rgba(6, 6, 5, 0.78));
  opacity: 0;
  animation: turn-veil 620ms cubic-bezier(0.2, 0.72, 0.18, 1) both;
}

.scene-turn__group {
  position: absolute;
  left: 64rpx;
  right: 64rpx;
  top: 28vh;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  text-align: left;
}

.scene-turn__group--from {
  opacity: 0.72;
}

.scene-turn__group--to {
  opacity: 1;
}

.scene-turn__eyebrow {
  font-size: 20rpx;
  letter-spacing: 0;
  color: rgba(247, 242, 232, 0.62);
  animation: turn-eyebrow-in 620ms cubic-bezier(0.2, 0.72, 0.18, 1) both;
}

.scene-turn__group--from .scene-turn__eyebrow {
  animation-name: turn-eyebrow-out;
}

.scene-turn__title {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.scene-turn__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 68rpx;
}

.scene-turn__char {
  display: inline-flex;
  min-width: 0.55em;
  font-size: 74rpx;
  font-weight: 700;
  line-height: 0.96;
  letter-spacing: 0;
  transform-origin: 50% 52%;
  will-change: opacity, transform, filter;
  text-shadow: 0 18rpx 52rpx rgba(0, 0, 0, 0.46);
}

.scene-turn__group--from .scene-turn__char {
  animation: turn-char-out 620ms cubic-bezier(0.2, 0.72, 0.18, 1) both;
  animation-delay: var(--turn-delay);
}

.scene-turn__group--to .scene-turn__char {
  animation: turn-char-in 620ms cubic-bezier(0.2, 0.72, 0.18, 1) both;
  animation-delay: var(--turn-delay);
}

.scene-turn--calm .scene-turn__char,
.scene-turn--entry .scene-turn__char {
  filter: blur(0);
}

.scene-turn--ring .scene-turn__char {
  text-shadow: 0 0 38rpx rgba(248, 222, 161, 0.22), 0 18rpx 52rpx rgba(0, 0, 0, 0.5);
}

.scene-turn--pipeline .scene-turn__group {
  top: 30vh;
}

.scene-turn--pipeline .scene-turn__line {
  border-left: 1px solid rgba(247, 242, 232, 0.18);
  padding-left: 18rpx;
}

.scene-turn--conversion .scene-turn__veil {
  animation-duration: 420ms;
}

.scene-turn--conversion .scene-turn__char,
.scene-turn--conversion .scene-turn__eyebrow {
  animation-duration: 420ms;
}

@keyframes turn-veil {
  0% {
    opacity: 0;
  }
  42% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes turn-eyebrow-in {
  0% {
    opacity: 0;
    transform: translate3d(0, 18rpx, 0);
  }
  52% {
    opacity: 0;
    transform: translate3d(0, 12rpx, 0);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes turn-eyebrow-out {
  0% {
    opacity: 0.72;
    transform: translate3d(0, 0, 0);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, -18rpx, 0);
  }
}

@keyframes turn-char-in {
  0% {
    opacity: 0;
    filter: blur(10rpx);
    transform: translate3d(var(--turn-x), var(--turn-y), 0) rotate(var(--turn-rot));
  }
  55% {
    opacity: 0;
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
}

@keyframes turn-char-out {
  0% {
    opacity: 0.76;
    filter: blur(0);
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  100% {
    opacity: 0;
    filter: blur(10rpx);
    transform: translate3d(var(--turn-x), var(--turn-y), 0) rotate(var(--turn-rot));
  }
}
</style>
