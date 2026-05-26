<template>
  <GlassCard class="service-card" :tone="expanded ? 'warm' : 'quiet'">
    <view class="service-card__summary" @click="$emit('toggle', service.id)">
      <view>
        <text class="service-card__title">{{ service.title }}</text>
        <text class="service-card__subtitle">{{ service.subtitle }}</text>
      </view>
      <text class="service-card__toggle">{{ expanded ? '−' : '+' }}</text>
    </view>

    <view v-if="expanded" class="service-card__details">
      <text class="service-card__label">适合对象</text>
      <text class="service-card__body">{{ service.audience }}</text>
      <text class="service-card__label">包含内容</text>
      <view class="service-card__includes">
        <text v-for="item in service.includes" :key="item" class="service-card__include">{{ item }}</text>
      </view>
      <text class="service-card__label">交付结果</text>
      <text class="service-card__body">{{ service.outcome }}</text>
      <button class="service-card__cta" @click.stop="$emit('select', service.id)">
        <text>{{ service.cta }}</text>
        <text>→</text>
      </button>
    </view>
  </GlassCard>
</template>

<script setup lang="ts">
import GlassCard from '@/components/ui/GlassCard.vue'
import type { ServicePackage } from '@/data/services'

defineProps<{
  service: ServicePackage
  expanded: boolean
}>()

defineEmits<{
  toggle: [id: ServicePackage['id']]
  select: [id: ServicePackage['id']]
}>()
</script>

<style scoped lang="scss">
.service-card {
  display: block;
  padding: 32rpx 32rpx 30rpx;
}

.service-card__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.service-card__title {
  display: block;
  color: var(--c-ivory);
  font-size: 29rpx;
  line-height: 1.4;
}

.service-card__subtitle {
  display: block;
  margin-top: 10rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 22rpx;
  line-height: 1.54;
}

.service-card__toggle {
  width: 52rpx;
  height: 52rpx;
  border: 1rpx solid rgba(233, 226, 210, .18);
  border-radius: 52rpx;
  color: var(--c-ivory);
  font-size: 34rpx;
  line-height: 48rpx;
  text-align: center;
  flex: 0 0 auto;
}

.service-card__details {
  display: grid;
  gap: 18rpx;
  margin-top: 30rpx;
  padding-top: 28rpx;
  border-top: 1rpx solid rgba(233, 226, 210, .12);
}

.service-card__label {
  color: var(--c-warm-gold);
  font-size: 19rpx;
}

.service-card__body {
  color: rgba(233, 226, 210, .7);
  font-size: 22rpx;
  line-height: 1.64;
}

.service-card__includes {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.service-card__include {
  padding: 10rpx 14rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: 999rpx;
  color: rgba(233, 226, 210, .68);
  font-size: 20rpx;
}

.service-card__cta {
  margin-top: 8rpx;
  min-height: 68rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #17140d;
  background: var(--c-ivory);
  font-size: 23rpx;
}
</style>
