<template>
  <view class="glass-card" :class="[`glass-card--${tone}`]">
    <slot />
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'quiet' | 'warm'
  }>(),
  {
    tone: 'default'
  }
)
</script>

<style scoped lang="scss">
.glass-card {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border: 1rpx solid rgba(233, 226, 210, .17);
  border-radius: var(--r-card);
  background:
    linear-gradient(126deg, rgba(233, 226, 210, .1), rgba(18, 20, 18, .5) 38%, rgba(199, 177, 122, .07)),
    rgba(18, 20, 18, .62);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08), 0 18rpx 58rpx rgba(0, 0, 0, .20);
  backdrop-filter: blur(20rpx);
}

.glass-card--quiet {
  background:
    linear-gradient(140deg, rgba(233, 226, 210, .06), rgba(8, 8, 7, .58)),
    rgba(18, 20, 18, .48);
}

.glass-card--warm {
  border-color: rgba(199, 177, 122, .24);
  background:
    linear-gradient(140deg, rgba(199, 177, 122, .13), rgba(18, 20, 18, .48) 45%, rgba(139, 94, 69, .08)),
    rgba(18, 20, 18, .56);
}
</style>
