<template>
  <view class="icon-badge" :class="[`icon-badge--${name}`]">
    <view class="icon-badge__glyph">
      <view v-if="name === 'org'" class="glyph-org">
        <view class="glyph-org__dot glyph-org__dot--top" />
        <view class="glyph-org__dot glyph-org__dot--left" />
        <view class="glyph-org__dot glyph-org__dot--right" />
        <view class="glyph-org__line glyph-org__line--a" />
        <view class="glyph-org__line glyph-org__line--b" />
      </view>
      <text v-else-if="name === 'infinity'" class="glyph-text">∞</text>
      <view v-else-if="name === 'video'" class="glyph-video">
        <view class="glyph-video__triangle" />
      </view>
      <view v-else class="glyph-person">
        <view class="glyph-person__head" />
        <view class="glyph-person__body" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  name: 'org' | 'infinity' | 'video' | 'person'
}>()
</script>

<style scoped lang="scss">
.icon-badge {
  width: 112rpx;
  height: 112rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-ivory);
  background:
    radial-gradient(circle at 45% 38%, rgba(233, 226, 210, .2), rgba(233, 226, 210, .04) 52%, rgba(8, 8, 7, .1)),
    rgba(233, 226, 210, .04);
}

.icon-badge__glyph {
  position: relative;
  width: 58rpx;
  height: 58rpx;
}

.glyph-text {
  display: block;
  font-size: 68rpx;
  line-height: 48rpx;
  text-align: center;
}

.glyph-video {
  width: 58rpx;
  height: 58rpx;
  border: 5rpx solid currentColor;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glyph-video__triangle {
  width: 0;
  height: 0;
  margin-left: 4rpx;
  border-top: 12rpx solid transparent;
  border-bottom: 12rpx solid transparent;
  border-left: 18rpx solid currentColor;
}

.glyph-person__head {
  width: 22rpx;
  height: 22rpx;
  margin: 4rpx auto 8rpx;
  border: 5rpx solid currentColor;
  border-radius: 22rpx;
}

.glyph-person__body {
  width: 48rpx;
  height: 26rpx;
  margin: 0 auto;
  border: 5rpx solid currentColor;
  border-top-left-radius: 28rpx;
  border-top-right-radius: 28rpx;
  border-bottom: 0;
}

.glyph-org {
  position: relative;
  width: 58rpx;
  height: 58rpx;
}

.glyph-org__dot {
  position: absolute;
  width: 15rpx;
  height: 15rpx;
  border: 5rpx solid currentColor;
  border-radius: 20rpx;
  background: rgba(8, 8, 7, .72);
}

.glyph-org__dot--top {
  top: 0;
  left: 18rpx;
}

.glyph-org__dot--left {
  bottom: 0;
  left: 0;
}

.glyph-org__dot--right {
  right: 0;
  bottom: 0;
}

.glyph-org__line {
  position: absolute;
  top: 27rpx;
  width: 30rpx;
  height: 5rpx;
  background: currentColor;
  transform-origin: left center;
}

.glyph-org__line--a {
  left: 25rpx;
  transform: rotate(132deg);
}

.glyph-org__line--b {
  left: 28rpx;
  transform: rotate(48deg);
}
</style>
