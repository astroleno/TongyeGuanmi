<template>
  <view class="typo-field" v-if="enabled" aria-hidden="true">
    <text
      v-for="(glyph, index) in glyphs"
      :key="`${sceneId}-${index}-${glyph}`"
      class="typo-field__glyph"
      :style="glyphStyle(index)"
    >
      {{ glyph }}
    </text>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  sceneId: string
  enabled: boolean
  progress: number
}>()

const glyphs = [
  '同', '野', '观', '幂', 'AI', '现场', 'field', 'method',
  '共创', '系统', '能力', 'brief', 'node', 'learn', '∞', '表达'
]

function glyphStyle(index: number) {
  const x = 8 + (index * 31) % 82
  const y = 12 + (index * 17) % 76
  const drift = (props.progress - 0.5) * (index % 2 === 0 ? 10 : -10)
  const scale = index % 5 === 0 ? 1.12 : 1
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate3d(${drift}rpx, ${-drift}rpx, 0) scale(${scale})`,
    opacity: `${Math.min(0.045, 0.018 + (index % 5) * 0.006)}`
  }
}
</script>

<style scoped lang="scss">
.typo-field {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.typo-field__glyph {
  position: absolute;
  color: var(--c-ivory);
  font-size: 21rpx;
  line-height: 1;
  text-shadow: 0 0 12rpx rgba(233, 226, 210, .10);
  transition: transform .45s var(--ease-soft);
  white-space: nowrap;
}
</style>
