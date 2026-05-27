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
    <view class="service-list" :class="{ 'service-list--active': active }">
      <view
        v-for="(service, index) in servicePackages"
        :key="service.id"
        class="service-list__item"
        :style="{ '--stagger-index': index }"
      >
        <ServiceCard
          :service="service"
          :expanded="expandedId === service.id"
          @toggle="$emit('toggle', service.id)"
          @select="$emit('select', service.id)"
        />
      </view>
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
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.service-list__item {
  opacity: 0;
  transform: translate3d(0, 30rpx, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 70ms);
}

.service-list--active .service-list__item {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}
</style>
