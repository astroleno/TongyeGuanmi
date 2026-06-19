import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-ttg-stage]');
const bgLayer = document.querySelector('.ttg-layer--bg');
const middleLayer = document.querySelector('.ttg-layer--middle');
const middleOverlayLayer = document.querySelector('.ttg-layer--middle-overlay');
const frontLayer = document.querySelector('.ttg-layer--front');
const frontOverlayLayer = document.querySelector('.ttg-layer--front-overlay');
const figureLayer = document.querySelector('.ttg-layer--figure');
const figureVideo = document.querySelector('[data-ttg-figure-video]');
const tunePanel = document.querySelector('[data-ttg-tune-panel]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRANSITION_DURATION_SECONDS = 3.5;
const TRANSITION_SCROLL_RANGE = 0.2;
const VIDEO_DURATION_FALLBACK = 4.017;
const TUNING_STORAGE_KEY = 'ttg:scene-tuning:v4';
const TUNING_DEFAULTS = {
  previewProgress: -1,
  bgTravelVh: 4.2,
  middleTravelVh: 10.5,
  middleResponse: 0.34,
  frontTravelVh: 4.6,
  figureScale: 0.52,
  figureYVh: 2,
  scrollVh: 140
};
const TUNING_LIMITS = {
  previewProgress: [-0.01, 1],
  bgTravelVh: [0, 18],
  middleTravelVh: [-20, 28],
  middleResponse: [0.04, 0.80],
  frontTravelVh: [-16, 18],
  figureScale: [0.35, 0.90],
  figureYVh: [-16, 16],
  scrollVh: [110, 260]
};

let scrollRuntime = null;
let progressState = { target: 0, bg: 0, middle: 0, front: 0 };
let figureProgressTween = null;
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;
let lastRenderedTuningVersion = -1;
let tuningVersion = 0;
let scrollRefreshTimer = 0;
let currentTuning = { ...TUNING_DEFAULTS };

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
const figurePlayhead = { raw: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function acceleratedProgress(rawProgress) {
  const t = clamp(rawProgress, 0, 1);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function sanitizeTuning(input = {}) {
  return Object.fromEntries(Object.entries(TUNING_DEFAULTS).map(([key, defaultValue]) => {
    const value = Number(input[key]);
    const [min, max] = TUNING_LIMITS[key];
    return [key, clamp(Number.isFinite(value) ? value : defaultValue, min, max)];
  }));
}

function readStoredTuning() {
  try {
    return sanitizeTuning(JSON.parse(window.localStorage.getItem(TUNING_STORAGE_KEY)) || {});
  } catch {
    return sanitizeTuning();
  }
}

function persistTuning() {
  try {
    window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(currentTuning));
  } catch {
    // Tuning should still work if storage is unavailable.
  }
}

function resetRenderCache() {
  lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
  lastRenderedMouseX = 999;
  lastRenderedMouseY = 999;
  lastRenderedTuningVersion = -1;
}

function requestScrollRefresh() {
  if (!window.ScrollTrigger) return;
  window.clearTimeout(scrollRefreshTimer);
  scrollRefreshTimer = window.setTimeout(() => window.ScrollTrigger.refresh(), 60);
}

function applyTuning({ persist = true, refresh = false } = {}) {
  page.style.setProperty('--ttg-scroll-vh', currentTuning.scrollVh.toFixed(1));
  root.style.setProperty('--ttg-scroll-vh', currentTuning.scrollVh.toFixed(1));
  tuningVersion += 1;
  resetRenderCache();
  if (persist) persistTuning();
  if (refresh) requestScrollRefresh();
  renderPreviewFigureProgress();
  renderScene(getLiveProgressParts(), parallaxMouse.x, parallaxMouse.y);
}

function getProgressParts(progress) {
  if (typeof progress === 'number') {
    const p = stableProgress(progress);
    return { bg: p, middle: p, front: p };
  }

  return {
    bg: stableProgress(progress?.bg ?? 0),
    middle: stableProgress(progress?.middle ?? 0),
    front: stableProgress(progress?.front ?? 0)
  };
}

function getPreviewProgress() {
  return currentTuning.previewProgress >= 0
    ? stableProgress(currentTuning.previewProgress)
    : null;
}

function getLiveProgressParts() {
  const previewProgress = getPreviewProgress();
  if (previewProgress !== null) {
    return { bg: previewProgress, middle: previewProgress, front: previewProgress };
  }

  return {
    bg: progressState.bg,
    middle: progressState.middle,
    front: progressState.front
  };
}

function renderPreviewFigureProgress() {
  const previewProgress = getPreviewProgress();
  if (previewProgress === null) return;
  figureProgressTween?.kill?.();
  figureProgressTween = null;
  figurePlayhead.raw = previewProgress;
  renderRawFigureProgress(previewProgress);
}

function formatTuneValue(key, value) {
  if (key === 'previewProgress') return value < 0 ? 'scroll' : value.toFixed(2);
  if (key === 'figureScale') return `${value.toFixed(2)}x`;
  if (key === 'middleResponse') return value.toFixed(2);
  if (key === 'scrollVh') return `${Math.round(value)}vh`;
  return `${value.toFixed(1)}vh`;
}

function initTuningPanel() {
  if (!tunePanel) return;

  const reset = tunePanel.querySelector('[data-ttg-tune-reset]');
  const controls = [...tunePanel.querySelectorAll('[data-ttg-tune-key]')].map((input) => {
    const key = input.dataset.ttgTuneKey;
    const output = tunePanel.querySelector(`[data-ttg-tune-output="${key}"]`);
    return { key, input, output };
  }).filter(({ key }) => key in TUNING_DEFAULTS);

  const syncControl = ({ key, input, output }) => {
    input.value = String(currentTuning[key]);
    if (output) output.textContent = formatTuneValue(key, currentTuning[key]);
  };

  tunePanel.addEventListener('pointerdown', (event) => event.stopPropagation());
  tunePanel.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  tunePanel.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });

  controls.forEach((control) => {
    syncControl(control);
    const handleInput = () => {
      currentTuning = sanitizeTuning({
        ...currentTuning,
        [control.key]: control.input.value
      });
      syncControl(control);
      applyTuning({ refresh: control.key === 'scrollVh' });
    };
    control.input.addEventListener('input', handleInput);
    control.input.addEventListener('change', handleInput);
  });

  reset?.addEventListener('click', () => {
    currentTuning = sanitizeTuning();
    controls.forEach(syncControl);
    applyTuning({ refresh: true });
  });
}

