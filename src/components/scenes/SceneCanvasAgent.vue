<template>
  <SceneShell
    :id="scene.id"
    :eyebrow="scene.eyebrow"
    :title="scene.title"
    :title-lines="scene.titleLines"
    :title-max-lines="scene.titleMaxLines"
    :subtitle="scene.subtitle"
    :active="active"
    :progress="progress"
    :title-fx="scene.textFx?.mode || 'none'"
    :line-break-policy="scene.textFx?.lineBreakPolicy || 'manual'"
  >
    <view class="canvas-map">
      <view class="canvas-map__line canvas-map__line--a" />
      <view class="canvas-map__line canvas-map__line--b" />
      <view v-for="(node, index) in nodes" :key="node" class="canvas-node" :class="`canvas-node--${index}`">
        <text>{{ node }}</text>
      </view>
      <view class="canvas-map__agent" />
    </view>
    <CtaButton :label="scene.ctaLabel || '查看方案'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import SceneShell from '@/components/scenes/SceneShell.vue'
import type { SceneRegistryItem } from '@/types/scene'

defineProps<{
  scene: SceneRegistryItem
  active: boolean
  progress: number
}>()

defineEmits<{
  cta: [scene: SceneRegistryItem]
}>()

const nodes = ['知识结构', '业务流程', '任务协作', 'Agent 编排', '组织记忆']
</script>

<style scoped lang="scss">
.canvas-map {
  position: relative;
  height: 470rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: var(--r-panel);
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(233, 226, 210, .04) 1rpx, transparent 1rpx),
    linear-gradient(0deg, rgba(233, 226, 210, .04) 1rpx, transparent 1rpx),
    rgba(8, 8, 7, .28);
  background-size: 64rpx 64rpx;
}

.canvas-map__line {
  position: absolute;
  left: 9%;
  right: 9%;
  height: 1rpx;
  background: linear-gradient(90deg, transparent, rgba(199, 177, 122, .42), transparent);
}

.canvas-map__line--a {
  top: 40%;
  transform: rotate(12deg);
}

.canvas-map__line--b {
  top: 58%;
  transform: rotate(-18deg);
}

.canvas-node {
  position: absolute;
  min-width: 148rpx;
  max-width: 220rpx;
  padding: 20rpx 22rpx;
  border: 1rpx solid rgba(233, 226, 210, .16);
  border-radius: var(--r-control);
  color: var(--c-ivory);
  background:
    linear-gradient(130deg, rgba(233, 226, 210, .10), rgba(18, 20, 18, .52)),
    rgba(18, 20, 18, .58);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08);
  font-size: 20rpx;
  line-height: 1.48;
  text-align: center;
}

.canvas-node--0 { left: 8%; top: 18%; }
.canvas-node--1 { right: 10%; top: 16%; }
.canvas-node--2 { left: 25%; top: 42%; }
.canvas-node--3 { right: 7%; bottom: 16%; }
.canvas-node--4 { left: 8%; bottom: 14%; }

.canvas-map__agent {
  position: absolute;
  left: 50%;
  top: 52%;
  width: 18rpx;
  height: 18rpx;
  border-radius: 18rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 28rpx rgba(200, 242, 28, .62);
  animation: agent-path 5.4s var(--ease-soft) infinite alternate;
}

@keyframes agent-path {
  from {
    transform: translate3d(-120rpx, -74rpx, 0);
  }
  to {
    transform: translate3d(124rpx, 96rpx, 0);
  }
}
</style>
