<template>
  <SceneShell
    :id="scene.id"
    :eyebrow="scene.eyebrow"
    :title="scene.title"
    :title-lines="scene.titleLines"
    :title-max-lines="scene.titleMaxLines"
    :subtitle="scene.subtitle"
    :active="active"
    :progress="progress"
    :title-fx="scene.textFx?.mode || 'none'"
    :line-break-policy="scene.textFx?.lineBreakPolicy || 'manual'"
  >
    <view class="brand-terms" :class="{ 'brand-terms--active': active }">
      <GlassCard v-for="(term, index) in terms" :key="term.title">
        <view class="brand-term" :style="{ '--stagger-index': index }">
          <view class="brand-term__head">
            <text class="brand-term__title">{{ term.title }}</text>
            <text class="brand-term__dot" />
          </view>
          <text class="brand-term__quote">{{ term.quote }}</text>
          <text class="brand-term__desc">{{ term.desc }}</text>
        </view>
      </GlassCard>
    </view>
    <CtaButton :label="scene.ctaLabel || '继续了解'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import GlassCard from '@/components/ui/GlassCard.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import type { SceneRegistryItem } from '@/types/scene'

defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
}>()

const terms = [
  {
    title: '同野',
    quote: '取自“同人于野”',
    desc: '在开放真实的场域中共同协作。'
  },
  {
    title: '观幂',
    quote: '看见复杂系统背后的结构与方法',
    desc: '让智能走出少数人的黑箱，进入更多人的现场。'
  }
]
</script>

<style scoped lang="scss">
.brand-terms {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.brand-term {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  min-height: 176rpx;
  padding: 34rpx 36rpx;
  opacity: 0;
  transform: translate3d(0, 28rpx, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 80ms);
}

.brand-terms--active .brand-term {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.brand-term__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.brand-term__title {
  display: block;
  color: var(--c-ivory);
  font-size: 36rpx;
  line-height: 1.22;
  font-weight: 300;
}

.brand-term__dot {
  width: 9rpx;
  height: 9rpx;
  border-radius: 9rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 18rpx rgba(200, 242, 28, .45);
}

.brand-term__quote {
  display: block;
  color: var(--c-warm-gold);
  font-size: 20rpx;
  line-height: 1.62;
}

.brand-term__desc {
  display: block;
  color: rgba(233, 226, 210, .58);
  font-size: var(--text-body);
  line-height: 1.72;
}
</style>
