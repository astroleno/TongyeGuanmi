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
    <scroll-view class="project-strip" :class="{ 'project-strip--active': active }" scroll-x :show-scrollbar="false" enhanced>
      <view class="project-strip__inner">
        <view
          v-for="(project, index) in projects"
          :key="project.id"
          class="project-strip__item"
          :style="{ '--stagger-index': index }"
          @click="$emit('project', project.modal.id)"
        >
          <ProjectCard :project="project" :index-label="String(index + 1).padStart(2, '0')" :active="index === focusIndex" />
        </view>
      </view>
    </scroll-view>
    <CtaButton :label="scene.ctaLabel || '查看样片'" @tap="$emit('project', projects[focusIndex].modal.id)" />
  </SceneShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import ProjectCard from '@/components/ui/ProjectCard.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import { projects } from '@/data/projects'
import type { SceneRegistryItem } from '@/types/scene'

const props = defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  project: [modalId: string]
}>()

const focusIndex = computed(() => Math.min(projects.length - 1, Math.floor(props.progress * projects.length)))
</script>

<style scoped lang="scss">
.project-strip {
  width: 100%;
}

.project-strip__inner {
  display: flex;
  gap: 24rpx;
  width: auto;
  padding: 8rpx 58rpx 28rpx 0;
}

.project-strip__item {
  flex: 0 0 auto;
  width: 568rpx;
  opacity: 0;
  transform: translate3d(34rpx, 0, 0);
  transition:
    opacity .72s var(--ease-cinematic),
    transform .72s var(--ease-cinematic);
  transition-delay: calc(var(--stagger-index) * 70ms);
}

.project-strip--active .project-strip__item {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}
</style>
