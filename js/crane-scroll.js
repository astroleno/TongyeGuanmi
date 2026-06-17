import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const TRANSITION_DURATION_SECONDS = 2.5;
const TRANSITION_SCROLL_RANGE = 0.22;
const VIDEO_DURATION_FALLBACK = 2.47;
const FLOCK_POSITION_STORAGE_KEY = 'crane:flock-position';
const FLOCK_POSITION_DEFAULTS = { x: 12, y: -108, scale: 1 };

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-crane-stage]');
const cloudBack = document.querySelector('.crane-layer--cloud-back');
const cloudFrontSecond = document.querySelector('.crane-layer--cloud-front-second');
const cloudFront = document.querySelector('.crane-layer--cloud-front');
const archLayer = document.querySelector('.crane-layer--arch');
const figureVideo = document.querySelector('[data-crane-figure-video]');
const flockVideo = document.querySelector('[data-crane-figure-front-video]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollRuntime = null;
let progressTween = null;
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = -1;
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;

const playhead = { raw: 0 };
const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function range01(value, start, end) {
  return clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
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

function getStoredFlockPosition() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FLOCK_POSITION_STORAGE_KEY));
    if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return null;
    return {
      x: clamp(stored.x, -220, 220),
      y: clamp(stored.y, -600, 80),
      scale: Number.isFinite(stored.scale) ? clamp(stored.scale, 0.70, 1.40) : FLOCK_POSITION_DEFAULTS.scale
    };
  } catch {
    return null;
  }
}

function storeFlockPosition(x, y, scale) {
  try {
    window.localStorage.setItem(FLOCK_POSITION_STORAGE_KEY, JSON.stringify({ x, y, scale }));
  } catch {
    // Position tuning is optional.
  }
}

function applyFlockPosition(x, y, scale) {
  root.style.setProperty('--crane-flock-x', `${x}px`);
  root.style.setProperty('--crane-flock-base-y', `${y}px`);
  root.style.setProperty('--crane-flock-scale', scale.toFixed(2));
  page.style.setProperty('--crane-flock-x', `${x}px`);
  page.style.setProperty('--crane-flock-base-y', `${y}px`);
  page.style.setProperty('--crane-flock-scale', scale.toFixed(2));
}