function prepareVideo(video) {
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
  return Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : VIDEO_DURATION_FALLBACK;
}

function seekFigureVideo(progress) {
  if (!figureVideo || figureVideo.readyState < 1) return;
  const duration = getVideoDuration(figureVideo);
  const p = stableProgress(progress);
  const targetTime = p >= 1
    ? Math.max(0, duration - 0.001)
    : Math.min(Math.max(0, p * duration), Math.max(0, duration - 0.001));
  const threshold = p >= 0.998 || p <= 0.002 ? 0.004 : 0.016;
  if (Math.abs(figureVideo.currentTime - targetTime) < threshold) return;

  try {
    figureVideo.currentTime = targetTime;
  } catch {
    // Metadata can settle a beat later on WebKit.
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
    const timer = window.setTimeout(finish, 1200);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

function setFigureProgress(progress) {
  const p = clamp(progress, 0, 1);
  page.style.setProperty('--ttg-figure-progress', p.toFixed(4));
  root.style.setProperty('--ttg-figure-progress', p.toFixed(4));
}

function renderRawFigureProgress(rawProgress) {
  const visualProgress = acceleratedProgress(rawProgress);
  setFigureProgress(visualProgress);
  seekFigureVideo(visualProgress);
}

function tweenToRawFigureProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  const distance = Math.abs(target - figurePlayhead.raw);

  figureProgressTween?.kill?.();
  figureProgressTween = null;

  if (distance < 0.001) {
    figurePlayhead.raw = target;
    renderRawFigureProgress(figurePlayhead.raw);
    return;
  }

  figureProgressTween = gsap.to(figurePlayhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => renderRawFigureProgress(figurePlayhead.raw),
    onComplete: () => {
      figurePlayhead.raw = target;
      figureProgressTween = null;
      renderRawFigureProgress(figurePlayhead.raw);
    }
  });
}

