<template>
  <view class="brand-header" :style="headerStyle">
    <view class="brand-header__mark">
      <text class="brand-header__name">同野观幂</text>
      <text class="brand-header__dot" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSceneMetrics } from '@/composables/useSceneMetrics'

const metrics = useSceneMetrics()

onMounted(() => {
  metrics.refreshSystemMetrics()
})

const headerStyle = computed(() => ({
  top: `${metrics.headerTop.value}px`,
  height: `${metrics.headerHeight.value}px`,
  right: `${metrics.menuAvoidRight.value}px`
}))
</script>

<style scoped lang="scss">
.brand-header {
  position: fixed;
  left: var(--content-x);
  z-index: 30;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.brand-header__mark {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}

.brand-header__name {
  color: var(--c-ivory);
  font-size: 36rpx;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.brand-header__dot {
  width: 13rpx;
  height: 13rpx;
  border-radius: 13rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 20rpx rgba(200, 242, 28, .62);
  flex: 0 0 auto;
}
</style>
