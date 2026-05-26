import { computed, ref } from 'vue'

export function useSceneMetrics() {
  const windowHeight = ref(812)
  const windowWidth = ref(375)
  const statusBarHeight = ref(44)
  const menuTop = ref(52)
  const menuHeight = ref(32)
  const menuRight = ref(16)

  function refreshSystemMetrics() {
    try {
      const uniAny = uni as any
      const info = typeof uniAny.getWindowInfo === 'function'
        ? uniAny.getWindowInfo()
        : getBrowserWindowInfo()
      windowHeight.value = info.windowHeight || 812
      windowWidth.value = info.windowWidth || 375
      statusBarHeight.value = info.statusBarHeight || 44

      const menu = uni.getMenuButtonBoundingClientRect?.()
      if (menu) {
        menuTop.value = menu.top || menuTop.value
        menuHeight.value = menu.height || menuHeight.value
        menuRight.value = Math.max(12, windowWidth.value - (menu.left || windowWidth.value - 88))
      }
    } catch {
      windowHeight.value = 812
      windowWidth.value = 375
    }
  }

  const headerTop = computed(() => Math.max(statusBarHeight.value + 8, menuTop.value))
  const headerHeight = computed(() => Math.max(menuHeight.value, 32))
  const contentTopPadding = computed(() => headerTop.value + headerHeight.value + 42)
  const menuAvoidRight = computed(() => menuRight.value + 112)

  return {
    windowHeight,
    windowWidth,
    statusBarHeight,
    headerTop,
    headerHeight,
    contentTopPadding,
    menuAvoidRight,
    refreshSystemMetrics
  }
}

function getBrowserWindowInfo() {
  if (typeof window !== 'undefined') {
    return {
      windowHeight: window.innerHeight,
      windowWidth: window.innerWidth,
      statusBarHeight: 44
    }
  }

  return {
    windowHeight: 812,
    windowWidth: 375,
    statusBarHeight: 44
  }
}
