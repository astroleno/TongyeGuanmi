<template>
  <view class="scroll-indicator">
    <view class="scroll-indicator__rail">
      <view class="scroll-indicator__fill" :style="{ height: `${Math.round(progress * 100)}%` }" />
    </view>
    <text class="scroll-indicator__label">{{ label }}</text>
    <view class="scroll-indicator__arrow" />
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    progress: number
    label?: string
  }>(),
  {
    label: '向下探索'
  }
)
</script>

<style scoped lang="scss">
.scroll-indicator {
  position: fixed;
  left: 50%;
  bottom: 38rpx;
  z-index: 22;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  transform: translateX(-50%);
  pointer-events: none;
}

.scroll-indicator__rail {
  position: relative;
  width: 1rpx;
  height: 74rpx;
  overflow: hidden;
  background: rgba(233, 226, 210, .2);
}

.scroll-indicator__fill {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  min-height: 8rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 16rpx rgba(200, 242, 28, .58);
}

.scroll-indicator__label {
  color: rgba(233, 226, 210, .56);
  font-size: 22rpx;
}

.scroll-indicator__arrow {
  width: 22rpx;
  height: 22rpx;
  border-right: 4rpx solid rgba(233, 226, 210, .86);
  border-bottom: 4rpx solid rgba(233, 226, 210, .86);
  transform: rotate(45deg);
}
</style>
