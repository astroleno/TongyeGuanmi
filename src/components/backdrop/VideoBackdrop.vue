<template>
  <view
    class="video-backdrop"
    :class="[
      `video-backdrop--${sceneConfig.tone}`,
      {
        'video-backdrop--enabled': backdropMotionEnabled,
        'video-backdrop--fallback-motion': fallbackMotionEnabled,
        'video-backdrop--native': nativeVideoEnabled,
        'video-backdrop--ready': videoReady,
        'video-backdrop--turning': turning
      }
    ]"
    :style="backdropStyle"
  >
    <StaticFieldBackdrop
      :scene-id="sceneId"
      :scene-index="0"
      :active="active"
      :progress="progress"
      variant="static"
      class="video-backdrop__static"
    />
    <image
      class="video-backdrop__poster"
      :src="sceneConfig.clip.poster"
      mode="aspectFill"
    />
    <video
      v-if="nativeVideoEnabled"
      :key="sceneConfig.clip.id"
      class="video-backdrop__video"
      :src="sceneConfig.clip.src"
      :autoplay="true"
      :loop="true"
      :muted="true"
      :controls="false"
      :show-center-play-btn="false"
      :show-play-btn="false"
      :show-fullscreen-btn="false"
      :enable-progress-gesture="false"
      object-fit="cover"
      @error="handleVideoError"
      @play="handleVideoReady"
      @canplay="handleVideoReady"
      @loadedmetadata="handleVideoReady"
      @loadeddata="handleVideoReady"
    />
    <view class="video-backdrop__motion video-backdrop__motion--a" />
    <view class="video-backdrop__motion video-backdrop__motion--b" />
    <view class="video-backdrop__haze" />
    <view class="video-backdrop__veil" />
    <view class="video-backdrop__tone" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import StaticFieldBackdrop from '@/components/backdrop/StaticFieldBackdrop.vue'
import { getSceneBackdropVideo } from '@/data/backdropVideos'

const props = defineProps<{
  sceneId: string
  active: boolean
  progress: number
  turning?: boolean
}>()

const failedClipId = ref('')
const videoReady = ref(false)

const sceneConfig = computed(() => getSceneBackdropVideo(props.sceneId))
const backdropMotionEnabled = computed(() => props.active && sceneConfig.value.playVideo)
const nativeVideoEnabled = computed(() => {
  return (
    backdropMotionEnabled.value &&
    failedClipId.value !== sceneConfig.value.clip.id &&
    isNativeVideoSource(sceneConfig.value.clip.src)
  )
})
const fallbackMotionEnabled = computed(() => {
  return backdropMotionEnabled.value && !nativeVideoEnabled.value
})
const backdropStyle = computed<Record<string, string>>(() => {
  const progressLift = Math.max(0, props.progress - 0.34)
  const turnLift = props.turning ? 0.08 : 0
  const veilOpacity = clamp(sceneConfig.value.veilOpacity + progressLift * 0.08 + turnLift, 0.42, 0.86)
  const hazeOpacity = clamp(sceneConfig.value.hazeOpacity + progressLift * 0.12 + turnLift * 0.78, 0.18, 0.70)

  return {
    '--video-veil-opacity': veilOpacity.toFixed(3),
    '--video-haze-opacity': hazeOpacity.toFixed(3)
  }
})

watch(
  () => sceneConfig.value.clip.id,
  () => {
    videoReady.value = false
    failedClipId.value = ''
  }
)

function handleVideoReady() {
  videoReady.value = true
}

function handleVideoError(error: unknown) {
  videoReady.value = false
  failedClipId.value = sceneConfig.value.clip.id
  console.warn('[Tongye video backdrop] video fallback', {
    id: sceneConfig.value.clip.id,
    src: sceneConfig.value.clip.src,
    errMsg: getVideoErrorMessage(error)
  }, error || '')
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isNativeVideoSource(src: string) {
  return /^(https?:\/\/|wxfile:\/\/|cloud:\/\/)/.test(src)
}

function getVideoErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const event = error as {
    detail?: { errMsg?: string }
    target?: { errMsg?: string }
  }
  return event.detail?.errMsg || event.target?.errMsg || ''
}
</script>

<style scoped lang="scss">
.video-backdrop {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  background: #080807;
  pointer-events: none;
}

