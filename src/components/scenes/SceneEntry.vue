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
    <view class="entry-panel">
      <text class="entry-panel__line">进入现场</text>
      <text class="entry-panel__dot" />
      <text class="entry-panel__line entry-panel__line--muted">保持静默</text>
    </view>
    <CtaButton :label="scene.ctaLabel || '进入'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
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
</script>

<style scoped lang="scss">
.entry-panel {
  display: flex;
  align-items: center;
  gap: 16rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 22rpx;
}

.entry-panel__dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 8rpx;
  background: var(--c-acid-dot);
}

.entry-panel__line--muted {
  opacity: .46;
}
</style>
