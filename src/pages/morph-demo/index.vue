<template>
  <view class="morph-demo">
    <view class="morph-demo__header">
      <button class="morph-demo__back" @click="goHome">
        <text class="morph-demo__back-mark">‹</text>
        <text class="morph-demo__back-label">返回</text>
      </button>
      <view class="morph-demo__title-group">
        <text class="morph-demo__title">Morph Typography</text>
        <text class="morph-demo__note">Vue progress + CSS transition</text>
      </view>
    </view>

    <view class="morph-demo__stage">
      <MorphTypographyComposition
        :lines="activePreset.lines"
        :active="playing"
        :progress="progress"
        :tone="tone"
        :density="density"
        :motion="playing ? 'drift' : 'still'"
        :caption="activePreset.caption"
        :meta="activePreset.meta"
        :foreground-text="foregroundText"
      />
    </view>

    <view class="morph-demo__controls">
      <view class="morph-demo__control-row">
        <text class="morph-demo__label">Preset</text>
        <view class="morph-demo__segments">
          <button
            v-for="preset in presets"
            :key="preset.id"
            class="morph-demo__segment"
            :class="{ 'morph-demo__segment--active': preset.id === presetId }"
            @click="presetId = preset.id"
          >
            {{ preset.label }}
          </button>
        </view>
      </view>

      <view class="morph-demo__control-row">
        <text class="morph-demo__label">Tone</text>
        <view class="morph-demo__swatches">
          <button
            v-for="item in tones"
            :key="item.value"
            class="morph-demo__swatch"
            :class="{ 'morph-demo__swatch--active': item.value === tone }"
            :style="{ background: item.color }"
            @click="tone = item.value"
          />
        </view>
      </view>

      <view class="morph-demo__control-row">
        <text class="morph-demo__label">Progress</text>
        <slider
          class="morph-demo__slider"
          :value="Math.round(progress * 100)"
          :min="0"
          :max="100"
          :block-size="20"
          activeColor="#c8f21c"
          backgroundColor="rgba(233, 226, 210, .16)"
          block-color="#e9e2d2"
          @changing="handleSlider"
          @change="handleSlider"
        />
      </view>

      <view class="morph-demo__actions">
        <button class="morph-demo__action" :class="{ 'morph-demo__action--active': playing }" @click="togglePlaying">
          {{ playing ? 'Pause' : 'Play' }}
        </button>
        <button class="morph-demo__action" :class="{ 'morph-demo__action--active': density === 'compact' }" @click="toggleDensity">
          {{ density === 'compact' ? 'Compact' : 'Wide' }}
        </button>
        <button class="morph-demo__action" :class="{ 'morph-demo__action--active': foregroundText }" @click="foregroundText = !foregroundText">
          Front Text
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MorphTypographyComposition from '@/components/fx/MorphTypographyComposition.vue'

type MorphTone = 'mint' | 'gold' | 'silver' | 'acid'
type MorphDensity = 'compact' | 'wide'

const presets = [
  {
    id: 'tongye',
    label: '同野',
    lines: ['同野', '观幂', 'AI现场'],
    caption: 'TONGYE FIELD',
    meta: 'MORPH 01'
  },
  {
    id: 'archive',
    label: 'Archive',
    lines: ['DICE', 'ARCHIVE', '2018—2022'],
    caption: 'ARCHIVE MODE',
    meta: 'TYPE 02'
  },
  {
    id: 'method',
    label: 'Method',
    lines: ['共创', '系统', 'FLOW'],
    caption: 'METHOD MAP',
    meta: 'NODE 03'
  }
] as const

const tones: Array<{ value: MorphTone; color: string }> = [
  { value: 'mint', color: 'linear-gradient(135deg, #60efad, #0f6a4f)' },
  { value: 'gold', color: 'linear-gradient(135deg, #f1d687, #7d5b27)' },
  { value: 'silver', color: 'linear-gradient(135deg, #ffffff, #6f7772)' },
  { value: 'acid', color: 'linear-gradient(135deg, #d9ff39, #6e800a)' }
]

const presetId = ref<(typeof presets)[number]['id']>('tongye')
const tone = ref<MorphTone>('mint')
const density = ref<MorphDensity>('compact')
const progress = ref(0.5)
const playing = ref(true)
const foregroundText = ref(true)
const activePreset = computed(() => presets.find((preset) => preset.id === presetId.value) || presets[0])

