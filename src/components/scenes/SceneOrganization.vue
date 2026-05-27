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
    <view class="org-grid" :class="{ 'org-grid--active': active }">
      <GlassCard v-for="(item, index) in items" :key="item.title">
        <view class="org-card" :style="{ '--stagger-index': index }">
          <IconBadge :name="item.icon" class="org-card__icon" />
          <view class="org-card__copy">
            <text class="org-card__index">{{ item.index }}</text>
            <text class="org-card__title">{{ item.title }}</text>
          </view>
          <text class="org-card__dot" />
        </view>
      </GlassCard>
    </view>
    <CtaButton :label="scene.ctaLabel || '预约咨询'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import GlassCard from '@/components/ui/GlassCard.vue'
import IconBadge from '@/components/ui/IconBadge.vue'
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

const items = [
  { index: '01', title: '管理层共识', icon: 'person' },
  { index: '02', title: '业务流程梳理', icon: 'org' },
  { index: '03', title: '工具实施', icon: 'infinity' },
  { index: '04', title: '陪跑机制', icon: 'video' }
] as const
</script>

<style scoped lang="scss">
.org-grid {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.org-card {
  width: 100%;
  flex: none;
  min-width: 0;
  min-height: 136rpx;
  padding: 28rpx 32rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  opacity: 0;
  transform: translate3d(0, 30rpx, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 70ms);
}

.org-grid--active .org-card {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.org-card__icon {
  flex: 0 0 88rpx;
  transform: scale(.86);
  transform-origin: left center;
}

.org-card__copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.org-card__index {
  color: rgba(199, 177, 122, .78);
  font-size: 18rpx;
  line-height: 1;
}

.org-card__title {
  display: block;
  color: var(--c-ivory);
  font-size: 26rpx;
  line-height: 1.42;
  font-weight: 300;
}

.org-card__dot {
  flex: 0 0 auto;
  width: 9rpx;
  height: 9rpx;
  border-radius: 9rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 18rpx rgba(200, 242, 28, .45);
}
</style>
