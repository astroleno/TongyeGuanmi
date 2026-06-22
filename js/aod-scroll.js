import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const VIDEO_DURATION_FALLBACK = 5.03;
const TRANSITION_DURATION_SECONDS = 2;
const FULLSCREEN_SCALE_START_SECONDS = 0;
const FULLSCREEN_SCALE_END_SECONDS = 0.6;
const BACKDROP_EXIT_START_SECONDS = 0;
const BACKDROP_EXIT_END_SECONDS = 0.5;
const FIGURE_START_SCALE = 0.62;
const FIGURE_START_Y_VH = 7.5;

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-aod-stage]');
const sunLayer = document.querySelector('.aod-layer--sun');
const cloudLayer = document.querySelector('.aod-layer--cloud');
const figureLayer = document.querySelector('[data-aod-figure-layer]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollRuntime = null;
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = -1;
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;
let scrollTriggerInstance = null;
let touchStartY = 0;
let nativeTweenFrame = 0;
let progressTween = null;
const playhead = { raw: 0, video: 0 };
const videoSeekProgress = new WeakMap();

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function easeOutCubic(value) {
  const p = clamp(value, 0, 1);
  return 1 - Math.pow(1 - p, 3);
}

function range01(value, start, end) {
  return clamp((value - start) / (end - start), 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function transitionSecondsRange(progress, startSeconds, endSeconds) {
  return range01(progress, startSeconds / TRANSITION_DURATION_SECONDS, endSeconds / TRANSITION_DURATION_SECONDS);
}

function fullscreenProgress(progress) {
  return smoothStep(transitionSecondsRange(progress, FULLSCREEN_SCALE_START_SECONDS, FULLSCREEN_SCALE_END_SECONDS));
}

function prepareFigureVideo(video) {
  if (!video) return;
  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.pause();
  video.load();
}

function getVideoDuration(video) {
  return Number.isFinite(video?.duration) && video.duration > 0
    ? video.duration
    : VIDEO_DURATION_FALLBACK;
}

function seekVideo(video, progress) {
  if (!video || video.readyState < 1) return;
  const p = stableProgress(progress);
  const lastProgress = videoSeekProgress.get(video) ?? -1;
  if (Math.abs(lastProgress - p) < 0.003) return;

  const duration = getVideoDuration(video);
  const targetTime = Math.min(duration - 0.02, Math.max(0, p * duration));
  if (Math.abs(video.currentTime - targetTime) < 0.016) {
    videoSeekProgress.set(video, p);
    return;
  }

  try {
    video.currentTime = targetTime;
    videoSeekProgress.set(video, p);
  } catch {
    // WebKit can reject seeks before metadata fully settles.
  }
}

function waitForVideoMetadata(video) {
  if (!video || video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('canplay', finish);
      video.removeEventListener('error', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 1400);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

function stopDirectPlayback() {
  figureLayer?.pause?.();
}

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src.endsWith(src))) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);

    function finish(ok, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      ok ? resolve(value) : reject(value);
    }

    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadRequiredLibraries() {
  return Promise.resolve()
    .then(() => (window.gsap ? undefined : loadScript(CDN.gsap)))
    .then(() => (window.ScrollTrigger ? undefined : loadScript(CDN.scrollTrigger)))
    .then(() => (window.Lenis ? undefined : loadScript(CDN.lenis).catch((error) => {
      console.warn('Lenis unavailable, keeping native scroll.', error);
    })))
    .then(() => {
      if (!window.gsap || !window.ScrollTrigger) {
        throw new Error('GSAP ScrollTrigger unavailable.');
      }
    });
}

function createGsapSetters(gsap) {
  gsap.set([sunLayer, cloudLayer], {
    xPercent: -50,
    yPercent: -50,
    scale: 1,
    transformOrigin: '50% 50%',
    force3D: true
  });
  gsap.set(figureLayer, {
    xPercent: 0,
    yPercent: 0,
    x: 0,
    y: 0,
    scale: 1,
    transformOrigin: '50% 50%',
    force3D: true
  });

  return {
    sunX: gsap.quickSetter(sunLayer, 'x', 'px'),
    sunY: gsap.quickSetter(sunLayer, 'y', 'px'),
    sunOpacity: gsap.quickSetter(sunLayer, 'opacity'),
    sunScale: gsap.quickSetter(sunLayer, 'scale'),
    cloudX: gsap.quickSetter(cloudLayer, 'x', 'px'),
    cloudY: gsap.quickSetter(cloudLayer, 'y', 'px'),
    cloudOpacity: gsap.quickSetter(cloudLayer, 'opacity'),
    cloudScale: gsap.quickSetter(cloudLayer, 'scale'),
    figureY: gsap.quickSetter(figureLayer, 'y', 'px'),
    figureScale: gsap.quickSetter(figureLayer, 'scale')
  };
}

function renderWithGsap(progress, mouseX, mouseY) {
  if (!gsapSetters) return;
  const p = stableProgress(progress);
  const backdropExit = smoothStep(transitionSecondsRange(p, BACKDROP_EXIT_START_SECONDS, BACKDROP_EXIT_END_SECONDS));
  const full = fullscreenProgress(p);
  const upExitY = window.innerHeight * -1.08;
  const backgroundFade = 1 - backdropExit;
  const figureScale = FIGURE_START_SCALE + full * (1 - FIGURE_START_SCALE);
  const figureY = (1 - full) * window.innerHeight * (FIGURE_START_Y_VH / 100);

  gsapSetters.sunX(mouseX * -0.004);
  gsapSetters.sunY(mouseY * -0.003 + backdropExit * upExitY * 1.02);
  gsapSetters.sunOpacity(0.96 * backgroundFade);
  gsapSetters.sunScale(1 + backdropExit * 0.025);

  gsapSetters.cloudX(mouseX * -0.006);
  gsapSetters.cloudY(mouseY * -0.004 + backdropExit * upExitY * 1.16);
  gsapSetters.cloudOpacity(0.98 * backgroundFade);
  gsapSetters.cloudScale(1 + backdropExit * 0.025);

  gsapSetters.figureY(figureY);
  gsapSetters.figureScale(figureScale);
}

function renderNative(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const backdropExit = smoothStep(transitionSecondsRange(p, BACKDROP_EXIT_START_SECONDS, BACKDROP_EXIT_END_SECONDS));
  const full = fullscreenProgress(p);
  const upExitY = window.innerHeight * -1.08;
  const backgroundFade = 1 - backdropExit;
  const figureScale = FIGURE_START_SCALE + full * (1 - FIGURE_START_SCALE);
  const figureY = (1 - full) * window.innerHeight * (FIGURE_START_Y_VH / 100);
  sunLayer.style.opacity = `${0.96 * backgroundFade}`;
  sunLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.004}px), calc(-50% + ${mouseY * -0.003 + backdropExit * upExitY * 1.02}px), 0) scale(${1 + backdropExit * 0.025})`;
  cloudLayer.style.opacity = `${0.98 * backgroundFade}`;
  cloudLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.004 + backdropExit * upExitY * 1.16}px), 0) scale(${1 + backdropExit * 0.025})`;
  figureLayer.style.transform = `translate3d(0, ${figureY}px, 0) scale(${figureScale})`;
}

