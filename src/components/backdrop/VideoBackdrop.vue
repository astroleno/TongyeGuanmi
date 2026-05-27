<template>
  <view class="video-backdrop">
    <StaticFieldBackdrop
      :scene-id="sceneId"
      :scene-index="0"
      :active="active"
      :progress="0"
      variant="static"
    />
  </view>
</template>

<script setup lang="ts">
import StaticFieldBackdrop from '@/components/backdrop/StaticFieldBackdrop.vue'

defineProps<{
  sceneId: string
  active: boolean
}>()
</script>

<style scoped>
.video-backdrop {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
}
</style>
