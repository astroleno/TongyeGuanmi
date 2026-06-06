import { ref } from 'vue'

export interface SoftSceneSnapOptions {
  duration?: number
  debounceMs?: number
  threshold?: number
  getActiveSceneId: () => string
  getSnapFromSceneId?: () => string
  sceneTopFor: (sceneId: string) => number
  isEnabled: () => boolean
  onSnapStart?: (toSceneId: string, fromSceneId: string) => void
  onSnapEnd?: (sceneId: string) => void
}

export const useSoftSceneSnap = (options: SoftSceneSnapOptions) => {
  const duration = options.duration ?? 620
  const debounceMs = options.debounceMs ?? 180
  const threshold = options.threshold ?? 16
  const isSnapping = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null
  let lastScrollTop = 0
  let ignoreScrollUntil = 0

  const clearDebounce = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const clearEndTimer = () => {
    if (endTimer) {
      clearTimeout(endTimer)
      endTimer = null
    }
  }

  const cancelPending = () => {
    clearDebounce()
    clearEndTimer()
    isSnapping.value = false
    ignoreScrollUntil = 0
  }

  const snapTo = (targetSceneId: string, fromSceneId?: string | null) => {
    if (!targetSceneId || !options.isEnabled()) return false

    const scrollTop = options.sceneTopFor(targetSceneId)
    const currentSceneId = fromSceneId || options.getSnapFromSceneId?.() || options.getActiveSceneId()
    const alreadyClose = Math.abs(scrollTop - lastScrollTop) <= threshold
    const shouldTurnText = currentSceneId !== targetSceneId

    clearDebounce()
    clearEndTimer()

    if (alreadyClose) {
      if (shouldTurnText) {
        isSnapping.value = true
        ignoreScrollUntil = Date.now() + duration + 160
        options.onSnapStart?.(targetSceneId, currentSceneId)
        endTimer = setTimeout(() => {
          isSnapping.value = false
          options.onSnapEnd?.(targetSceneId)
        }, duration + 80)
        return true
      }

      options.onSnapEnd?.(targetSceneId)
      return false
    }

    isSnapping.value = true
    ignoreScrollUntil = Date.now() + duration + 160
    if (shouldTurnText) {
      options.onSnapStart?.(targetSceneId, currentSceneId)
    }

    uni.pageScrollTo({
      scrollTop,
      duration,
    })

    endTimer = setTimeout(() => {
      isSnapping.value = false
      options.onSnapEnd?.(targetSceneId)
    }, duration + 80)

    return true
  }

  const handleScroll = (scrollTop: number) => {
    lastScrollTop = scrollTop

    if (!options.isEnabled()) {
      cancelPending()
      return
    }

    if (Date.now() < ignoreScrollUntil) return

    clearDebounce()
    debounceTimer = setTimeout(() => {
      snapTo(options.getActiveSceneId())
    }, debounceMs)
  }

  return {
    isSnapping,
    handleScroll,
    snapTo,
    cancelPending,
  }
}
