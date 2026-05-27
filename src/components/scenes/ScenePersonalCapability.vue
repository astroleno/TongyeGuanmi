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
    <view class="personal-flow" :class="{ 'personal-flow--active': active }">
      <GlassCard v-for="(item, index) in items" :key="item">
        <view class="personal-step" :style="{ '--stagger-index': index }">
          <text class="personal-step__index">{{ String(index + 1).padStart(2, '0') }}</text>
          <text class="personal-step__title">{{ item }}</text>
          <text class="personal-step__dot" />
        </view>
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
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.personal-step {
  width: 100%;
  flex: none;
  min-width: 0;
  min-height: 112rpx;
  padding: 24rpx 28rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 22rpx;
  opacity: 0;
  transform: translate3d(0, 28rpx, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 70ms);
}

.personal-flow--active .personal-step {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.personal-step__index {
  flex: 0 0 auto;
  color: rgba(233, 226, 210, .58);
  font-size: 20rpx;
}

.personal-step__title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--c-ivory);
  font-size: 24rpx;
  line-height: 1.48;
  font-weight: 300;
  max-width: 100%;
}

.personal-step__dot {
  flex: 0 0 auto;
  width: 10rpx;
  height: 10rpx;
  border-radius: 10rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 16rpx rgba(200, 242, 28, .48);
}

.personal-note {
  color: rgba(233, 226, 210, .56);
  font-size: var(--text-body);
  line-height: 1.72;
}
</style>
