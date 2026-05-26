<template>
  <view class="weapp-safe-area" :style="{ height: `${height}px` }" />
</template>

<script setup lang="ts">
defineProps<{
  height: number
}>()
</script>

<style scoped>
.weapp-safe-area {
  width: 100%;
  flex: 0 0 auto;
}
</style>
