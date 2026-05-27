<template>
  <button class="cta-button" :class="{ 'cta-button--ghost': variant === 'ghost', 'cta-button--disabled': disabled }" :disabled="disabled" @click="$emit('tap')">
    <text class="cta-button__label">{{ label }}</text>
    <text class="cta-button__arrow">→</text>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    variant?: 'primary' | 'ghost'
    disabled?: boolean
  }>(),
  {
    variant: 'primary',
    disabled: false
  }
)

defineEmits<{
  tap: []
}>()
</script>

<style scoped lang="scss">
.cta-button {
  width: 100%;
  max-width: 520rpx;
  min-height: 88rpx;
  padding: 0 48rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #14130e;
  background:
    linear-gradient(100deg, #f2eddc, #d8cda9 58%, #f4efdd),
    var(--c-ivory);
  box-shadow: 0 14rpx 48rpx rgba(199, 177, 122, .18), inset 0 1rpx 0 rgba(255, 255, 255, .64);
  transition: transform .35s var(--ease-soft), opacity .35s var(--ease-soft);
}

.cta-button--disabled {
  opacity: .46;
}

.cta-button--ghost {
  color: var(--c-ivory);
  border: 1rpx solid rgba(233, 226, 210, .2);
  background: rgba(233, 226, 210, .08);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .08);
}

.cta-button__label {
  min-width: 0;
  max-width: 390rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.28;
}

.cta-button__arrow {
  font-size: 42rpx;
  line-height: 1;
}
</style>
