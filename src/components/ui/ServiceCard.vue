<template>
  <GlassCard :tone="expanded ? 'warm' : 'quiet'">
    <view class="service-card">
      <view class="service-card__summary" @click="$emit('toggle', service.id)">
        <view class="service-card__copy">
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
  padding: 34rpx 36rpx;
}

.service-card__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22rpx;
}

.service-card__copy {
  flex: 1 1 auto;
  min-width: 0;
}

.service-card__title {
  display: block;
  color: var(--c-ivory);
  font-size: 25rpx;
  line-height: 1.5;
  font-weight: 300;
}

.service-card__subtitle {
  display: block;
  margin-top: 10rpx;
  color: rgba(233, 226, 210, .54);
  font-size: 20rpx;
  line-height: 1.66;
}

.service-card__toggle {
  width: 54rpx;
  height: 54rpx;
  border: 1rpx solid rgba(233, 226, 210, .18);
  border-radius: var(--r-control);
  color: var(--c-ivory);
  font-size: 31rpx;
  line-height: 50rpx;
  text-align: center;
  flex: 0 0 auto;
}

.service-card__details {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 34rpx;
  padding-top: 32rpx;
  border-top: 1rpx solid rgba(233, 226, 210, .12);
}

.service-card__label {
  color: var(--c-warm-gold);
  font-size: 18rpx;
  line-height: 1.32;
}

.service-card__body {
  color: rgba(233, 226, 210, .62);
  font-size: 20rpx;
  line-height: 1.72;
}

.service-card__includes {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.service-card__include {
  padding: 11rpx 15rpx;
  border: 1rpx solid rgba(233, 226, 210, .12);
  border-radius: var(--r-control);
  color: rgba(233, 226, 210, .62);
  font-size: 18rpx;
  line-height: 1.36;
}

.service-card__cta {
  margin-top: 10rpx;
  min-height: 76rpx;
  padding: 0 30rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #17140d;
  background: var(--c-ivory);
  font-size: 23rpx;
  line-height: 1.28;
}
</style>
