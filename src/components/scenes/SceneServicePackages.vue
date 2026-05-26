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
    title-fx="none"
  >
    <view class="service-list">
      <ServiceCard
        v-for="service in servicePackages"
        :key="service.id"
        :service="service"
        :expanded="expandedId === service.id"
        @toggle="$emit('toggle', service.id)"
        @select="$emit('select', service.id)"
      />
    </view>
    <CtaButton :label="scene.ctaLabel || '预约场景共创'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import ServiceCard from '@/components/ui/ServiceCard.vue'
import { servicePackages, type ServicePackage } from '@/data/services'
import type { SceneRegistryItem } from '@/types/scene'

defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
  expandedId: ServicePackage['id']
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
  toggle: [id: ServicePackage['id']]
  select: [id: ServicePackage['id']]
}>()
</script>

<style scoped lang="scss">
.service-list {
  display: grid;
  gap: 18rpx;
}
</style>
