<template>
  <view class="step-rail">
    <view v-for="(step, index) in steps" :key="step.label" class="step-rail__item" :class="{ 'step-rail__item--active': index <= activeIndex }">
      <view class="step-rail__dot" />
      <text class="step-rail__label">{{ step.label }}</text>
      <text class="step-rail__title">{{ step.title }}</text>
      <text v-if="step.desc" class="step-rail__desc">{{ step.desc }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  steps: Array<{
    label: string
    title: string
    desc?: string
  }>
  activeIndex: number
}>()
</script>

<style scoped lang="scss">
.step-rail {
  display: grid;
  gap: 20rpx;
}

.step-rail__item {
  position: relative;
  min-height: 126rpx;
  padding: 26rpx 28rpx 26rpx 96rpx;
  border: 1rpx solid rgba(233, 226, 210, .14);
  border-radius: 22rpx;
  background: rgba(18, 20, 18, .46);
  color: rgba(233, 226, 210, .68);
  transition: border-color .35s var(--ease-soft), background .35s var(--ease-soft), color .35s var(--ease-soft);
}

.step-rail__dot {
  position: absolute;
  left: 40rpx;
  top: 38rpx;
  width: 10rpx;
  height: 10rpx;
  border-radius: 10rpx;
  background: rgba(233, 226, 210, .35);
}

.step-rail__item--active {
  border-color: rgba(199, 177, 122, .36);
  background: rgba(199, 177, 122, .08);
  color: var(--c-ivory);
}

.step-rail__item--active .step-rail__dot {
  background: var(--c-acid-dot);
  box-shadow: 0 0 18rpx rgba(200, 242, 28, .42);
}

.step-rail__label {
  position: absolute;
  left: 28rpx;
  top: 28rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 20rpx;
}

.step-rail__title {
  display: block;
  font-size: 28rpx;
  line-height: 1.36;
}

.step-rail__desc {
  display: block;
  margin-top: 10rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 22rpx;
  line-height: 1.58;
}
</style>