.video-backdrop__static,
.video-backdrop__poster,
.video-backdrop__video,
.video-backdrop__motion,
.video-backdrop__haze,
.video-backdrop__veil,
.video-backdrop__tone {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.video-backdrop__static {
  z-index: 0;
  opacity: .82;
}

.video-backdrop__poster {
  z-index: 1;
  opacity: .62;
  transform: scale(1.01);
  transition: opacity .72s var(--ease-soft);
  will-change: transform, opacity;
}

.video-backdrop__video {
  z-index: 2;
  opacity: 0;
  object-fit: cover;
  transition: opacity .82s var(--ease-soft);
}

.video-backdrop__motion {
  z-index: 2;
  opacity: 0;
  mix-blend-mode: screen;
  transition: opacity .64s var(--ease-soft);
  will-change: transform, opacity;
}

.video-backdrop__motion--a {
  top: 18%;
  bottom: auto;
  left: -28%;
  right: -28%;
  height: 44%;
  background:
    repeating-linear-gradient(112deg, transparent 0 34rpx, rgba(233, 226, 210, .075) 35rpx, transparent 47rpx),
    linear-gradient(106deg, transparent, rgba(199, 177, 122, .26) 42%, rgba(233, 226, 210, .12) 51%, transparent);
  filter: blur(1.4rpx);
  transform: rotate(-10deg) translate3d(-4%, 0, 0);
}

.video-backdrop__motion--b {
  top: auto;
  bottom: 4%;
  left: -34%;
  right: -34%;
  height: 36%;
  background:
    repeating-linear-gradient(64deg, transparent 0 42rpx, rgba(199, 177, 122, .07) 43rpx, transparent 54rpx),
    linear-gradient(74deg, transparent, rgba(83, 112, 87, .22) 40%, rgba(199, 177, 122, .16), transparent);
  filter: blur(1.8rpx);
  transform: rotate(13deg) translate3d(5%, 0, 0);
}

.video-backdrop--enabled .video-backdrop__video {
  opacity: .54;
}

.video-backdrop--ready .video-backdrop__video {
  opacity: .74;
}

.video-backdrop--enabled .video-backdrop__poster {
  opacity: .38;
}

.video-backdrop--fallback-motion .video-backdrop__poster {
  opacity: .50;
  animation: video-poster-drift 8.8s ease-in-out infinite alternate;
}

.video-backdrop--fallback-motion .video-backdrop__motion--a {
  opacity: .34;
  animation: video-motion-a 6.8s var(--ease-soft) infinite alternate;
}

.video-backdrop--fallback-motion .video-backdrop__motion--b {
  opacity: .24;
  animation: video-motion-b 8.6s var(--ease-soft) infinite alternate-reverse;
}

.video-backdrop--ready .video-backdrop__poster {
  opacity: .28;
}

.video-backdrop__haze {
  z-index: 3;
  opacity: var(--video-haze-opacity);
  background:
    radial-gradient(ellipse at 46% 42%, rgba(233, 226, 210, .16) 0%, rgba(199, 177, 122, .07) 26%, transparent 58%),
    radial-gradient(ellipse at 60% 82%, rgba(8, 8, 7, .74) 0%, rgba(8, 8, 7, .34) 42%, transparent 70%),
    linear-gradient(115deg, rgba(8, 8, 7, .18), rgba(233, 226, 210, .045) 48%, rgba(8, 8, 7, .22));
  transition: opacity .54s var(--ease-soft);
}

.video-backdrop--enabled .video-backdrop__haze {
  animation: video-haze-breathe 7.4s ease-in-out infinite alternate;
}

.video-backdrop__veil {
  z-index: 4;
  opacity: var(--video-veil-opacity);
  background:
    radial-gradient(ellipse at 47% 39%, rgba(8, 8, 7, .62) 0%, rgba(8, 8, 7, .40) 34%, rgba(8, 8, 7, .18) 58%, rgba(8, 8, 7, .52) 100%),
    linear-gradient(180deg, rgba(8, 8, 7, .72) 0%, rgba(8, 8, 7, .20) 38%, rgba(8, 8, 7, .78) 100%),
    linear-gradient(90deg, rgba(8, 8, 7, .48), transparent 42%, rgba(8, 8, 7, .54));
  transition: opacity .54s var(--ease-soft);
}

.video-backdrop__tone {
  z-index: 5;
  opacity: .34;
  background:
    linear-gradient(135deg, rgba(199, 177, 122, .12), transparent 42%),
    radial-gradient(circle at 18% 22%, rgba(199, 177, 122, .12), transparent 36%),
    radial-gradient(circle at 88% 78%, rgba(18, 58, 50, .18), transparent 42%);
}

.video-backdrop--entry .video-backdrop__tone {
  opacity: .42;
  background:
    linear-gradient(120deg, rgba(199, 177, 122, .14), transparent 44%),
    radial-gradient(circle at 76% 70%, rgba(199, 177, 122, .16), transparent 36%);
}

.video-backdrop--ring .video-backdrop__tone {
  opacity: .48;
  background:
    radial-gradient(circle at 48% 42%, rgba(199, 177, 122, .15), transparent 34%),
    linear-gradient(180deg, rgba(8, 8, 7, .24), transparent 44%, rgba(8, 8, 7, .30));
}

.video-backdrop--pipeline .video-backdrop__tone {
  opacity: .46;
  background:
    linear-gradient(0deg, rgba(8, 8, 7, .46), transparent 40%),
    radial-gradient(circle at 50% 86%, rgba(199, 177, 122, .16), transparent 38%);
}

.video-backdrop--conversion .video-backdrop__poster {
  opacity: .22;
}

.video-backdrop--conversion .video-backdrop__tone {
  opacity: .58;
  background:
    linear-gradient(180deg, rgba(8, 8, 7, .30), rgba(8, 8, 7, .64)),
    radial-gradient(circle at 50% 80%, rgba(199, 177, 122, .08), transparent 42%);
}

@keyframes video-poster-drift {
  0% {
    transform: scale(1.06) translate3d(-1.5%, -1%, 0);
  }

  100% {
    transform: scale(1.11) translate3d(1.6%, 1.2%, 0);
  }
}

@keyframes video-motion-a {
  0% {
    transform: rotate(-13deg) translate3d(-8%, -4%, 0) scaleX(1);
  }

  100% {
    transform: rotate(-7deg) translate3d(8%, 4%, 0) scaleX(1.08);
  }
}

@keyframes video-motion-b {
  0% {
    transform: rotate(16deg) translate3d(8%, 4%, 0) scaleX(.96);
  }

  100% {
    transform: rotate(10deg) translate3d(-7%, -3%, 0) scaleX(1.08);
  }
}

@keyframes video-haze-breathe {
  0% {
    transform: scale(1);
  }

  100% {
    transform: scale(1.05);
  }
}
</style>
