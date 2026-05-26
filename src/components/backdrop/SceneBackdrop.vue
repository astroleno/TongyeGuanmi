<template>
  <view class="scene-backdrop" aria-hidden="true">
    <ShaderCanvasBackdrop
      v-if="variant === 'shader'"
      :scene-id="sceneId"
      :scene-index="sceneIndex"
      :active="active"
      :progress="progress"
      :variant="variant"
    />
    <VideoBackdrop
      v-else-if="variant === 'video'"
      :scene-id="sceneId"
      :active="active"
    />
    <StaticFieldBackdrop
      v-else
      :scene-id="sceneId"
      :scene-index="sceneIndex"
      :active="active"
      :progress="progress"
      :variant="variant"
    />
  </view>
</template>

<script setup lang="ts">
import ShaderCanvasBackdrop from '@/components/backdrop/ShaderCanvasBackdrop.vue'
import StaticFieldBackdrop from '@/components/backdrop/StaticFieldBackdrop.vue'
import VideoBackdrop from '@/components/backdrop/VideoBackdrop.vue'
import type { SceneBackdropProps } from '@/types/scene'

defineProps<SceneBackdropProps>()
</script>

<style scoped>
.scene-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
</style>
