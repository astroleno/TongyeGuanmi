<template>
  <GlassCard :tone="active ? 'warm' : 'quiet'" class="project-card" :class="{ 'project-card--active': active }">
    <view class="project-card__topline">
      <text class="project-card__index">{{ indexLabel }}</text>
      <text class="project-card__signal">{{ project.signal }}</text>
    </view>
    <text class="project-card__title">{{ project.title }}</text>
    <text class="project-card__summary">{{ project.summary }}</text>
    <view class="project-card__tags">
      <text v-for="tag in project.tags" :key="tag" class="project-card__tag">{{ tag }}</text>
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
  padding: 34rpx;
  transform: translateY(0);
  transition: transform .45s var(--ease-cinematic), opacity .45s var(--ease-soft);
}

.project-card--active {
  transform: translateY(-8rpx);
}

.project-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 30rpx;
}

.project-card__index {
  color: var(--c-warm-gold);
  font-size: 22rpx;
}

.project-card__signal {
  color: rgba(233, 226, 210, .48);
  font-size: 20rpx;
  line-height: 1.35;
  text-align: right;
}

.project-card__title {
  display: block;
  color: var(--c-ivory);
  font-size: 32rpx;
  line-height: 1.38;
}

.project-card__summary {
  display: block;
  margin-top: 16rpx;
  color: rgba(233, 226, 210, .66);
  font-size: 23rpx;
  line-height: 1.66;
}

.project-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 22rpx;
}

.project-card__tag {
  padding: 9rpx 14rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: 999rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 18rpx;
}
</style>
