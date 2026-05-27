<template>
  <view class="scene-backdrop" aria-hidden="true">
    <VideoBackdrop
      v-if="variant === 'video'"
      :scene-id="sceneId"
      :active="active"
      :progress="progress"
    />
    <StaticFieldBackdrop
      v-if="variant !== 'video'"
      :scene-id="sceneId"
      :scene-index="sceneIndex"
      :active="active"
      :progress="progress"
      :variant="variant"
    />
  </view>
</template>

<script setup lang="ts">
import StaticFieldBackdrop from '@/components/backdrop/StaticFieldBackdrop.vue'
import VideoBackdrop from '@/components/backdrop/VideoBackdrop.vue'
import type { SceneBackdropProps } from '@/types/scene'

defineProps<SceneBackdropProps>()
</script>

<style scoped>
.scene-backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
}
</style>
