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
  >
    <view class="org-grid">
      <GlassCard v-for="item in items" :key="item.title" class="org-card">
        <text class="org-card__index">{{ item.index }}</text>
        <text class="org-card__title">{{ item.title }}</text>
        <text class="org-card__desc">{{ item.desc }}</text>
      </GlassCard>
    </view>
    <CtaButton :label="scene.ctaLabel || '预约咨询'" @tap="$emit('cta', scene)" />
  </SceneShell>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import GlassCard from '@/components/ui/GlassCard.vue'
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

const items = [
  { index: '01', title: 'AI 转型咨询', desc: '从管理共识到真实业务场景。' },
  { index: '02', title: '团队培训', desc: '让关键角色真的会用。' },
  { index: '03', title: '业务共创', desc: '找到第一个可落地现场。' },
  { index: '04', title: '落地陪跑', desc: '从试点走向持续使用。' }
]
</script>

<style scoped lang="scss">
.org-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.org-card {
  min-height: 204rpx;
  padding: 28rpx;
}

.org-card__index {
  color: var(--c-warm-gold);
  font-size: 20rpx;
}

.org-card__title {
  display: block;
  margin-top: 26rpx;
  color: var(--c-ivory);
  font-size: 27rpx;
  line-height: 1.36;
}

.org-card__desc {
  display: block;
  margin-top: 12rpx;
  color: rgba(233, 226, 210, .58);
  font-size: 21rpx;
  line-height: 1.52;
}
</style>