function renderScene(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  page.style.setProperty('--aod-progress', p.toFixed(4));
  root.style.setProperty('--aod-progress', p.toFixed(4));

  const changed = Math.abs(lastRenderedProgress - p) > 0.0005
    || Math.abs(lastRenderedMouseX - mouseX) > 0.10
    || Math.abs(lastRenderedMouseY - mouseY) > 0.10;
  if (!changed) return;

  lastRenderedProgress = p;
  lastRenderedMouseX = mouseX;
  lastRenderedMouseY = mouseY;

  if (gsapSetters) {
    renderWithGsap(p, mouseX, mouseY);
  } else {
    renderNative(p, mouseX, mouseY);
  }
}

function renderProgress(rawProgress, videoProgress = acceleratedProgress(rawProgress)) {
  playhead.raw = stableProgress(rawProgress);
  playhead.video = stableProgress(videoProgress);
  seekVideo(figureLayer, playhead.video);
  renderScene(playhead.raw, parallaxMouse.x, parallaxMouse.y);
}

function renderRawProgress(rawProgress) {
  renderProgress(rawProgress, rawProgress);
}

function tickAod() {
  renderScene(playhead.raw, parallaxMouse.x, parallaxMouse.y);
}

function tweenNativeToRawProgress(target) {
  const startRaw = playhead.raw;
  const distance = Math.abs(target - startRaw);
  const duration = Math.max(0.10, distance * TRANSITION_DURATION_SECONDS) * 1000;
  const startedAt = performance.now();

  window.cancelAnimationFrame(nativeTweenFrame);

  const tick = (now) => {
    const t = clamp((now - startedAt) / duration, 0, 1);
    const easedT = easeOutCubic(t);
    renderProgress(startRaw + (target - startRaw) * easedT);
    if (t < 1) {
      nativeTweenFrame = window.requestAnimationFrame(tick);
    } else {
      nativeTweenFrame = 0;
    }
  };

  nativeTweenFrame = window.requestAnimationFrame(tick);
}

function tweenToRawProgress(rawProgress) {
  const target = stableProgress(rawProgress);
  const distance = Math.abs(target - playhead.raw);
  const gsap = window.gsap;

  progressTween?.kill?.();
  progressTween = null;
  window.cancelAnimationFrame(nativeTweenFrame);
  nativeTweenFrame = 0;
  stopDirectPlayback();

  if (distance < 0.001) {
    renderProgress(target, target);
    return;
  }

  if (!gsap) {
    tweenNativeToRawProgress(target);
    return;
  }

  progressTween = gsap.to(playhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onStart: () => renderProgress(playhead.raw),
    onUpdate: () => renderProgress(playhead.raw),
    onComplete: () => {
      playhead.raw = target;
      progressTween = null;
      renderProgress(target);
    }
  });
}

