import { ref } from 'vue'

export interface SceneTurnTransitionOptions {
  duration?: number
}

const now = () => Date.now()

const requestFrame = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  return setTimeout(callback, 16) as unknown as number
}

const cancelFrame = (handle: number) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

export const useSceneTurnTransition = (options: SceneTurnTransitionOptions = {}) => {
  const duration = options.duration ?? 620
  const fromSceneId = ref<string | null>(null)
  const toSceneId = ref<string | null>(null)
  const turning = ref(false)
  const settled = ref(true)
  const progress = ref(1)

  let frameHandle: number | null = null
  let startedAt = 0

  const clearFrame = () => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle)
      frameHandle = null
    }
  }

  const finish = () => {
    clearFrame()
    progress.value = 1
    turning.value = false
    settled.value = true
    fromSceneId.value = toSceneId.value
  }

  const tick = () => {
    const elapsed = now() - startedAt
    progress.value = Math.min(1, elapsed / duration)

    if (progress.value >= 1) {
      finish()
      return
    }

    frameHandle = requestFrame(tick)
  }

  const start = (nextSceneId: string, previousSceneId?: string | null) => {
    if (!nextSceneId) return

    if (turning.value && toSceneId.value === nextSceneId) return

    clearFrame()
    fromSceneId.value = previousSceneId || toSceneId.value || nextSceneId
    toSceneId.value = nextSceneId
    turning.value = true
    settled.value = false
    progress.value = 0
    startedAt = now()
    frameHandle = requestFrame(tick)
  }

  const markSettled = (sceneId?: string | null) => {
    clearFrame()
    const settledSceneId = sceneId || toSceneId.value || fromSceneId.value
    fromSceneId.value = settledSceneId
    toSceneId.value = settledSceneId
    turning.value = false
    settled.value = true
    progress.value = 1
  }

  return {
    fromSceneId,
    toSceneId,
    turning,
    settled,
    progress,
    start,
    markSettled,
  }
}
