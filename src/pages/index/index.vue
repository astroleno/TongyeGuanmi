<template>
  <view class="home-page">
    <SceneBackdrop
      :scene-id="activeSceneId"
      :scene-index="activeSceneIndex"
      :active="true"
      :progress="activeSceneProgress"
      :variant="backdropVariant"
    />
    <TypographicFieldOverlay
      :scene-id="activeSceneId"
      :enabled="typographicFxEnabled && typographicScenes.includes(activeSceneId)"
      :progress="pageProgress"
    />
    <BrandHeader />
    <ScrollIndicator v-if="activeSceneId !== 'lead'" :progress="pageProgress" />
    <SceneEntry
      :scene="sceneMap.entry"
      :active="activeSceneId === 'entry'"
      :progress="progressFor('entry')"
      @cta="handleCta"
    />
    <SceneHero
      :scene="sceneMap.hero"
      :active="activeSceneId === 'hero'"
      :progress="progressFor('hero')"
      @cta="handleCta"
    />
    <SceneBrandMeaning
      :scene="sceneMap.about"
      :active="activeSceneId === 'about'"
      :progress="progressFor('about')"
      @cta="handleCta"
    />
    <SceneFieldMap
      :scene="sceneMap['field-map']"
      :active="activeSceneId === 'field-map'"
      :progress="progressFor('field-map')"
      @cta="handleCta"
      @target="handleFieldTarget"
    />
    <SceneOrganization
      :scene="sceneMap.organization"
      :active="activeSceneId === 'organization'"
      :progress="progressFor('organization')"
      @cta="handleCta"
    />
    <SceneCanvasAgent
      :scene="sceneMap['canvas-agent']"
      :active="activeSceneId === 'canvas-agent'"
      :progress="progressFor('canvas-agent')"
      @cta="handleCta"
    />
    <SceneVideoPipeline
      :scene="sceneMap['video-pipeline']"
      :active="activeSceneId === 'video-pipeline'"
      :progress="progressFor('video-pipeline')"
      @cta="handleCta"
    />
    <ScenePersonalCapability
      :scene="sceneMap.personal"
      :active="activeSceneId === 'personal'"
      :progress="progressFor('personal')"
      @cta="handleCta"
    />
    <SceneMethod
      :scene="sceneMap.method"
      :active="activeSceneId === 'method'"
      :progress="progressFor('method')"
      @cta="handleCta"
    />
    <SceneProjectGallery
      :scene="sceneMap.projects"
      :active="activeSceneId === 'projects'"
      :progress="progressFor('projects')"
      @project="openModal"
    />
    <SceneServicePackages
      :scene="sceneMap['service-packages']"
      :active="activeSceneId === 'service-packages'"
      :progress="progressFor('service-packages')"
      :expanded-id="expandedServiceId"
      @cta="handleCta"
      @toggle="toggleService"
      @select="selectService"
    />
    <SceneLead
      :scene="sceneMap.lead"
      :active="activeSceneId === 'lead'"
      :progress="progressFor('lead')"
      :form="lead.form"
      :submitting="lead.submitting.value"
      :error="lead.error.value"
      :success-lead-id="lead.successLeadId.value"
      @submit="submitLeadForm"
    />

    <view v-if="activeModal" class="modal-mask" @click="closeModal">
      <view class="modal-sheet" @click.stop>
        <view class="modal-sheet__bar" />
        <text class="modal-sheet__title">{{ activeModal.title }}</text>
        <text class="modal-sheet__summary">{{ activeModal.summary }}</text>
        <view class="modal-sheet__points">
          <text v-for="point in activeModal.points" :key="point" class="modal-sheet__point">{{ point }}</text>
        </view>
        <button class="modal-sheet__close" @click="closeModal">关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { onPageScroll, onReady, onResize } from '@dcloudio/uni-app'
import BrandHeader from '@/components/app/BrandHeader.vue'
import ScrollIndicator from '@/components/app/ScrollIndicator.vue'
import SceneBackdrop from '@/components/backdrop/SceneBackdrop.vue'
import TypographicFieldOverlay from '@/components/fx/TypographicFieldOverlay.vue'
import SceneBrandMeaning from '@/components/scenes/SceneBrandMeaning.vue'
import SceneCanvasAgent from '@/components/scenes/SceneCanvasAgent.vue'
import SceneEntry from '@/components/scenes/SceneEntry.vue'
import SceneFieldMap from '@/components/scenes/SceneFieldMap.vue'
import SceneHero from '@/components/scenes/SceneHero.vue'
import SceneLead from '@/components/scenes/SceneLead.vue'
import SceneMethod from '@/components/scenes/SceneMethod.vue'
import SceneOrganization from '@/components/scenes/SceneOrganization.vue'
import ScenePersonalCapability from '@/components/scenes/ScenePersonalCapability.vue'
import SceneProjectGallery from '@/components/scenes/SceneProjectGallery.vue'
import SceneServicePackages from '@/components/scenes/SceneServicePackages.vue'
import SceneVideoPipeline from '@/components/scenes/SceneVideoPipeline.vue'
import { DEFAULT_BACKDROP_VARIANT, PRETEXT_MODE } from '@/config/runtime'
import { useLeadForm } from '@/composables/useLeadForm'
import { usePageScroll } from '@/composables/usePageScroll'
import { useSceneMetrics } from '@/composables/useSceneMetrics'
import { modalContentMap } from '@/data/projects'
import { sceneRegistry } from '@/data/sceneRegistry'
import { servicePackages, type ServicePackage } from '@/data/services'
import type { LeadDirection } from '@/types/lead'
import type { ModalContent, SceneRegistryItem } from '@/types/scene'