let frameId = 0
let lastTime = 0

onMounted(() => {
  startLoop()
})

onBeforeUnmount(() => {
  stopLoop()
})

function startLoop() {
  stopLoop()
  if (typeof requestAnimationFrame !== 'function') return
  frameId = requestAnimationFrame(tick)
}

function stopLoop() {
  if (frameId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId)
  }
  frameId = 0
  lastTime = 0
}

function tick(time: number) {
  if (!lastTime) lastTime = time
  const delta = Math.min(48, time - lastTime)
  lastTime = time

  if (playing.value) {
    progress.value = (progress.value + delta / 5200) % 1
  }

  frameId = requestAnimationFrame(tick)
}

function handleSlider(event: any) {
  const value = Number(event.detail?.value || 0)
  progress.value = Math.max(0, Math.min(1, value / 100))
}

function togglePlaying() {
  playing.value = !playing.value
}

function toggleDensity() {
  density.value = density.value === 'compact' ? 'wide' : 'compact'
}

function goHome() {
  uni.redirectTo({ url: '/pages/index/index' })
}
</script>

<style scoped lang="scss">
.morph-demo {
  min-height: 100vh;
  padding: calc(var(--safe-top) + 22rpx) 38rpx 42rpx;
  display: flex;
  flex-direction: column;
  gap: 34rpx;
  background:
    radial-gradient(circle at 78% 18%, rgba(18, 58, 50, .5), transparent 34%),
    radial-gradient(circle at 18% 80%, rgba(199, 177, 122, .16), transparent 28%),
    var(--c-obsidian);
  overflow: hidden;
}

.morph-demo__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.morph-demo__back {
  min-width: 128rpx;
  height: 60rpx;
  padding: 0 18rpx;
  border: 1rpx solid rgba(233, 226, 210, .18);
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  color: rgba(233, 226, 210, .82);
  background: rgba(8, 8, 7, .42);
}

.morph-demo__back-mark {
  font-size: 42rpx;
  line-height: 1;
}

.morph-demo__back-label {
  font-size: 22rpx;
  line-height: 1;
}

.morph-demo__title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.morph-demo__title {
  color: var(--c-ivory);
  font-size: 30rpx;
  line-height: 1.2;
  white-space: nowrap;
}

.morph-demo__note {
  max-width: 360rpx;
  color: rgba(233, 226, 210, .45);
  font-size: 18rpx;
  line-height: 1.2;
  text-align: right;
}

.morph-demo__stage {
  flex: 1;
  min-height: 388rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.morph-demo__stage :deep(.morph-type) {
  box-shadow: inset 0 0 0 1rpx rgba(233, 226, 210, .1), 0 28rpx 110rpx rgba(0, 0, 0, .3);
}

.morph-demo__controls {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(233, 226, 210, .14);
  border-radius: 8rpx;
  background: rgba(8, 8, 7, .62);
  box-shadow: 0 20rpx 80rpx rgba(0, 0, 0, .28);
}

.morph-demo__control-row {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.morph-demo__label {
  color: rgba(233, 226, 210, .56);
  font-size: 19rpx;
  line-height: 1.2;
}

.morph-demo__segments,
.morph-demo__actions {
  display: flex;
  gap: 10rpx;
}

.morph-demo__segment,
.morph-demo__action {
  height: 56rpx;
  padding: 0 20rpx;
  border: 1rpx solid rgba(233, 226, 210, .15);
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(233, 226, 210, .68);
  background: rgba(233, 226, 210, .05);
  font-size: 20rpx;
  line-height: 1;
}

.morph-demo__segment--active,
.morph-demo__action--active {
  color: #14130e;
  border-color: transparent;
  background: var(--c-ivory);
}

.morph-demo__swatches {
  display: flex;
  gap: 14rpx;
}

.morph-demo__swatch {
  width: 50rpx;
  height: 50rpx;
  border: 2rpx solid rgba(233, 226, 210, .15);
  border-radius: 50rpx;
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, .18);
}

.morph-demo__swatch--active {
  border-color: var(--c-ivory);
}

.morph-demo__slider {
  width: 100%;
}

@media (min-width: 760px) {
  .morph-demo {
    padding-left: 72rpx;
    padding-right: 72rpx;
  }

  .morph-demo__controls {
    max-width: 760rpx;
    width: 100%;
    align-self: center;
  }
}
</style>
