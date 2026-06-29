/**
 * iOS 26 顶部整行毛玻璃导航 — 辅助脚本
 * 零依赖，不修改任何现有 DOM 结构
 * 通过添加 class 自动注入毛玻璃层
 */
(function () {
  'use strict';

  const NAV_SELECTOR = '.site-nav';
  const GLASS_CLASS = 'ios26-glass-enabled';
  const LIGHT_CLASS = 'is-on-light';
  const TONE_ATTR = 'data-tone';

  const config = {
    autoEnable: true,           // 是否自动启用
    respectReducedMotion: true, // 是否尊重 prefers-reduced-motion
  };

  let nav = null;
  let glassBar = null;
  let glassTransition = null;

  function init() {
    nav = document.querySelector(NAV_SELECTOR);
    if (!nav) {
      console.warn('[iOS26 Glass Nav] .site-nav not found. Skipping.');
      return;
    }

    if (config.respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const supportsBackdrop = CSS.supports('backdrop-filter', 'blur(1px)')
                          || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
    if (!supportsBackdrop) {
      console.warn('[iOS26 Glass Nav] backdrop-filter not supported. Skipping.');
      return;
    }

    injectGlassLayers();

    if (config.autoEnable) {
      nav.classList.add(GLASS_CLASS);
    }

    observeTone();
  }

  function injectGlassLayers() {
    if (nav.querySelector('.ios26-glass-bar')) return;

    // 毛玻璃主条（导航栏本身）
    glassBar = document.createElement('div');
    glassBar.className = 'ios26-glass-bar';
    glassBar.setAttribute('aria-hidden', 'true');
    nav.insertBefore(glassBar, nav.firstChild);

    // 下方过渡带
    glassTransition = document.createElement('div');
    glassTransition.className = 'ios26-glass-transition';
    glassTransition.setAttribute('aria-hidden', 'true');
    nav.appendChild(glassTransition);
  }

  function observeTone() {
    const observer = new MutationObserver(() => {
      const isLight = nav.classList.contains(LIGHT_CLASS) || nav.getAttribute(TONE_ATTR) === 'light';
      if (glassBar) glassBar.classList.toggle('is-light', isLight);
      if (glassTransition) glassTransition.classList.toggle('is-light', isLight);
    });

    observer.observe(nav, {
      attributes: true,
      attributeFilter: ['class', 'data-tone']
    });

    // 初始状态
    const isLight = nav.classList.contains(LIGHT_CLASS) || nav.getAttribute(TONE_ATTR) === 'light';
    if (glassBar) glassBar.classList.toggle('is-light', isLight);
    if (glassTransition) glassTransition.classList.toggle('is-light', isLight);
  }

  // 暴露 API
  window.iOS26GlassNav = {
    enable() {
      if (nav) nav.classList.add(GLASS_CLASS);
    },
    disable() {
      if (nav) nav.classList.remove(GLASS_CLASS);
    },
    toggle() {
      if (nav) nav.classList.toggle(GLASS_CLASS);
    },
    setLight(isLight) {
      if (glassBar) glassBar.classList.toggle('is-light', isLight);
      if (glassTransition) glassTransition.classList.toggle('is-light', isLight);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();