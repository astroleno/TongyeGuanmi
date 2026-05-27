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
    <view class="field-list" :class="{ 'field-list--active': active }">
      <view
        v-for="(node, index) in fieldNodes"
        :key="node.id"
        class="field-node"
        :style="{ '--stagger-index': index }"
        @click="$emit('target', node.target, node.direction)"
      >
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
  gap: 24rpx;
  min-height: 154rpx;
  padding: 28rpx 30rpx;
  border: 1rpx solid rgba(233, 226, 210, .17);
  border-radius: var(--r-card);
  background:
    linear-gradient(126deg, rgba(233, 226, 210, .1), rgba(18, 20, 18, .5) 38%, rgba(199, 177, 122, .07)),
    rgba(18, 20, 18, .62);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08), 0 26rpx 72rpx rgba(0, 0, 0, .24);
  backdrop-filter: blur(20rpx);
  opacity: 0;
  transform: translate3d(0, 30rpx, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 70ms);
}

.field-list--active .field-node {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.field-node__icon {
  flex: 0 0 104rpx;
}

.field-node__copy {
  flex: 1 1 auto;
  min-width: 0;
}

.field-node__title {
  display: block;
  color: var(--c-ivory);
  font-size: 26rpx;
  line-height: 1.46;
  font-weight: 300;
}

.field-node__subtitle {
  display: block;
  margin-top: 8rpx;
  color: rgba(233, 226, 210, .54);
  font-size: 20rpx;
  line-height: 1.66;
}

.field-node__arrow {
  flex: 0 0 auto;
  color: var(--c-ivory);
  font-size: 34rpx;
  line-height: 1;
}
</style>