function resetFigureTransition() {
  tweenToRawFigureProgress(0);
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
  gsap.set(bgLayer, {
    xPercent: -50,
    yPercent: 0,
    scale: 1,
    transformOrigin: '50% 0',
    force3D: true
  });

  gsap.set([middleLayer, middleOverlayLayer, frontLayer, frontOverlayLayer], {
    xPercent: -50,
    yPercent: -50,
    scale: 1,
    transformOrigin: '50% 50%',
    force3D: true
  });

  gsap.set(figureLayer, {
    xPercent: -50,
    yPercent: -50,
    y: window.innerHeight * (currentTuning.figureYVh / 100),
    scale: currentTuning.figureScale,
    transformOrigin: '50% 50%',
    force3D: true
  });

  return {
    bgX: gsap.quickSetter(bgLayer, 'x', 'px'),
    bgY: gsap.quickSetter(bgLayer, 'y', 'px'),
    bgScale: gsap.quickSetter(bgLayer, 'scale'),
    middleX: gsap.quickSetter(middleLayer, 'x', 'px'),
    middleY: gsap.quickSetter(middleLayer, 'y', 'px'),
    middleScale: gsap.quickSetter(middleLayer, 'scale'),
    middleOverlayX: gsap.quickSetter(middleOverlayLayer, 'x', 'px'),
    middleOverlayY: gsap.quickSetter(middleOverlayLayer, 'y', 'px'),
    middleOverlayScale: gsap.quickSetter(middleOverlayLayer, 'scale'),
    frontX: gsap.quickSetter(frontLayer, 'x', 'px'),
    frontY: gsap.quickSetter(frontLayer, 'y', 'px'),
    frontScale: gsap.quickSetter(frontLayer, 'scale'),
    frontOverlayX: gsap.quickSetter(frontOverlayLayer, 'x', 'px'),
    frontOverlayY: gsap.quickSetter(frontOverlayLayer, 'y', 'px'),
    frontOverlayScale: gsap.quickSetter(frontOverlayLayer, 'scale'),
    figureX: gsap.quickSetter(figureLayer, 'x', 'px'),
    figureY: gsap.quickSetter(figureLayer, 'y', 'px'),
    figureScale: gsap.quickSetter(figureLayer, 'scale')
  };
}

function renderWithGsap(progressParts, mouseX, mouseY) {
  if (!gsapSetters) return;
  const bgEased = smoothStep(progressParts.bg);
  const middleEased = smoothStep(progressParts.middle);
  const frontEased = smoothStep(progressParts.front);
  const bgTravelY = window.innerHeight * (currentTuning.bgTravelVh / 100);
  const middleTravelY = window.innerHeight * (currentTuning.middleTravelVh / 100);
  const frontTravelY = window.innerHeight * (currentTuning.frontTravelVh / 100);
  const figureGroundingY = window.innerHeight * (currentTuning.figureYVh / 100);

  gsapSetters.bgX(mouseX * -0.0015);
  gsapSetters.bgY(-bgEased * bgTravelY);
  gsapSetters.bgScale(1 + bgEased * 0.018);

  gsapSetters.middleX(mouseX * -0.006);
  gsapSetters.middleY(mouseY * -0.002 + middleEased * middleTravelY);
  gsapSetters.middleScale(1 + middleEased * 0.012);
  gsapSetters.middleOverlayX(mouseX * -0.006);
  gsapSetters.middleOverlayY(mouseY * -0.002 + middleEased * middleTravelY);
  gsapSetters.middleOverlayScale(1 + middleEased * 0.012);

  gsapSetters.frontX(0);
  gsapSetters.frontY(frontEased * frontTravelY);
  gsapSetters.frontScale(1);
  gsapSetters.frontOverlayX(0);
  gsapSetters.frontOverlayY(frontEased * frontTravelY);
  gsapSetters.frontOverlayScale(1);

  gsapSetters.figureX(0);
  gsapSetters.figureY(figureGroundingY);
  gsapSetters.figureScale(currentTuning.figureScale);
}

