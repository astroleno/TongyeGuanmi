import { computed, ref } from 'vue'
import type { SceneRegistryItem } from '@/types/scene'

export function usePageScroll(scenes: SceneRegistryItem[]) {
  const scrollTop = ref(0)
  const pageProgress = ref(0)
  const activeSceneId = ref(scenes[0]?.id || 'entry')
  const sceneProgressMap = ref<Record<string, number>>({})
  const windowHeight = ref(812)
  const sceneMetrics = ref<Array<{ id: string; top: number; height: number }>>([])
  let lastUpdate = 0

  const activeScene = computed(
    () => scenes.find((scene) => scene.id === activeSceneId.value) || scenes[0]
  )

  function setWindowHeight(value: number) {
    windowHeight.value = Math.max(1, value)
    update(scrollTop.value, true)
  }

  function setSceneMetrics(metrics: Array<{ id: string; top: number; height: number }>) {
    sceneMetrics.value = metrics
    update(scrollTop.value, true)
  }

  function update(nextScrollTop: number, force = false) {
    const now = Date.now()
    if (!force && now - lastUpdate < 32) return
    lastUpdate = now

    scrollTop.value = Math.max(0, nextScrollTop)
    const metrics = sceneMetrics.value
    const lastMetric = metrics[metrics.length - 1]
    const totalHeight = lastMetric ? lastMetric.top + lastMetric.height : windowHeight.value * scenes.length
    const maxScroll = Math.max(1, totalHeight - windowHeight.value)
    pageProgress.value = clamp(scrollTop.value / maxScroll)

    const activeIndex = metrics.length === scenes.length
      ? findActiveIndex(metrics, scrollTop.value + windowHeight.value * 0.42)
      : Math.min(scenes.length - 1, Math.max(0, Math.round(scrollTop.value / windowHeight.value)))
    activeSceneId.value = scenes[activeIndex]?.id || scenes[0]?.id || 'entry'

    const sparseProgress: Record<string, number> = {}
    for (let index = Math.max(0, activeIndex - 1); index <= Math.min(scenes.length - 1, activeIndex + 1); index += 1) {
      const scene = scenes[index]
      if (scene) {
        const metric = metrics[index]
        const top = metric?.top ?? index * windowHeight.value
        const height = metric?.height ?? windowHeight.value
        sparseProgress[scene.id] = clamp((scrollTop.value - top) / Math.max(1, height))
      }
    }
    sceneProgressMap.value = sparseProgress
  }

  function progressFor(sceneId: string) {
    return sceneProgressMap.value[sceneId] || 0
  }

  function sceneTopFor(sceneId: string) {
    const metric = sceneMetrics.value.find((item) => item.id === sceneId)
    if (metric) return metric.top
    const index = Math.max(0, scenes.findIndex((scene) => scene.id === sceneId))
    return index * windowHeight.value
  }

  return {
    scrollTop,
    pageProgress,
    activeSceneId,
    activeScene,
    sceneProgressMap,
    setWindowHeight,
    setSceneMetrics,
    sceneTopFor,
    update,
    progressFor
  }
}

function findActiveIndex(metrics: Array<{ top: number; height: number }>, probeY: number) {
  let active = 0
  for (let index = 0; index < metrics.length; index += 1) {
    if (probeY >= metrics[index].top) active = index
  }
  return active
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}
