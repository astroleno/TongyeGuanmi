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
    title-fx="scatter"
  >
    <view class="field-list">
      <view v-for="node in fieldNodes" :key="node.id" class="field-node" @click="$emit('target', node.target, node.direction)">
        <IconBadge :name="node.icon" class="field-node__icon" />
        <view class="field-node__copy">
          <text class="field-node__title">{{ node.title }}</text>
          <text class="field-node__subtitle">{{ node.subtitle }}</text>
        </view>
        <text class="field-node__arrow">→</text>
      </view>
    </view>
    <CtaButton :label="scene.ctaLabel || '查看详细服务'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import IconBadge from '@/components/ui/IconBadge.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import { fieldNodes } from '@/data/fieldMap'
import type { LeadDirection } from '@/types/lead'
import type { SceneRegistryItem } from '@/types/scene'

defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
  target: [target: string, direction: LeadDirection]
}>()
</script>

<style scoped lang="scss">
.field-list {
  width: 100%;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.field-node {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 26rpx;
  min-height: 158rpx;
  padding: 24rpx 30rpx;
  border: 1rpx solid rgba(233, 226, 210, .17);
  border-radius: 28rpx;
  background:
    linear-gradient(126deg, rgba(233, 226, 210, .1), rgba(18, 20, 18, .5) 38%, rgba(199, 177, 122, .07)),
    rgba(18, 20, 18, .62);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08), 0 26rpx 72rpx rgba(0, 0, 0, .24);
  backdrop-filter: blur(20rpx);
}

.field-node__icon {
  flex: 0 0 112rpx;
}

.field-node__copy {
  flex: 1 1 auto;
  min-width: 0;
}

.field-node__title {
  display: block;
  color: var(--c-ivory);
  font-size: 30rpx;
  line-height: 1.36;
}

.field-node__subtitle {
  display: block;
  margin-top: 8rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 22rpx;
  line-height: 1.5;
}

.field-node__arrow {
  flex: 0 0 auto;
  color: var(--c-ivory);
  font-size: 38rpx;
  line-height: 1;
}
</style>