const sceneMap = Object.fromEntries(sceneRegistry.map((scene) => [scene.id, scene])) as Record<string, SceneRegistryItem>
const backdropVariant = DEFAULT_BACKDROP_VARIANT
const pretextMode = PRETEXT_MODE
const typographicFxEnabled = pretextMode === 'inspired'
const typographicScenes = ['entry', 'hero', 'about', 'field-map', 'organization', 'canvas-agent', 'video-pipeline', 'personal', 'method', 'projects']

const metrics = useSceneMetrics()
const scroll = usePageScroll(sceneRegistry)
const lead = useLeadForm()

const expandedServiceId = ref<ServicePackage['id']>('ai-transformation')
const activeModal = ref<ModalContent | null>(null)

const activeSceneId = computed(() => scroll.activeSceneId.value)
const pageProgress = computed(() => scroll.pageProgress.value)
const activeSceneIndex = computed(() => Math.max(0, sceneRegistry.findIndex((scene) => scene.id === activeSceneId.value)))
const activeSceneProgress = computed(() => progressFor(activeSceneId.value))

onMounted(refreshMetrics)
onReady(refreshMetrics)
onResize(refreshMetrics)

onPageScroll((event) => {
  scroll.update(event.scrollTop || 0)
})

function refreshMetrics() {
  metrics.refreshSystemMetrics()
  scroll.setWindowHeight(metrics.windowHeight.value)
  void nextTick(() => {
    setTimeout(measureScenes, 60)
  })
}

function measureScenes() {
  const query = uni.createSelectorQuery()
  query
    .selectAll('.scene-shell')
    .boundingClientRect((rects) => {
      const boxes = (Array.isArray(rects) ? rects : []) as Array<{ top: number; height: number }>
      if (boxes.length !== sceneRegistry.length) return
      scroll.setSceneMetrics(
        boxes.map((box, index) => ({
          id: sceneRegistry[index].id,
          top: box.top + scroll.scrollTop.value,
          height: Math.max(metrics.windowHeight.value, box.height || metrics.windowHeight.value)
        }))
      )
    })
    .exec()
}

function progressFor(sceneId: string) {
  return scroll.progressFor(sceneId)
}

function handleCta(scene: SceneRegistryItem) {
  if (scene.ctaAction === 'scroll' && scene.ctaTarget) {
    applyLeadIntent(scene.id)
    scrollToScene(scene.ctaTarget)
    return
  }

  if (scene.ctaAction === 'modal' && scene.ctaTarget) {
    openModal(scene.ctaTarget)
    return
  }

  if (scene.ctaAction === 'submit') {
    void submitLeadForm()
  }
}

function handleFieldTarget(target: string, direction: LeadDirection) {
  lead.setDirection(direction)
  scrollToScene(target)
}

function applyLeadIntent(sceneId: string) {
  if (sceneId === 'organization') lead.setDirection('enterprise')
  if (sceneId === 'personal') lead.setDirection('personal')
  if (sceneId === 'service-packages') {
    const service = servicePackages.find((item) => item.id === expandedServiceId.value)
    lead.setDirection(service?.direction || 'other')
  }
}

function toggleService(id: ServicePackage['id']) {
  expandedServiceId.value = expandedServiceId.value === id ? 'ai-transformation' : id
}

function selectService(id: ServicePackage['id']) {
  expandedServiceId.value = id
  const service = servicePackages.find((item) => item.id === id)
  lead.setDirection(service?.direction || 'other')
  scrollToScene('lead')
}

function scrollToScene(target: string) {
  const index = sceneRegistry.findIndex((scene) => scene.id === target)
  if (index < 0) return
  uni.pageScrollTo({
    scrollTop: scroll.sceneTopFor(target),
    duration: 620
  })
}

function openModal(modalId: string) {
  activeModal.value = modalContentMap[modalId] || {
    id: modalId,
    title: '项目样片',
    summary: '这里展示当前项目如何从概念进入真实现场。',
    points: ['场景判断', '原型与流程', '交付与复盘']
  }
}

function closeModal() {
  activeModal.value = null
}

async function submitLeadForm() {
  await lead.submit('lead')
}
</script>

<style scoped lang="scss">
.home-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--c-obsidian);
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  padding: 0 24rpx 24rpx;
  background: rgba(0, 0, 0, .42);
}

.modal-sheet {
  width: 100%;
  padding: 22rpx 28rpx 30rpx;
  border: 1rpx solid rgba(233, 226, 210, .16);
  border-radius: 28rpx;
  background: rgba(18, 20, 18, .94);
  box-shadow: 0 -18rpx 80rpx rgba(0, 0, 0, .46);
}

.modal-sheet__bar {
  width: 72rpx;
  height: 6rpx;
  margin: 0 auto 26rpx;
  border-radius: 999rpx;
  background: rgba(233, 226, 210, .22);
}

.modal-sheet__title {
  display: block;
  color: var(--c-ivory);
  font-size: 34rpx;
  line-height: 1.34;
}

.modal-sheet__summary {
  display: block;
  margin-top: 16rpx;
  color: rgba(233, 226, 210, .66);
  font-size: 24rpx;
  line-height: 1.58;
}

.modal-sheet__points {
  display: grid;
  gap: 12rpx;
  margin-top: 24rpx;
}

.modal-sheet__point {
  padding-left: 22rpx;
  color: rgba(233, 226, 210, .72);
  font-size: 23rpx;
  line-height: 1.45;
  border-left: 3rpx solid var(--c-acid-dot);
}

.modal-sheet__close {
  width: 100%;
  min-height: 72rpx;
  margin-top: 28rpx;
  border-radius: 999rpx;
  color: #15130e;
  background: var(--c-ivory);
  font-size: 24rpx;
}
</style>
