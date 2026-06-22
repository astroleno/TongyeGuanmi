const DEFAULT_OPTIONS = {
  lerp: 0.08,
  smoothWheel: true,
  syncTouch: false,
  wheelMultiplier: 0.82,
  touchMultiplier: 1
};

function getSnapOffset() {
  return Math.round(window.innerHeight * 0.2);
}

function shouldHandleAnchor(link) {
  if (!link || link.origin !== window.location.origin || link.pathname !== window.location.pathname) return false;
  return link.hash && link.hash.length > 1;
}

function getAnchorTarget(hash) {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

function alignInitialHash(lenis, hash = window.location.hash) {
  const target = getAnchorTarget(hash);
  if (!target) return;

  lenis.scrollTo(target, {
    offset: -getSnapOffset(),
    immediate: true,
    force: true
  });
}

function scheduleInitialHashAlignment(lenis) {
  const hash = window.location.hash;
  if (!getAnchorTarget(hash)) return () => {};

  const timers = [];
  const align = () => alignInitialHash(lenis, hash);
  requestAnimationFrame(() => requestAnimationFrame(align));
  [240, 900, 1800, 3200, 5200].forEach((delay) => {
    timers.push(window.setTimeout(align, delay));
  });

  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

export function initSmoothScroll({
  root = document.documentElement,
  body = document.body,
  reduceMotion = false,
  options = {}
} = {}) {
  const { gsap, ScrollTrigger, Lenis } = window;

  gsap?.ticker?.lagSmoothing?.(0);

  if (reduceMotion || !gsap || !ScrollTrigger || !Lenis) {
    return {
      lenis: null,
      destroy() {}
    };
  }

  const lenis = new window.Lenis({
    ...DEFAULT_OPTIONS,
    ...options
  });

  const tick = (time) => {
    lenis.raf(time * 1000);
  };

  const onAnchorClick = (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    const link = eventTarget?.closest('a[href^="#"]');
    if (!shouldHandleAnchor(link)) return;

    const target = getAnchorTarget(link.hash);
    if (!target) return;

    event.preventDefault();
    history.pushState(null, '', link.hash);

    lenis.scrollTo(target, {
      offset: -getSnapOffset(),
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
    });
  };

  body.classList.add('is-lenis-active');
  root.classList.add('is-lenis-active');
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  document.addEventListener('click', onAnchorClick);
  const cancelInitialHashAlignment = scheduleInitialHashAlignment(lenis);

  return {
    lenis,
    destroy() {
      cancelInitialHashAlignment();
      document.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      lenis.off('scroll', ScrollTrigger.update);
      lenis.destroy();
      body.classList.remove('is-lenis-active');
      root.classList.remove('is-lenis-active');
    }
  };
}
