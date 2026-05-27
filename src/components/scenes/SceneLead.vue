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
    <template #body>
      <text class="lead-helper">预约一次场景共创，我们会一起判断最值得落地的切入点。</text>
    </template>
    <LeadForm
      :form="form"
      :submitting="submitting"
      :error="error"
      :success-lead-id="successLeadId"
      @submit="$emit('submit')"
    />
  </SceneShell>
</template>

<script setup lang="ts">
import LeadForm from '@/components/ui/LeadForm.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import type { LeadFormState } from '@/types/lead'
import type { SceneRegistryItem } from '@/types/scene'

defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
  form: LeadFormState
  submitting: boolean
  error: string
  successLeadId: string
}>()

defineEmits<{
  submit: []
}>()
</script>

<style scoped lang="scss">
.lead-helper {
  display: block;
  max-width: 600rpx;
  color: rgba(233, 226, 210, .6);
  font-size: 23rpx;
  line-height: 1.68;
}
</style>
