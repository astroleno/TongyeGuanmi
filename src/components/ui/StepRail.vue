<template>
  <view class="step-rail">
    <view v-for="(step, index) in steps" :key="step.label" class="step-rail__item" :class="{ 'step-rail__item--active': index <= activeIndex }">
      <text class="step-rail__label">{{ step.label }}</text>
      <view class="step-rail__dot" />
      <text class="step-rail__title">{{ step.title }}</text>
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 4rpx 0;
}

.step-rail::before {
  content: "";
  position: absolute;
  left: 31rpx;
  top: 22rpx;
  bottom: 22rpx;
  width: 1rpx;
  background: linear-gradient(180deg, transparent, rgba(233, 226, 210, .24), rgba(199, 177, 122, .30), transparent);
}

.step-rail__item {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 74rpx;
  padding: 0 0 0 82rpx;
  color: rgba(233, 226, 210, .68);
  text-align: left;
  transition: color .35s var(--ease-soft), opacity .35s var(--ease-soft);
}

.step-rail__dot {
  position: absolute;
  left: 0;
  top: 5rpx;
  width: 62rpx;
  height: 62rpx;
  margin: 0;
  border: 1rpx solid rgba(233, 226, 210, .18);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(233, 226, 210, .14), rgba(8, 8, 7, .42));
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08);
}

.step-rail__item--active {
  color: var(--c-ivory);
}

.step-rail__item--active .step-rail__dot {
  border-color: rgba(199, 177, 122, .48);
  background: radial-gradient(circle, rgba(233, 226, 210, .28), rgba(199, 177, 122, .16) 48%, rgba(8, 8, 7, .34));
  box-shadow: 0 0 22rpx rgba(199, 177, 122, .20), inset 0 1rpx 0 rgba(255, 255, 255, .10);
}

.step-rail__label {
  display: block;
  color: rgba(233, 226, 210, .62);
  font-size: 18rpx;
  line-height: 1.24;
}

.step-rail__title {
  display: block;
  margin-top: 6rpx;
  color: inherit;
  font-size: 22rpx;
  line-height: 1.46;
  font-weight: 300;
}
</style>