function initFlockPositionControls() {
  const panel = document.querySelector('[data-crane-tune-panel]');
  if (!panel) return;

  const xSlider = panel.querySelector('[data-crane-flock-x-slider]');
  const ySlider = panel.querySelector('[data-crane-flock-y-slider]');
  const scaleSlider = panel.querySelector('[data-crane-flock-scale-slider]');
  const xValue = panel.querySelector('[data-crane-flock-x-value]');
  const yValue = panel.querySelector('[data-crane-flock-y-value]');
  const scaleValue = panel.querySelector('[data-crane-flock-scale-value]');
  const reset = panel.querySelector('[data-crane-flock-reset]');
  if (!xSlider || !ySlider || !scaleSlider || !xValue || !yValue || !scaleValue) return;

  const sync = (x, y, scale, persist = true) => {
    const nextX = Math.round(clamp(Number(x), -220, 220));
    const nextY = Math.round(clamp(Number(y), -600, 80));
    const nextScale = clamp(Number(scale), 0.70, 1.40);
    xSlider.value = String(nextX);
    ySlider.value = String(nextY);
    scaleSlider.value = String(nextScale);
    xValue.textContent = `${nextX}px`;
    yValue.textContent = `${nextY}px`;
    scaleValue.textContent = `${nextScale.toFixed(2)}x`;
    applyFlockPosition(nextX, nextY, nextScale);
    if (persist) storeFlockPosition(nextX, nextY, nextScale);
  };

  const stored = getStoredFlockPosition();
  sync(
    stored?.x ?? FLOCK_POSITION_DEFAULTS.x,
    stored?.y ?? FLOCK_POSITION_DEFAULTS.y,
    stored?.scale ?? FLOCK_POSITION_DEFAULTS.scale,
    Boolean(stored)
  );

  xSlider.addEventListener('input', () => sync(xSlider.value, ySlider.value, scaleSlider.value), { passive: true });
  ySlider.addEventListener('input', () => sync(xSlider.value, ySlider.value, scaleSlider.value), { passive: true });
  scaleSlider.addEventListener('input', () => sync(xSlider.value, ySlider.value, scaleSlider.value), { passive: true });
  reset?.addEventListener('click', () => {
    try {
      window.localStorage.removeItem(FLOCK_POSITION_STORAGE_KEY);
    } catch {
      // Position tuning is optional.
    }
    sync(FLOCK_POSITION_DEFAULTS.x, FLOCK_POSITION_DEFAULTS.y, FLOCK_POSITION_DEFAULTS.scale, false);
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
    const timer = window.setTimeout(finish, 1300);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

function getVideoDuration(video) {
  return Number.isFinite(video?.duration) && video.duration > 0
    ? video.duration
    : VIDEO_DURATION_FALLBACK;
}

function seekVideo(video, progress) {
  if (!video || video.readyState < 1) return;
  const duration = getVideoDuration(video);
  const targetTime = Math.min(duration - 0.025, Math.max(0, stableProgress(progress) * duration));
  if (Math.abs(video.currentTime - targetTime) < 0.016) return;

  try {
    video.currentTime = targetTime;
  } catch {
    // Video metadata can settle a frame later on WebKit.
  }
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
  gsap.set([cloudBack, archLayer, cloudFrontSecond, cloudFront], {
    xPercent: -50,
    yPercent: 0,
    scale: 1,
    transformOrigin: '50% 100%',
    force3D: true
  });

  return {
    cloudBackX: gsap.quickSetter(cloudBack, 'x', 'px'),
    cloudBackY: gsap.quickSetter(cloudBack, 'y', 'px'),
    cloudFrontSecondX: gsap.quickSetter(cloudFrontSecond, 'x', 'px'),
    cloudFrontSecondY: gsap.quickSetter(cloudFrontSecond, 'y', 'px'),
    cloudFrontX: gsap.quickSetter(cloudFront, 'x', 'px'),
    cloudFrontY: gsap.quickSetter(cloudFront, 'y', 'px'),
    archX: gsap.quickSetter(archLayer, 'x', 'px'),
    archY: gsap.quickSetter(archLayer, 'y', 'px')
  };
}

function renderWithGsap(progress, mouseX, mouseY) {
  if (!gsapSetters) return;
  const p = stableProgress(progress);
  const eased = smoothStep(range01(p, 0.08, 0.78));
  const downExitY = window.innerHeight * 1.38;

  gsapSetters.cloudBackX(mouseX * -0.003);
  gsapSetters.cloudBackY(mouseY * -0.002 + eased * downExitY * 0.82);

  gsapSetters.archX(mouseX * -0.002);
  gsapSetters.archY(eased * downExitY * 1.00);

  gsapSetters.cloudFrontSecondX(mouseX * -0.002);
  gsapSetters.cloudFrontSecondY(mouseY * -0.001 + eased * downExitY * 1.28);

  gsapSetters.cloudFrontX(mouseX * -0.002);
  gsapSetters.cloudFrontY(mouseY * -0.001 + eased * downExitY * 1.14);
}

function renderNative(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const eased = smoothStep(range01(p, 0.08, 0.78));
  const downExitY = window.innerHeight * 1.38;
  cloudBack.style.transform = `translate3d(calc(-50% + ${mouseX * -0.003}px), ${mouseY * -0.002 + eased * downExitY * 0.82}px, 0)`;
  archLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${eased * downExitY * 1.00}px, 0)`;
  cloudFrontSecond.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${mouseY * -0.001 + eased * downExitY * 1.28}px, 0)`;
  cloudFront.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${mouseY * -0.001 + eased * downExitY * 1.14}px, 0)`;
}

function renderVideoTransition(progress) {
  const p = stableProgress(progress);
  const grow = smoothStep(range01(p, 0.28, 0.66));
  const reveal = smoothStep(range01(p, 0.24, 0.40));
  const flockOpacity = 1 - smoothStep(range01(p, 0.82, 0.98));
  const scale = 0.5 + grow * 0.5;

  root.style.setProperty('--crane-video-scale', scale.toFixed(4));
  page.style.setProperty('--crane-video-scale', scale.toFixed(4));
  root.style.setProperty('--crane-video-opacity', reveal.toFixed(4));
  page.style.setProperty('--crane-video-opacity', reveal.toFixed(4));
  root.style.setProperty('--crane-flock-opacity', flockOpacity.toFixed(4));
  page.style.setProperty('--crane-flock-opacity', flockOpacity.toFixed(4));
  root.style.setProperty('--crane-flock-y', '0px');
  page.style.setProperty('--crane-flock-y', '0px');
}

function seekVideos(progress) {
  const p = stableProgress(progress);
  seekVideo(flockVideo, p);
  seekVideo(figureVideo, smoothStep(range01(p, 0.20, 1)));
}

function renderScene(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  page.style.setProperty('--crane-progress', p.toFixed(4));
  root.style.setProperty('--crane-progress', p.toFixed(4));
  renderVideoTransition(p);

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

function renderRawProgress(rawProgress) {
  const visualProgress = acceleratedProgress(rawProgress);
  renderScene(visualProgress, parallaxMouse.x, parallaxMouse.y);
  seekVideos(visualProgress);
}

function tweenToRawProgress(rawProgress) {
  const target = stableProgress(rawProgress);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (!window.gsap || distance < 0.001) {
    playhead.raw = target;
    renderRawProgress(playhead.raw);
    return;
  }

  progressTween = window.gsap.to(playhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => renderRawProgress(playhead.raw),
    onComplete: () => {
      playhead.raw = target;
      progressTween = null;
      renderRawProgress(playhead.raw);
    }
  });
}

function updateNativeProgress() {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const range = Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE);
  tweenToRawProgress(-rect.top / range);
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
      renderScene(acceleratedProgress(playhead.raw), parallaxMouse.x, parallaxMouse.y);
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
    end: () => `+=${Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)}`,
    invalidateOnRefresh: true,
    onUpdate: (self) => tweenToRawProgress(self.progress),
    onLeave: () => tweenToRawProgress(1),
    onLeaveBack: () => tweenToRawProgress(0)
  });

  window.addEventListener('resize', () => {
    lastRenderedProgress = -1;
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(() => renderScene(acceleratedProgress(playhead.raw), parallaxMouse.x, parallaxMouse.y));
  renderRawProgress(0);
  ScrollTrigger.refresh();
}

initFlockPositionControls();

if (stage && cloudBack && cloudFrontSecond && cloudFront && archLayer && figureVideo && flockVideo) {
  prepareVideo(figureVideo);
  prepareVideo(flockVideo);
  const videosReady = Promise.all([
    waitForVideoMetadata(figureVideo),
    waitForVideoMetadata(flockVideo)
  ]);

  if (reduceMotion) {
    videosReady.then(() => {
      playhead.raw = 1;
      renderRawProgress(1);
    });
  } else {
    Promise.all([loadRequiredLibraries(), videosReady])
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
