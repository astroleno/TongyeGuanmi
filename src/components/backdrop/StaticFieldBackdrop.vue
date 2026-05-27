<template>
  <view class="static-field" :class="[`static-field--${sceneId}`, { 'static-field--active': active }]">
    <view class="static-field__aura static-field__aura--a" />
    <view class="static-field__aura static-field__aura--b" />
    <view class="static-field__route static-field__route--primary" />
    <view class="static-field__route static-field__route--secondary" />
    <view class="static-field__focus static-field__focus--upper" />
    <view class="static-field__focus static-field__focus--lower" />
    <view class="static-field__fiber static-field__fiber--a" />
    <view class="static-field__fiber static-field__fiber--b" />
    <view class="static-field__neural static-field__neural--a" />
    <view class="static-field__neural static-field__neural--b" />
    <view class="static-field__neural static-field__neural--c" />
    <view class="static-field__thread static-field__thread--a" />
    <view class="static-field__thread static-field__thread--b" />
    <view class="static-field__thread static-field__thread--c" />
    <view class="static-field__flow static-field__flow--a" />
    <view class="static-field__flow static-field__flow--b" />
    <view class="static-field__node-cloud" />
    <view class="static-field__grain" />
    <view class="static-field__veil static-field__veil--left" />
    <view class="static-field__veil static-field__veil--right" />
    <view class="static-field__axis static-field__axis--a" />
    <view class="static-field__axis static-field__axis--b" />
    <view :key="sceneId" class="static-field__transition" />
  </view>
</template>

<script setup lang="ts">
import type { SceneBackdropProps } from '@/types/scene'

defineProps<SceneBackdropProps>()
</script>

<style scoped lang="scss">
.static-field {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 18%, rgba(199, 177, 122, .14), transparent 24%),
    radial-gradient(circle at 78% 63%, rgba(89, 113, 91, .10), transparent 32%),
    linear-gradient(118deg, rgba(8, 8, 7, .98), rgba(17, 19, 16, .94) 46%, rgba(5, 5, 4, .99)),
    var(--c-obsidian);
}

.static-field__aura {
  position: absolute;
  width: 720rpx;
  height: 720rpx;
  border-radius: 50%;
  opacity: .30;
  filter: blur(42rpx);
  pointer-events: none;
}

.static-field__aura--a {
  left: -220rpx;
  top: -130rpx;
  background: radial-gradient(circle, rgba(233, 226, 210, .24), rgba(199, 177, 122, .10) 38%, transparent 70%);
  animation: aura-breathe-a 18s ease-in-out infinite alternate;
}

.static-field__aura--b {
  right: -270rpx;
  bottom: 12%;
  background: radial-gradient(circle, rgba(199, 177, 122, .18), rgba(62, 91, 72, .12) 42%, transparent 72%);
  animation: aura-breathe-b 21s ease-in-out infinite alternate;
}

.static-field__route {
  position: absolute;
  height: 2rpx;
  width: 960rpx;
  border-radius: 999rpx;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(199, 177, 122, .12), rgba(233, 226, 210, .42), rgba(199, 177, 122, .16), transparent);
  box-shadow: 0 0 38rpx rgba(199, 177, 122, .15);
  filter: blur(.35rpx);
}

.static-field__route--primary {
  left: -210rpx;
  top: 26%;
  opacity: .72;
  transform: rotate(-16deg);
  animation: route-breathe-primary 18s ease-in-out infinite alternate;
}

.static-field__route--secondary {
  left: -280rpx;
  bottom: 25%;
  width: 840rpx;
  opacity: .34;
  transform: rotate(21deg);
  animation: route-breathe-secondary 22s ease-in-out infinite alternate;
}

.static-field__focus {
  position: absolute;
  width: 260rpx;
  height: 260rpx;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(22rpx);
  background: radial-gradient(circle, rgba(233, 226, 210, .28), rgba(199, 177, 122, .16) 28%, transparent 68%);
}

.static-field__focus--upper {
  left: 8%;
  top: 16%;
  opacity: .34;
  animation: focus-breathe 16s ease-in-out infinite alternate;
}

.static-field__focus--lower {
  right: -6%;
  bottom: 21%;
  opacity: .18;
  animation: focus-breathe 21s ease-in-out infinite alternate-reverse;
}

.static-field__fiber {
  position: absolute;
  inset: -20%;
  opacity: .16;
  background:
    repeating-linear-gradient(102deg, rgba(233, 226, 210, .055) 0 1rpx, transparent 1rpx 18rpx),
    repeating-linear-gradient(38deg, transparent 0 31rpx, rgba(199, 177, 122, .045) 32rpx, transparent 34rpx);
  filter: blur(.35rpx);
  transform: rotate(16deg);
  animation: fiber-drift-a 18s ease-in-out infinite alternate;
}