function renderNative(progressParts, mouseX, mouseY) {
  const bgEased = smoothStep(progressParts.bg);
  const middleEased = smoothStep(progressParts.middle);
  const frontEased = smoothStep(progressParts.front);
  const bgTravelY = window.innerHeight * (currentTuning.bgTravelVh / 100);
  const middleTravelY = window.innerHeight * (currentTuning.middleTravelVh / 100);
  const frontTravelY = window.innerHeight * (currentTuning.frontTravelVh / 100);
  const figureGroundingY = window.innerHeight * (currentTuning.figureYVh / 100);
  bgLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.0015}px), ${-bgEased * bgTravelY}px, 0) scale(${1 + bgEased * 0.018})`;
  middleLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + middleEased * middleTravelY}px), 0) scale(${1 + middleEased * 0.012})`;
  middleOverlayLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + middleEased * middleTravelY}px), 0) scale(${1 + middleEased * 0.012})`;
  frontLayer.style.transform = `translate3d(-50%, calc(-50% + ${frontEased * frontTravelY}px), 0) scale(1)`;
  frontOverlayLayer.style.transform = `translate3d(-50%, calc(-50% + ${frontEased * frontTravelY}px), 0) scale(1)`;
  figureLayer.style.transform = `translate3d(-50%, calc(-50% + ${figureGroundingY}px), 0) scale(${currentTuning.figureScale})`;
}

function renderScene(progress, mouseX, mouseY) {
  const progressParts = getProgressParts(progress);
  page.style.setProperty('--ttg-progress', progressParts.front.toFixed(4));
  root.style.setProperty('--ttg-progress', progressParts.front.toFixed(4));

  const changed = Math.abs(lastRenderedProgress.bg - progressParts.bg) > 0.0005
    || Math.abs(lastRenderedProgress.middle - progressParts.middle) > 0.0005
    || Math.abs(lastRenderedProgress.front - progressParts.front) > 0.0005
    || Math.abs(lastRenderedMouseX - mouseX) > 0.10
    || Math.abs(lastRenderedMouseY - mouseY) > 0.10
    || lastRenderedTuningVersion !== tuningVersion;
  if (!changed) return;

  lastRenderedProgress = progressParts;
  lastRenderedMouseX = mouseX;
  lastRenderedMouseY = mouseY;
  lastRenderedTuningVersion = tuningVersion;

  if (gsapSetters) {
    renderWithGsap(progressParts, mouseX, mouseY);
  } else {
    renderNative(progressParts, mouseX, mouseY);
  }
}

function tickTtg() {
  const previewProgress = getPreviewProgress();
  if (previewProgress !== null) {
    progressState.bg = previewProgress;
    progressState.middle = previewProgress;
    progressState.front = previewProgress;
    renderPreviewFigureProgress();
    renderScene(getLiveProgressParts(), parallaxMouse.x, parallaxMouse.y);
    return;
  }

  const target = stableProgress(progressState.target);
  progressState.bg += (target - progressState.bg) * 0.16;
  progressState.middle += (target - progressState.middle) * currentTuning.middleResponse;
  progressState.front += (target - progressState.front) * 0.24;
  renderScene({
    bg: progressState.bg,
    middle: progressState.middle,
    front: progressState.front
  }, parallaxMouse.x, parallaxMouse.y);
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
      tickTtg();
      renderRawFigureProgress(stableProgress(window.scrollY / Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)));
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
  resetRenderCache();
  scrollRuntime = initSmoothScroll({
    root,
    body: document.body,
    reduceMotion,
    options: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    }
  });

  renderRawFigureProgress(0);

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)}`,
    onUpdate: (self) => tweenToRawFigureProgress(self.progress),
    onLeave: () => tweenToRawFigureProgress(1),
    onLeaveBack: resetFigureTransition
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
    resetRenderCache();
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(tickTtg);
  tickTtg();
  ScrollTrigger.refresh();
}

currentTuning = readStoredTuning();
applyTuning({ persist: false });
initTuningPanel();

if (stage && bgLayer && middleLayer && middleOverlayLayer && frontLayer && frontOverlayLayer && figureLayer && figureVideo) {
  prepareVideo(figureVideo);

  if (reduceMotion) {
    waitForVideoMetadata(figureVideo).then(() => {
      figurePlayhead.raw = 1;
      renderRawFigureProgress(1);
      renderScene(0, 0, 0);
    });
  } else {
    waitForVideoMetadata(figureVideo)
      .then(loadRequiredLibraries)
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
