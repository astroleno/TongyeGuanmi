/**
 * iOS 26 Progressive Blur — 轻量辅助脚本
 * 功能：根据滚动位置自动切换导航栏的渐进模糊效果
 * 不修改任何现有 DOM 结构，仅通过添加/移除 class 工作。
 */

(function () {
  'use strict';

  const NAV_SELECTOR = '.site-nav';
  const BLUR_CLASS = 'ios26-blur-enabled';
  const LIGHT_CLASS = 'is-on-light';
  const TONE_ATTR = 'data-tone';

  // 可配置项
  const config = {
    // 滚动多少 px 后启用模糊（0 = 立即启用）
    scrollThreshold: 0,
    // 是否自动检测下方内容亮度并切换 tint 色调
    autoTone: true,
    // 降低动画：如用户偏好，可禁用模糊以节省性能
    respectReducedMotion: true
  };

  let nav = null;
  let blurOverlay = null;
  let ticking = false;
  let isBlurred = false;

  function init() {
    nav = document.querySelector(NAV_SELECTOR);
    if (!nav) {
      console.warn('[iOS26 Progressive Blur] .site-nav not found. Skipping.');
      return;
    }

    // 检查是否应禁用（prefers-reduced-motion）
    if (config.respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // 检查浏览器支持
    if (!CSS.supports('backdrop-filter', 'blur(1px)') && !CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) {
      console.warn('[iOS26 Progressive Blur] backdrop-filter not supported. Skipping.');
      return;
    }

    // 注入模糊层 DOM（如果尚未存在）
    injectBlurOverlay();

    // 初始状态
    updateState();

    // 监听滚动
    window.addEventListener('scroll', onScroll, { passive: true });

    // 可选：监听 section 主题变化（如果你的 site-nav 有 data-tone 切换逻辑）
    if (config.autoTone) {
      observeToneChanges();
    }
  }

  function injectBlurOverlay() {
    if (nav.querySelector('.ios26-progressive-blur')) return;

    blurOverlay = document.createElement('div');
    blurOverlay.className = 'ios26-progressive-blur';
    blurOverlay.setAttribute('aria-hidden', 'true');

    // 7 层模糊
    for (let i = 0; i < 7; i++) {
      const layer = document.createElement('div');
      layer.className = 'ios26-progressive-blur__layer';
      blurOverlay.appendChild(layer);
    }

    // 1 层 tint
    const tint = document.createElement('div');
    tint.className = 'ios26-progressive-blur__tint';
    blurOverlay.appendChild(tint);

    nav.insertBefore(blurOverlay, nav.firstChild);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateState();
      ticking = false;
    });
  }

  function updateState() {
    const scrollY = window.scrollY || window.pageYOffset;
    const shouldBlur = scrollY > config.scrollThreshold;

    if (shouldBlur && !isBlurred) {
      nav.classList.add(BLUR_CLASS);
      isBlurred = true;
    } else if (!shouldBlur && isBlurred) {
      nav.classList.remove(BLUR_CLASS);
      isBlurred = false;
    }

    if (config.autoTone && isBlurred) {
      updateTone();
    }
  }

  function updateTone() {
    // 简单检测：如果 nav 当前有 is-on-light 或 data-tone="light"，
    // 就给 blur overlay 添加 is-light 类以切换 tint 颜色
    const isLight = nav.classList.contains(LIGHT_CLASS) || nav.getAttribute(TONE_ATTR) === 'light';
    if (blurOverlay) {
      blurOverlay.classList.toggle('is-light', isLight);
    }
  }

  function observeToneChanges() {
    // 使用 MutationObserver 监听 nav 的 class/attribute 变化
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && isBlurred) {
          updateTone();
        }
      }
    });

    observer.observe(nav, {
      attributes: true,
      attributeFilter: ['class', 'data-tone']
    });
  }

  // 暴露极简 API
  window.iOS26ProgressiveBlur = {
    enable() {
      if (nav) nav.classList.add(BLUR_CLASS);
    },
    disable() {
      if (nav) nav.classList.remove(BLUR_CLASS);
    },
    toggle() {
      if (nav) nav.classList.toggle(BLUR_CLASS);
    },
    setTone(light) {
      if (blurOverlay) blurOverlay.classList.toggle('is-light', light);
    }
  };

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