.static-field__fiber--b {
  opacity: .10;
  transform: rotate(-23deg) translateX(18%);
  animation: fiber-drift-b 22s ease-in-out infinite alternate;
}

.static-field__neural {
  position: absolute;
  inset: -26%;
  opacity: .16;
  transform-origin: 50% 50%;
  pointer-events: none;
}

.static-field__neural--a {
  background:
    repeating-radial-gradient(ellipse at 25% 32%, transparent 0 68rpx, rgba(199, 177, 122, .07) 69rpx, transparent 76rpx),
    repeating-linear-gradient(58deg, transparent 0 76rpx, rgba(233, 226, 210, .035) 77rpx, transparent 84rpx);
  filter: blur(1rpx);
  animation: neural-sweep-a 16s ease-in-out infinite alternate;
}

.static-field__neural--b {
  opacity: .12;
  background:
    repeating-radial-gradient(ellipse at 70% 58%, transparent 0 82rpx, rgba(233, 226, 210, .055) 83rpx, transparent 91rpx),
    repeating-linear-gradient(126deg, transparent 0 88rpx, rgba(199, 177, 122, .035) 89rpx, transparent 96rpx);
  filter: blur(1.4rpx);
  animation: neural-sweep-b 21s ease-in-out infinite alternate;
}

.static-field__neural--c {
  inset: -10%;
  opacity: .14;
  background:
    radial-gradient(ellipse at 18% 22%, rgba(233, 226, 210, .40) 0 2rpx, rgba(199, 177, 122, .23) 3rpx, transparent 70rpx),
    radial-gradient(ellipse at 72% 68%, rgba(199, 177, 122, .28) 0 2rpx, transparent 88rpx),
    radial-gradient(ellipse at 48% 46%, rgba(199, 177, 122, .12) 0 1rpx, transparent 58rpx);
  filter: blur(1.8rpx);
  animation: neural-pulse 12s ease-in-out infinite alternate;
}

.static-field__thread {
  position: absolute;
  width: 760rpx;
  height: 420rpx;
  border-radius: 50%;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-left-color: rgba(199, 177, 122, .34);
  border-top-color: rgba(233, 226, 210, .20);
  border-right-color: transparent;
  border-bottom-color: transparent;
  opacity: .42;
  filter: blur(.55rpx);
  pointer-events: none;
}

.static-field__thread--a {
  left: -210rpx;
  top: 16%;
  transform: rotate(-21deg);
  animation: thread-float-a 15s ease-in-out infinite alternate;
}

.static-field__thread--b {
  right: -260rpx;
  top: 5%;
  width: 700rpx;
  height: 560rpx;
  opacity: .30;
  transform: rotate(36deg);
  animation: thread-float-b 19s ease-in-out infinite alternate;
}

.static-field__thread--c {
  left: -180rpx;
  bottom: 6%;
  width: 820rpx;
  height: 520rpx;
  opacity: .24;
  transform: rotate(18deg);
  animation: thread-float-c 23s ease-in-out infinite alternate;
}

.static-field__flow {
  position: absolute;
  left: -34%;
  right: -34%;
  height: 42%;
  opacity: .18;
  pointer-events: none;
  filter: blur(1.2rpx);
  transform-origin: 50% 50%;
}

.static-field__flow--a {
  top: 23%;
  background:
    repeating-linear-gradient(101deg, transparent 0 34rpx, rgba(233, 226, 210, .055) 35rpx, transparent 44rpx),
    linear-gradient(102deg, transparent, rgba(199, 177, 122, .26) 46%, rgba(233, 226, 210, .12) 53%, transparent);
  animation: field-flow-a 13s var(--ease-soft) infinite alternate;
}

.static-field__flow--b {
  bottom: 6%;
  opacity: .12;
  background:
    repeating-linear-gradient(64deg, transparent 0 42rpx, rgba(199, 177, 122, .06) 43rpx, transparent 52rpx),
    linear-gradient(72deg, transparent, rgba(83, 112, 87, .20) 42%, rgba(199, 177, 122, .14), transparent);
  animation: field-flow-b 16s var(--ease-soft) infinite alternate-reverse;
}

.static-field__node-cloud {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  opacity: .18;
  background-image:
    radial-gradient(circle at 22% 18%, rgba(233, 226, 210, .30) 0 2rpx, transparent 3rpx),
    radial-gradient(circle at 62% 28%, rgba(199, 177, 122, .24) 0 2rpx, transparent 3rpx),
    radial-gradient(circle at 78% 50%, rgba(233, 226, 210, .20) 0 1rpx, transparent 3rpx),
    radial-gradient(circle at 36% 64%, rgba(199, 177, 122, .22) 0 2rpx, transparent 3rpx),
    radial-gradient(circle at 58% 82%, rgba(199, 177, 122, .12) 0 1rpx, transparent 3rpx);
  background-size: 390rpx 520rpx, 460rpx 480rpx, 520rpx 620rpx, 440rpx 540rpx, 580rpx 560rpx;
  animation: node-drift 17s linear infinite;
}

