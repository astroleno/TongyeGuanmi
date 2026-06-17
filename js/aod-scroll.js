import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const VIDEO_DURATION_FALLBACK = 5.03;

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-aod-stage]');
const sunLayer = document.querySelector('.aod-layer--sun');
const cloudLayer = document.querySelector('.aod-layer--cloud');
const figureVideo = document.querySelector('[data-aod-figure-video]');
const figureLayer = figureVideo || document.querySelector('.aod-layer--figure');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollRuntime = null;
let progressState = { value: 0, target: 0 };
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = -1;
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;
let lastVideoProgress = -1;

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function range01(value, start, end) {
  return clamp((value - start) / (end - start), 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function videoProgressCurve(progress) {
  const p = stableProgress(progress);
  return clamp(0.64 * p + 0.36 * smoothStep(p), 0, 1);
}

function fullscreenProgress(progress) {
  return smoothStep(range01(progress, 0.70, 1));
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

function getFigureVideoDuration() {
  return Number.isFinite(figureVideo?.duration) && figureVideo.duration > 0
    ? figureVideo.duration
    : VIDEO_DURATION_FALLBACK;
}

function seekFigureVideo(progress) {
  if (!figureVideo || figureVideo.readyState < 1) return;
  const p = stableProgress(progress);
  if (Math.abs(lastVideoProgress - p) < 0.0015) return;

  const duration = getFigureVideoDuration();
  const targetTime = Math.min(duration - 0.02, Math.max(0, p * duration));
  if (Math.abs(figureVideo.currentTime - targetTime) < 0.014) {
    lastVideoProgress = p;
    return;
  }

  try {
    figureVideo.currentTime = targetTime;
    lastVideoProgress = p;
  } catch {
    // WebKit can reject seeks before metadata fully settles.
  }
}

function waitForFigureVideoMetadata() {
  if (!figureVideo || figureVideo.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      figureVideo.removeEventListener('loadedmetadata', finish);
      figureVideo.removeEventListener('canplay', finish);
      figureVideo.removeEventListener('error', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 1400);
    figureVideo.addEventListener('loadedmetadata', finish, { once: true });
    figureVideo.addEventListener('canplay', finish, { once: true });
    figureVideo.addEventListener('error', finish, { once: true });
    figureVideo.load();
  });
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
  gsap.set([sunLayer, cloudLayer, figureLayer], {
    xPercent: -50,
    yPercent: -50,
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
    figureX: gsap.quickSetter(figureLayer, 'x', 'px'),
    figureY: gsap.quickSetter(figureLayer, 'y', 'px'),
    figureScale: gsap.quickSetter(figureLayer, 'scale')
  };
}

function renderWithGsap(progress, mouseX, mouseY) {
  if (!gsapSetters) return;
  const p = stableProgress(progress);
  const eased = smoothStep(p);
  const full = fullscreenProgress(p);
  const upExitY = window.innerHeight * -1.08;
  const backgroundFade = 1 - smoothStep(range01(p, 0.78, 0.98));

  gsapSetters.sunX(mouseX * -0.004);
  gsapSetters.sunY(mouseY * -0.003 + eased * upExitY * 0.86);
  gsapSetters.sunOpacity(0.96 * backgroundFade);
  gsapSetters.sunScale(1 + eased * 0.025);

  gsapSetters.cloudX(mouseX * -0.006);
  gsapSetters.cloudY(mouseY * -0.004 + eased * upExitY * 1.08);
  gsapSetters.cloudOpacity(0.98 * backgroundFade);
  gsapSetters.cloudScale(1 + eased * 0.025);

  gsapSetters.figureX(mouseX * -0.003);
  gsapSetters.figureY(mouseY * -0.002 + eased * upExitY * 0.18 + full * window.innerHeight * 0.13);
  gsapSetters.figureScale(1 + eased * 0.006 + full * 0.12);
}

function renderNative(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const eased = smoothStep(p);
  const full = fullscreenProgress(p);
  const upExitY = window.innerHeight * -1.08;
  const backgroundFade = 1 - smoothStep(range01(p, 0.78, 0.98));
  sunLayer.style.opacity = `${0.96 * backgroundFade}`;
  sunLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.004}px), calc(-50% + ${mouseY * -0.003 + eased * upExitY * 0.86}px), 0) scale(${1 + eased * 0.025})`;
  cloudLayer.style.opacity = `${0.98 * backgroundFade}`;
  cloudLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.004 + eased * upExitY * 1.08}px), 0) scale(${1 + eased * 0.025})`;
  figureLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.003}px), calc(-50% + ${mouseY * -0.002 + eased * upExitY * 0.18 + full * window.innerHeight * 0.13}px), 0) scale(${1 + eased * 0.006 + full * 0.12})`;
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
  seekFigureVideo(videoProgressCurve(p));
}

function tickAod() {
  const diff = stableProgress(progressState.target) - progressState.value;
  progressState.value += diff * 0.28;
  renderScene(progressState.value, parallaxMouse.x, parallaxMouse.y);
}

function updateNativeProgress() {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const range = Math.max(1, rect.height - window.innerHeight);
  progressState.target = stableProgress(-rect.top / range);
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
  window.addEventListener('scroll', updateNativeProgress, { passive: true });
  window.addEventListener('resize', updateNativeProgress, { passive: true });

  if (!nativeTickerStarted) {
    nativeTickerStarted = true;
    const tick = () => {
      updateNativeProgress();
      nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
      nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
      parallaxMouse.x = nativeMouse.x;
      parallaxMouse.y = nativeMouse.y;
      tickAod();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  updateNativeProgress();
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

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      progressState.target = stableProgress(self.progress);
    },
    onRefresh: (self) => {
      progressState.target = stableProgress(self.progress);
    }
  });

  window.addEventListener('resize', () => {
    lastRenderedProgress = -1;
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(tickAod);
  tickAod();
  ScrollTrigger.refresh();
}

prepareFigureVideo(figureVideo);
waitForFigureVideoMetadata().then(() => {
  seekFigureVideo(videoProgressCurve(progressState.value));
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