function scrollStageToProgress(target) {
  if (!stage) return;
  const targetY = stage.offsetTop + (target > 0.5 ? window.innerHeight * 0.22 : 0);
  if (scrollRuntime?.lenis?.scrollTo) {
    scrollRuntime.lenis.scrollTo(targetY, {
      duration: Math.min(1.1, Math.max(0.45, Math.abs(target - playhead.raw) * 0.8)),
      easing: (t) => 1 - Math.pow(1 - t, 3)
    });
    return;
  }
  window.scrollTo({ top: targetY, behavior: 'smooth' });
}

function bindTransitionIntent() {
  const isStageReady = () => {
    const rect = stage?.getBoundingClientRect();
    return Boolean(rect && rect.top <= window.innerHeight * 0.9 && rect.bottom >= window.innerHeight * 0.1);
  };

  const playDirection = (direction) => {
    if (!isStageReady()) return false;
    const target = direction > 0 ? 1 : 0;
    tweenToRawProgress(target);
    scrollStageToProgress(target);
    return true;
  };

  const onWheel = (event) => {
    const delta = event.deltaY ?? 0;
    if (Math.abs(delta) < 1) return;
    if (!playDirection(delta > 0 ? 1 : -1)) return;
    if (event.cancelable) event.preventDefault();
  };

  const onTouchStart = (event) => {
    touchStartY = event.touches?.[0]?.clientY ?? 0;
  };

  const onTouchMove = (event) => {
    const currentY = event.touches?.[0]?.clientY ?? touchStartY;
    const delta = touchStartY - currentY;
    if (Math.abs(delta) <= 2) return;
    if (!playDirection(delta > 0 ? 1 : -1)) return;
    if (event.cancelable) event.preventDefault();
  };

  const onKeyDown = (event) => {
    const forwardKeys = ['ArrowDown', 'PageDown', 'Space'];
    const backwardKeys = ['ArrowUp', 'PageUp'];
    if (![...forwardKeys, ...backwardKeys].includes(event.code)) return;
    const direction = forwardKeys.includes(event.code) ? 1 : -1;
    if (!playDirection(direction)) return;
    if (event.cancelable) event.preventDefault();
  };

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  window.addEventListener('keydown', onKeyDown, { passive: false, capture: true });
}

function startPointerParallax(gsap) {
  if (pointerParallaxBound) return;
  pointerParallaxBound = true;

  if (gsap) {
    const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out' });
    const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out' });

    window.addEventListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch' || !stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      parallaxToX(event.clientX - window.innerWidth / 2);
      parallaxToY(event.clientY - window.innerHeight / 2);
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      parallaxToX(0);
      parallaxToY(0);
    }, { passive: true });
    return;
  }

  window.addEventListener('pointermove', (event) => {
    if (reduceMotion || event.pointerType === 'touch' || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) return;
    nativeMouse.targetX = event.clientX - window.innerWidth / 2;
    nativeMouse.targetY = event.clientY - window.innerHeight / 2;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    nativeMouse.targetX = 0;
    nativeMouse.targetY = 0;
  }, { passive: true });
}

function initNativeFallback() {
  startPointerParallax(null);
  bindTransitionIntent();
  renderRawProgress(0);

  if (!nativeTickerStarted) {
    nativeTickerStarted = true;
    const tick = () => {
      nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
      nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
      parallaxMouse.x = nativeMouse.x;
      parallaxMouse.y = nativeMouse.y;
      tickAod();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function initScrollTrigger() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0);
  ScrollTrigger.config({ ignoreMobileResize: true });

  startPointerParallax(gsap);
  gsapSetters = createGsapSetters(gsap);
  scrollRuntime = initSmoothScroll({
    root,
    body: document.body,
    reduceMotion
  });

  scrollTriggerInstance = ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.max(1, window.innerHeight * 0.2)}`,
    invalidateOnRefresh: true,
    onUpdate: (self) => tweenToRawProgress(self.progress),
    onLeave: () => tweenToRawProgress(1),
    onLeaveBack: () => tweenToRawProgress(0)
  });

  window.addEventListener('resize', () => {
    lastRenderedProgress = -1;
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(tickAod);
  renderRawProgress(0);
  ScrollTrigger.refresh();
}

prepareFigureVideo(figureLayer);
waitForVideoMetadata(figureLayer).then(() => {
  seekVideo(figureLayer, playhead.video);
  lastRenderedProgress = -1;
  renderScene(playhead.raw, parallaxMouse.x, parallaxMouse.y);
});

if (stage && sunLayer && cloudLayer && figureLayer) {
  if (reduceMotion) {
    renderScene(0, 0, 0);
  } else {
    loadRequiredLibraries()
      .then(initScrollTrigger)
      .catch((error) => {
        console.warn('Falling back to native scroll sync.', error);
        initNativeFallback();
      });
  }
}

window.addEventListener('pagehide', () => {
  scrollRuntime?.destroy?.();
});
