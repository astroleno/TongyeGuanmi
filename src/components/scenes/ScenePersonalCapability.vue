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
  >
    <view class="personal-flow">
      <GlassCard v-for="(item, index) in items" :key="item" class="personal-step">
        <text class="personal-step__index">{{ String(index + 1).padStart(2, '0') }}</text>
        <text class="personal-step__title">{{ item }}</text>
        <text class="personal-step__dot" />
      </GlassCard>
    </view>
    <text class="personal-note">也支持研究表达与申请准备咨询。</text>
    <CtaButton :label="scene.ctaLabel || '查看个人服务'" @tap="$emit('cta', scene)" />
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

const items = ['想法梳理', 'Prompt 与工具', '原型制作', '发布上线']
</script>

<style scoped lang="scss">
.personal-flow {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.personal-step {
  min-height: 174rpx;
  padding: 28rpx;
  display: grid;
  align-content: space-between;
}

.personal-step__index {
  color: rgba(233, 226, 210, .58);
  font-size: 22rpx;
}

.personal-step__title {
  color: var(--c-ivory);
  font-size: 27rpx;
  line-height: 1.42;
}

.personal-step__dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 10rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 16rpx rgba(200, 242, 28, .48);
}

.personal-note {
  color: rgba(233, 226, 210, .6);
  font-size: 24rpx;
  line-height: 1.5;
}
</style>
