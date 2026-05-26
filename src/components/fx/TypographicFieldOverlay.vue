<template>
  <view class="typo-field" v-if="enabled">
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
  '同', '野', '观', '幂', 'AI', '01', '现场', 'agent', 'flow', 'field', 'method', 'canvas',
  '共创', '系统', '能力', 'brief', 'prompt', 'train', 'memory', 'node', '幂', 'field',
  '现场', 'tools', 'learn', 'video', 'agent', '∞', 'S09', 'S11', '结构', '表达'
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
    opacity: `${0.075 + (index % 5) * 0.018}`
  }
}
</script>

<style scoped lang="scss">
.typo-field {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.typo-field__glyph {
  position: absolute;
  color: var(--c-ivory);
  font-size: 23rpx;
  line-height: 1;
  text-shadow: 0 0 16rpx rgba(233, 226, 210, .18);
  transition: transform .45s var(--ease-soft);
  white-space: nowrap;
}
</style>