.static-field__grain {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  opacity: .07;
  background-image:
    radial-gradient(circle at 16% 28%, rgba(233, 226, 210, .16) 0 1rpx, transparent 1rpx),
    radial-gradient(circle at 72% 58%, rgba(199, 177, 122, .18) 0 1rpx, transparent 1rpx),
    radial-gradient(circle at 42% 76%, rgba(199, 177, 122, .10) 0 1rpx, transparent 1rpx);
  background-size: 42rpx 42rpx, 58rpx 58rpx, 82rpx 82rpx;
  animation: grain-drift 10s linear infinite;
}

.static-field__veil {
  position: absolute;
  top: -10%;
  bottom: -10%;
  width: 46%;
  opacity: .28;
  filter: blur(32rpx);
}

.static-field__veil--left {
  left: -20%;
  background: linear-gradient(90deg, rgba(233, 226, 210, .12), transparent);
  animation: veil-breathe-left 14s ease-in-out infinite alternate;
}

.static-field__veil--right {
  right: -14%;
  background: linear-gradient(270deg, rgba(199, 177, 122, .12), transparent);
  animation: veil-breathe-right 16s ease-in-out infinite alternate;
}

.static-field__axis {
  position: absolute;
  height: 1rpx;
  opacity: .42;
  background: linear-gradient(90deg, transparent, rgba(233, 226, 210, .18), transparent);
  transform-origin: center;
}

.static-field__axis--a {
  width: 680rpx;
  right: -180rpx;
  top: 36%;
  transform: rotate(-18deg);
}

.static-field__axis--b {
  width: 520rpx;
  left: -160rpx;
  bottom: 24%;
  transform: rotate(28deg);
}

.static-field__transition {
  position: absolute;
  top: -18%;
  bottom: -18%;
  left: -44%;
  width: 88%;
  opacity: 0;
  pointer-events: none;
  background:
    linear-gradient(92deg, transparent, rgba(233, 226, 210, .08), rgba(200, 242, 28, .18), rgba(199, 177, 122, .20), transparent);
  filter: blur(18rpx);
  transform: translate3d(-22%, 0, 0) rotate(-14deg);
  animation: scene-transition-sweep 1.25s var(--ease-cinematic) both;
}

.static-field--personal .static-field__veil--right,
.static-field--service-packages .static-field__veil--right {
  background: linear-gradient(270deg, rgba(139, 94, 69, .18), transparent);
}

.static-field--lead .static-field__route--primary,
.static-field--projects .static-field__route--primary,
.static-field--service-packages .static-field__route--primary {
  opacity: .44;
}

.static-field--lead .static-field__neural,
.static-field--projects .static-field__neural,
.static-field--service-packages .static-field__neural {
  opacity: .18;
}

.static-field--lead .static-field__thread,
.static-field--projects .static-field__thread,
.static-field--service-packages .static-field__thread {
  opacity: .18;
}

.static-field--field-map .static-field__flow--a,
.static-field--organization .static-field__flow--a,
.static-field--canvas-agent .static-field__flow--a,
.static-field--video-pipeline .static-field__flow--a,
.static-field--method .static-field__flow--a {
  opacity: .24;
}

.static-field--projects .static-field__transition,
.static-field--service-packages .static-field__transition,
.static-field--lead .static-field__transition {
  opacity: 0;
  background:
    linear-gradient(92deg, transparent, rgba(199, 177, 122, .06), rgba(233, 226, 210, .10), transparent);
}

@keyframes aura-breathe-a {
  0% {
    opacity: .18;
    transform: translate3d(-18rpx, -10rpx, 0) scale(.94);
  }

  100% {
    opacity: .34;
    transform: translate3d(24rpx, 22rpx, 0) scale(1.08);
  }
}

@keyframes aura-breathe-b {
  0% {
    opacity: .16;
    transform: translate3d(20rpx, 16rpx, 0) scale(.96);
  }

  100% {
    opacity: .30;
    transform: translate3d(-28rpx, -18rpx, 0) scale(1.1);
  }
}

@keyframes route-breathe-primary {
  0% {
    opacity: .54;
    transform: rotate(-17deg) translate3d(-18rpx, -8rpx, 0);
  }

  100% {
    opacity: .78;
    transform: rotate(-15deg) translate3d(22rpx, 10rpx, 0);
  }
}

@keyframes route-breathe-secondary {
  0% {
    opacity: .22;
    transform: rotate(20deg) translate3d(16rpx, -10rpx, 0);
  }

  100% {
    opacity: .38;
    transform: rotate(23deg) translate3d(-18rpx, 14rpx, 0);
  }
}

