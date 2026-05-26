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
    title-fx="emerge"
  >
    <template #body>
      <view class="hero-rule" />
      <text v-for="line in scene.body" :key="line" class="hero-body">{{ line }}</text>
    </template>
    <CtaButton :label="scene.ctaLabel || '开始了解'" @tap="$emit('cta', scene)" />
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
.hero-rule {
  width: 128rpx;
  height: 3rpx;
  margin-top: 14rpx;
  background: linear-gradient(90deg, var(--c-acid-dot), rgba(199, 177, 122, .64), transparent);
}

.hero-body {
  max-width: 540rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 26rpx;
  line-height: 1.62;
}
</style>
