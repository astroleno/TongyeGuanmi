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
    title-fx="align"
  >
    <view class="brand-terms">
      <GlassCard v-for="term in terms" :key="term.title" class="brand-term">
        <text class="brand-term__title">{{ term.title }}</text>
        <text class="brand-term__quote">{{ term.quote }}</text>
        <text class="brand-term__desc">{{ term.desc }}</text>
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
  display: grid;
  gap: 22rpx;
}

.brand-term {
  display: grid;
  gap: 18rpx;
  padding: 34rpx;
}

.brand-term__title {
  color: var(--c-ivory);
  font-size: 44rpx;
  line-height: 1.1;
}

.brand-term__quote {
  color: var(--c-warm-gold);
  font-size: 23rpx;
  line-height: 1.52;
}

.brand-term__desc {
  color: rgba(233, 226, 210, .66);
  font-size: 24rpx;
  line-height: 1.62;
}
</style>