@keyframes focus-breathe {
  0% {
    transform: translate3d(-12rpx, -8rpx, 0) scale(.92);
  }

  100% {
    transform: translate3d(16rpx, 14rpx, 0) scale(1.08);
  }
}

@keyframes fiber-drift-a {
  0% {
    transform: rotate(14deg) translate3d(-20rpx, -8rpx, 0);
  }

  100% {
    transform: rotate(19deg) translate3d(28rpx, 18rpx, 0);
  }
}

@keyframes fiber-drift-b {
  0% {
    transform: rotate(-25deg) translate3d(15%, -10rpx, 0);
  }

  100% {
    transform: rotate(-19deg) translate3d(20%, 24rpx, 0);
  }
}

@keyframes neural-sweep-a {
  0% {
    opacity: .32;
    transform: rotate(-8deg) translate3d(-38rpx, -20rpx, 0) scale(1.03);
  }

  100% {
    opacity: .50;
    transform: rotate(-2deg) translate3d(34rpx, 28rpx, 0) scale(1.08);
  }
}

@keyframes neural-sweep-b {
  0% {
    opacity: .20;
    transform: rotate(8deg) translate3d(24rpx, 20rpx, 0) scale(1.02);
  }

  100% {
    opacity: .34;
    transform: rotate(15deg) translate3d(-30rpx, -18rpx, 0) scale(1.07);
  }
}

@keyframes neural-pulse {
  0% {
    opacity: .22;
    transform: translate3d(-18rpx, -12rpx, 0) scale(1);
  }

  50% {
    opacity: .42;
  }

  100% {
    opacity: .30;
    transform: translate3d(20rpx, 18rpx, 0) scale(1.08);
  }
}

@keyframes thread-float-a {
  0% {
    opacity: .28;
    transform: rotate(-24deg) translate3d(-22rpx, -14rpx, 0) scale(.98);
  }

  100% {
    opacity: .48;
    transform: rotate(-17deg) translate3d(26rpx, 20rpx, 0) scale(1.04);
  }
}

@keyframes thread-float-b {
  0% {
    opacity: .20;
    transform: rotate(32deg) translate3d(18rpx, -18rpx, 0) scale(.98);
  }

  100% {
    opacity: .34;
    transform: rotate(41deg) translate3d(-28rpx, 24rpx, 0) scale(1.05);
  }
}

@keyframes thread-float-c {
  0% {
    opacity: .16;
    transform: rotate(14deg) translate3d(-20rpx, 14rpx, 0) scale(1);
  }

  100% {
    opacity: .30;
    transform: rotate(22deg) translate3d(26rpx, -22rpx, 0) scale(1.06);
  }
}

@keyframes field-flow-a {
  0% {
    opacity: .12;
    transform: rotate(-14deg) translate3d(-34rpx, -10rpx, 0) scale(1.02);
  }

  48% {
    opacity: .24;
    transform: rotate(-12deg) translate3d(18rpx, 8rpx, 0) scale(1.06);
  }

  100% {
    opacity: .17;
    transform: rotate(-10deg) translate3d(52rpx, 22rpx, 0) scale(1.10);
  }
}

@keyframes field-flow-b {
  0% {
    opacity: .08;
    transform: rotate(18deg) translate3d(28rpx, 18rpx, 0) scale(1);
  }

  100% {
    opacity: .16;
    transform: rotate(21deg) translate3d(-38rpx, -16rpx, 0) scale(1.08);
  }
}

@keyframes scene-transition-sweep {
  0% {
    opacity: 0;
    transform: translate3d(-35%, 0, 0) rotate(-14deg) scaleX(.72);
  }

  18% {
    opacity: .62;
  }

  62% {
    opacity: .26;
  }

  100% {
    opacity: 0;
    transform: translate3d(118%, 0, 0) rotate(-14deg) scaleX(1.18);
  }
}

@keyframes node-drift {
  0% {
    background-position: 0 0, 0 0, 0 0, 0 0, 0 0;
  }

  100% {
    background-position: 390rpx -520rpx, -460rpx 480rpx, 520rpx 620rpx, -440rpx -540rpx, 580rpx -560rpx;
  }
}

@keyframes grain-drift {
  0% {
    background-position: 0 0, 0 0, 0 0;
  }

  100% {
    background-position: 42rpx 42rpx, -58rpx 58rpx, 82rpx -82rpx;
  }
}

@keyframes veil-breathe-left {
  0% {
    opacity: .32;
    transform: translateX(-18rpx);
  }

  100% {
    opacity: .58;
    transform: translateX(24rpx);
  }
}

@keyframes veil-breathe-right {
  0% {
    opacity: .30;
    transform: translateX(18rpx);
  }

  100% {
    opacity: .54;
    transform: translateX(-24rpx);
  }
}

</style>
