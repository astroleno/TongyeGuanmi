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
    <StepRail :steps="videoPipelineSteps" :active-index="activeStep" />
    <CtaButton :label="scene.ctaLabel || '浏览案例'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import StepRail from '@/components/ui/StepRail.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import { videoPipelineSteps } from '@/data/methodSteps'
import type { SceneRegistryItem } from '@/types/scene'

const props = defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
}>()

const activeStep = computed(() => Math.min(videoPipelineSteps.length - 1, Math.floor(props.progress * videoPipelineSteps.length)))
</script>
