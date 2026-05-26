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
    title-fx="align"
  >
    <StepRail :steps="methodSteps" :active-index="activeStep" />
    <CtaButton :label="scene.ctaLabel || '看项目样片'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import StepRail from '@/components/ui/StepRail.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import { methodSteps } from '@/data/methodSteps'
import type { SceneRegistryItem } from '@/types/scene'

const props = defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
}>()

const activeStep = computed(() => Math.min(methodSteps.length - 1, Math.floor(props.progress * methodSteps.length)))
</script>
