<template>
  <GlassCard :tone="active ? 'warm' : 'quiet'">
    <view class="project-card" :class="{ 'project-card--active': active }">
      <view class="project-card__media" :class="`project-card__media--${project.id}`">
        <image v-if="project.image" class="project-card__image" :src="project.image" mode="aspectFill" />
        <view v-else class="project-card__sample" aria-hidden="true">
          <view class="project-card__sample-line project-card__sample-line--a" />
          <view class="project-card__sample-line project-card__sample-line--b" />
          <view class="project-card__sample-panel" />
          <view class="project-card__sample-dot project-card__sample-dot--a" />
          <view class="project-card__sample-dot project-card__sample-dot--b" />
        </view>
        <text class="project-card__index">{{ indexLabel }}</text>
      </view>
      <view class="project-card__caption">
        <text class="project-card__signal">{{ project.signal }}</text>
        <text class="project-card__title">{{ project.title }}</text>
        <text class="project-card__summary">{{ project.summary }}</text>
        <view class="project-card__tags">
          <text v-for="tag in project.tags.slice(0, 2)" :key="tag" class="project-card__tag">{{ tag }}</text>
        </view>
      </view>
    </view>
  </GlassCard>
</template>

<script setup lang="ts">
import GlassCard from '@/components/ui/GlassCard.vue'
import type { ProjectItem } from '@/data/projects'

defineProps<{
  project: ProjectItem
  indexLabel: string
  active?: boolean
}>()
</script>

<style scoped lang="scss">
.project-card {
  display: block;
  padding: 12rpx;
  transform: translateY(0);
  transition: transform .45s var(--ease-cinematic), opacity .45s var(--ease-soft);
}

.project-card--active {
  transform: translateY(-8rpx);
}

.project-card__media {
  position: relative;
  height: 430rpx;
  overflow: hidden;
  border-radius: calc(var(--r-card) - 8rpx);
  background:
    radial-gradient(circle at 30% 30%, rgba(233, 226, 210, .16), transparent 28%),
    linear-gradient(135deg, rgba(199, 177, 122, .18), rgba(8, 8, 7, .16) 48%, rgba(89, 113, 91, .16)),
    rgba(8, 8, 7, .34);
}

.project-card__index {
  position: absolute;
  left: 24rpx;
  top: 22rpx;
  z-index: 2;
  padding: 8rpx 14rpx;
  border: 1rpx solid rgba(233, 226, 210, .18);
  border-radius: var(--r-control);
  color: rgba(233, 226, 210, .78);
  background: rgba(8, 8, 7, .24);
  font-size: 19rpx;
  line-height: 1;
}

.project-card__image {
  width: 100%;
  height: 100%;
}

.project-card__sample {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.project-card__sample-line {
  position: absolute;
  height: 2rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, transparent, rgba(233, 226, 210, .58), rgba(199, 177, 122, .32), transparent);
  box-shadow: 0 0 28rpx rgba(199, 177, 122, .18);
}

.project-card__sample-line--a {
  left: -12%;
  right: -8%;
  top: 35%;
  transform: rotate(-17deg);
}

.project-card__sample-line--b {
  left: -24%;
  right: 10%;
  bottom: 25%;
  opacity: .52;
  transform: rotate(22deg);
}

.project-card__sample-panel {
  position: absolute;
  left: 16%;
  right: 16%;
  top: 26%;
  height: 46%;
  border: 1rpx solid rgba(233, 226, 210, .14);
  border-radius: var(--r-card);
  background: rgba(8, 8, 7, .18);
}

.project-card__sample-dot {
  position: absolute;
  width: 12rpx;
  height: 12rpx;
  border-radius: 12rpx;
  background: rgba(233, 226, 210, .82);
  box-shadow: 0 0 26rpx rgba(233, 226, 210, .32);
}

.project-card__sample-dot--a {
  left: 28%;
  top: 38%;
}

.project-card__sample-dot--b {
  right: 26%;
  bottom: 34%;
}

.project-card__caption {
  padding: 24rpx 20rpx 20rpx;
}

.project-card__signal {
  display: block;
  color: var(--c-warm-gold);
  font-size: 18rpx;
  line-height: 1.4;
}

.project-card__title {
  display: block;
  margin-top: 12rpx;
  color: var(--c-ivory);
  font-size: 25rpx;
  line-height: 1.48;
  font-weight: 300;
}

.project-card__summary {
  display: block;
  margin-top: 14rpx;
  color: rgba(233, 226, 210, .50);
  font-size: 19rpx;
  line-height: 1.62;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.project-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 18rpx;
}

.project-card__tag {
  padding: 8rpx 12rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: var(--r-control);
  color: rgba(233, 226, 210, .52);
  font-size: 17rpx;
  line-height: 1.28;
}
</style>
