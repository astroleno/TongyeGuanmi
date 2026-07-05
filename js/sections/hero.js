import { createInkCurtainTransition, createInkSceneTransition } from '../effects/ink-scene-transition.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / (end - start), 0, 1);

const DEFAULT_HERO_CONFIG = {
  heroVideoSrc: 'assets/figure1.webm',
  heroBackSceneSrc: 'assets/back1.png',
  heroNextSceneSrc: 'assets/back2.png',
  heroBackDepthSrc: 'assets/back1_depth.png',
  heroMiddleDepthSrc: 'assets/middle1_depth.png',
  heroIntroDurationSeconds: 2.7,
  heroTitleStartProgress: 0.78,
  heroSubtitleStartOffsetSeconds: 0.42,
  heroLoaderReadyDelayMs: 0,
  heroPreTransitionRangeVh: 50,
  heroSceneTransitionRangeVh: 100,
  heroVideoSegmentSeconds: 2,
  heroBackBaseScale: 1.10,
  heroBackScrollScaleDelta: 0.10,
  heroBackImageBoxScale: 1.12,
  heroMiddleBaseYVh: 1,
  heroMiddleBaseScale: 0.98,
  heroMiddleScrollScaleDelta: 0.32,
  heroFigureBaseYVh: 12,
  heroFigureBaseScale: 1
};

function updatePageProgress(root) {
  const doc = document.documentElement;
  const total = Math.max(1, doc.scrollHeight - window.innerHeight);
  const progress = clamp(window.scrollY / total, 0, 1);
  root.style.setProperty('--page-progress', progress.toFixed(4));
}

export function initFallbackParallax(options = {}) {
  const root = options.root || document.documentElement;
  const reduceMotion = Boolean(options.reduceMotion);
  const runtime = options.runtime || { markLoaded() {} };
  root.classList.add('webgl-fallback');
  const hero = document.querySelector('.hero-wrap');
  const back = document.querySelector('.fallback-back');
  const middle = document.querySelector('.fallback-middle');
  const figure = document.querySelector('.fallback-figure');
  const content = document.querySelector('.hero-content');
  const manifesto = document.querySelector('.manifesto');
  if (!hero || !back || !middle || !figure) return;

  let mx = 0;
  let my = 0;
  let tx = 0;
  let ty = 0;
  let scroll = 0;
  let fallbackVideoDuration = 0;

  figure.loop = false;
  figure.pause();
  figure.addEventListener('loadedmetadata', () => {
    fallbackVideoDuration = Number.isFinite(figure.duration) && figure.duration > 0 ? figure.duration : 0;
    syncFallbackVideo();
  }, { once: true });

  window.addEventListener('pointermove', (event) => {
    tx = (event.clientX / window.innerWidth - 0.5) * 2;
    ty = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function computeScroll() {
    const rect = hero.getBoundingClientRect();
    const range = Math.max(1, rect.height - window.innerHeight);
    scroll = clamp(-rect.top / range, 0, 1);
    updatePageProgress(root);
    syncFallbackVideo();
    updateFallbackManifesto();
  }

  function syncFallbackVideo() {
    const duration = fallbackVideoDuration || (Number.isFinite(figure.duration) ? figure.duration : 0);
    if (!duration || figure.readyState < 1) return;
    const targetTime = Math.min(duration - 0.04, Math.max(0, scroll * duration));
    if (Math.abs(figure.currentTime - targetTime) > 0.055) {
      try {
        figure.currentTime = targetTime;
      } catch {
        // Seeking can briefly fail before metadata settles in older WebKit builds.
      }
    }
  }

  window.addEventListener('scroll', computeScroll, { passive: true });
  window.addEventListener('resize', computeScroll, { passive: true });
  computeScroll();

  function updateFallbackManifesto() {
    if (!manifesto) return;
    const progress = clamp((scroll - 0.78) / 0.14, 0, 1);
    const eased = smoothStep(progress);
    const exitProgress = smoothStep(range01(scroll, 0.90, 1));
    const visibleProgress = eased * (1 - exitProgress);
    const y = (1 - eased) * 28 - exitProgress * 42;
    root.style.setProperty('--hero-manifesto-opacity', visibleProgress.toFixed(4));
    root.style.setProperty('--hero-manifesto-y', `${y.toFixed(2)}px`);
    root.style.setProperty('--hero-manifesto-exit-progress', exitProgress.toFixed(4));
    manifesto.style.visibility = visibleProgress > 0.01 ? 'visible' : 'hidden';
    manifesto.style.pointerEvents = visibleProgress > 0.98 && exitProgress < 0.02 ? 'auto' : 'none';
    manifesto.classList.toggle('is-active', visibleProgress > 0.01);
    manifesto.classList.toggle('is-interactive', visibleProgress > 0.98 && exitProgress < 0.02);
  }

  if (reduceMotion) {
    back.style.opacity = '0';
    middle.style.opacity = '0';
    figure.style.opacity = '0';
    if (content) {
      content.style.opacity = '1';
      content.style.pointerEvents = 'auto';
      content.style.transform = 'none';
      content.style.zIndex = '6';
    }
    runtime.markLoaded(120);
    return;
  }

  function tick() {
    mx = lerp(mx, tx, 0.08);
    my = lerp(my, ty, 0.08);
    back.style.transform = `translate3d(calc(-50% + ${mx * -10}px), calc(-52% + ${my * -6 - scroll * 28}px), 0) scale(${1.08 + scroll * 0.06})`;
    middle.style.transform = `translate3d(calc(-50% + ${mx * -24}px), calc(2% + ${my * -12 - scroll * 120}px), 0) scale(${1.02 + scroll * 0.58})`;
    figure.style.transform = `translate3d(calc(-50% + ${mx * 10}px), calc(-50% + ${my * 8 - scroll * 18}px), 0) scale(${1 + scroll * 0.08})`;
    if (content) content.style.transform = `translate3d(${mx * 8}px, ${my * 5 - scroll * 180}px, 0)`;
    updateFallbackManifesto();
    requestAnimationFrame(tick);
  }
  tick();
  runtime.markLoaded(600);
}

export function initLayeredHero(options = {}) {
  const root = options.root || document.documentElement;
  const body = options.body || document.body;
  const runtime = options.runtime || { markLoaded() {} };
  const reduceMotion = Boolean(options.reduceMotion);
  const config = { ...DEFAULT_HERO_CONFIG, ...(options.config || {}) };
  const {
    heroVideoSrc: HERO_VIDEO_SRC,
    heroBackSceneSrc: HERO_BACK_SCENE_SRC,
    heroNextSceneSrc: HERO_NEXT_SCENE_SRC,
    heroBackDepthSrc: HERO_BACK_DEPTH_SRC,
    heroMiddleDepthSrc: HERO_MIDDLE_DEPTH_SRC,
    heroIntroDurationSeconds: HERO_INTRO_DURATION_SECONDS,
    heroTitleStartProgress: HERO_TITLE_START_PROGRESS,
    heroSubtitleStartOffsetSeconds: HERO_SUBTITLE_START_OFFSET_SECONDS,
    heroLoaderReadyDelayMs: HERO_LOADER_READY_DELAY_MS,
    heroPreTransitionRangeVh: HERO_PRE_TRANSITION_RANGE_VH,
    heroSceneTransitionRangeVh: HERO_SCENE_TRANSITION_RANGE_VH,
    heroVideoSegmentSeconds: HERO_VIDEO_SEGMENT_SECONDS,
    heroBackBaseScale: HERO_BACK_BASE_SCALE,
    heroBackScrollScaleDelta: HERO_BACK_SCROLL_SCALE_DELTA,
    heroBackImageBoxScale: HERO_BACK_IMAGE_BOX_SCALE,
    heroMiddleBaseYVh: HERO_MIDDLE_BASE_Y_VH,
    heroMiddleBaseScale: HERO_MIDDLE_BASE_SCALE,
    heroMiddleScrollScaleDelta: HERO_MIDDLE_SCROLL_SCALE_DELTA,
    heroFigureBaseYVh: HERO_FIGURE_BASE_Y_VH,
    heroFigureBaseScale: HERO_FIGURE_BASE_SCALE
  } = config;
  const { gsap, ScrollTrigger } = window;
  const hero = document.querySelector('.hero-wrap');
  const scene = document.querySelector('.fallback-scene');
  const back = document.querySelector('.fallback-back');
  const middle = document.querySelector('.fallback-middle');
  const middleNearBlur = document.querySelector('.fallback-middle-near-blur');
  const figure = document.querySelector('.fallback-figure');
  const content = document.querySelector('.hero-content');
  const manifesto = document.querySelector('.manifesto');
  const belief = document.querySelector('[data-hero-belief]');
  const nav = document.querySelector('.site-nav');
  const navEdgeBlur = document.querySelector('.scroll-edge-blur');
  const introInkCanvas = document.querySelector('[data-hero-intro-ink-canvas]');
  const inkCanvas = document.querySelector('[data-hero-ink-canvas]');
  const exitInkCanvas = document.querySelector('[data-hero-exit-ink-canvas]');
  const starFieldCanvas = null;
  const introInkTransition = createInkSceneTransition(introInkCanvas, {
    assets: {
      nextSceneSrc: HERO_NEXT_SCENE_SRC,
      backDepthSrc: HERO_BACK_DEPTH_SRC,
      middleDepthSrc: HERO_MIDDLE_DEPTH_SRC
    },
    targetSrc: HERO_BACK_SCENE_SRC,
    farOnly: true,
    hideAtEnd: true,
    imageScale: HERO_BACK_IMAGE_BOX_SCALE * HERO_BACK_BASE_SCALE,
    imageCenterX: 0.5,
    imageCenterY: 0.5,
    inkCenterX: 0.5,
    inkCenterY: 0.5,
    progressSpan: 1,
    colorLift: 0.72,
    sourceElement: back
  });
  const inkTransition = null;
  const exitInkTransition = createInkCurtainTransition(exitInkCanvas, {
    direction: 'bottom-up',
    colorLift: 0.56,
    coverAlpha: 0.82,
    fadeOutStart: 0.74,
    fadeOutEnd: 0.98,
    progressSpan: 1
  });

  if (!hero || !scene || !back || !middle || !figure || !content) return;

  const starFieldReveal = null;

  root.classList.add('layered-hero-ready');
  figure.src = HERO_VIDEO_SRC;
  figure.muted = true;
  figure.loop = false;
  figure.autoplay = false;
  figure.playsInline = true;
  figure.preload = 'auto';
  figure.setAttribute('muted', '');
  figure.setAttribute('playsinline', '');
  figure.setAttribute('webkit-playsinline', '');

  let segmentStart = 0.34;
  let segmentEnd = 2.45;
  let videoEnergy = 0;
  let lastVideoEnergyAt = performance.now();
  let lastHeroScrollAt = 0;
  let previousTargetProgress = null;
  let mouseX = 0;
  let mouseY = 0;
  const parallaxMouse = { x: 0, y: 0 };
  const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.9, ease: 'power3.out' });
  const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.9, ease: 'power3.out' });
  const heroIntroState = { progress: 0 };
  let heroIntroStarted = false;
  let heroIntroComplete = false;
  let titleIntroPlayed = false;

  const syncSegmentBounds = () => {
    const duration = Number.isFinite(figure.duration) && figure.duration > 0 ? figure.duration : 5.04;
    segmentStart = Math.min(0.42, Math.max(0, duration * 0.08));
    segmentEnd = Math.min(duration - 0.08, segmentStart + Math.min(HERO_VIDEO_SEGMENT_SECONDS, duration * 0.55));
    if (figure.readyState >= 1 && (!figure.currentTime || figure.currentTime < segmentStart || figure.currentTime > segmentEnd)) {
      try {
        figure.currentTime = segmentStart;
      } catch {
        // Metadata can settle a beat later on WebKit.
      }
    }
  };

  figure.addEventListener('loadedmetadata', syncSegmentBounds, { once: true });
  figure.addEventListener('canplay', syncSegmentBounds, { once: true });
  window.setTimeout(syncSegmentBounds, 900);

  [back, middle, middleNearBlur, figure].filter(Boolean).forEach((layer) => {
    layer.style.transform = 'none';
  });

  gsap.set(back, {
    xPercent: -50,
    yPercent: -50,
    scale: HERO_BACK_BASE_SCALE,
    transformOrigin: '50% 50%',
    force3D: true
  });
  gsap.set([middle, middleNearBlur].filter(Boolean), {
    xPercent: -50,
    yPercent: -50,
    y: `${HERO_MIDDLE_BASE_Y_VH}vh`,
    scale: HERO_MIDDLE_BASE_SCALE,
    transformOrigin: '50% 62%',
    force3D: true
  });
  gsap.set(figure, {
    xPercent: -50,
    yPercent: -50,
    y: `${HERO_FIGURE_BASE_Y_VH}vh`,
    scale: HERO_FIGURE_BASE_SCALE,
    transformOrigin: '50% 60%',
    force3D: true
  });
  gsap.set(content, {
    opacity: 1,
    visibility: 'visible',
    y: 0,
    filter: 'none',
    force3D: true
  });
  content.style.pointerEvents = 'none';
  if (manifesto) {
    gsap.set(manifesto, { opacity: 0, y: 28, visibility: 'hidden', force3D: true });
    manifesto.classList.remove('is-active', 'is-interactive');
  }
  if (belief) {
    gsap.set(belief, { opacity: 0, y: 0, visibility: 'hidden', force3D: true });
  }
  const titleChars = gsap.utils.toArray(content.querySelectorAll('.hero-title-char'));
  const subtitle = content.querySelector('.hero-subtitle');
  gsap.set(titleChars, {
    autoAlpha: 0,
    y: 18,
    scaleX: 0.94,
    filter: 'blur(9px)',
    transformOrigin: '50% 50%',
    force3D: true
  });
  if (subtitle) {
    gsap.set(subtitle, {
      autoAlpha: 0,
      y: 14,
      filter: 'blur(6px)',
      force3D: true
    });
  }
  const titleTimeline = gsap.timeline({
    paused: true,
    defaults: { ease: 'power3.out' }
  }).to(titleChars, {
    autoAlpha: 1,
    y: 0,
    scaleX: 1,
    filter: 'blur(0px)',
    duration: 1.35,
    stagger: {
      each: 0.16,
      from: 'start'
    }
  }, 0);
  if (subtitle) {
    titleTimeline.to(subtitle, {
      autoAlpha: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 2.85,
      ease: 'sine.inOut'
    }, HERO_SUBTITLE_START_OFFSET_SECONDS);
  }

  if (nav) gsap.set(nav, { autoAlpha: 0, y: -14, pointerEvents: 'none' });
  if (navEdgeBlur) gsap.set(navEdgeBlur, { autoAlpha: 0 });
  if (introInkCanvas) gsap.set(introInkCanvas, { autoAlpha: 0 });
  if (inkCanvas) gsap.set(inkCanvas, { autoAlpha: 0 });
  if (exitInkCanvas) gsap.set(exitInkCanvas, { autoAlpha: 0 });
  if (starFieldCanvas) gsap.set(starFieldCanvas, { autoAlpha: 0 });

  const setBackY = gsap.quickSetter(back, 'y', 'px');
  const setBackX = gsap.quickSetter(back, 'x', 'px');
  const setBackScaleX = gsap.quickSetter(back, 'scaleX');
  const setBackScaleY = gsap.quickSetter(back, 'scaleY');
  const setBackOpacity = gsap.quickSetter(back, 'opacity');
  const setMiddleY = gsap.quickSetter(middle, 'y', 'px');
  const setMiddleX = gsap.quickSetter(middle, 'x', 'px');
  const setMiddleScaleX = gsap.quickSetter(middle, 'scaleX');
  const setMiddleScaleY = gsap.quickSetter(middle, 'scaleY');
  const setMiddleOpacity = gsap.quickSetter(middle, 'opacity');
  const setMiddleNearBlurY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'y', 'px') : null;
  const setMiddleNearBlurX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'x', 'px') : null;
  const setMiddleNearBlurScaleX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleX') : null;
  const setMiddleNearBlurScaleY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleY') : null;
  const setFigureY = gsap.quickSetter(figure, 'y', 'px');
  const setFigureX = gsap.quickSetter(figure, 'x', 'px');
  const setFigureScaleX = gsap.quickSetter(figure, 'scaleX');
  const setFigureScaleY = gsap.quickSetter(figure, 'scaleY');
  const setFigureOpacity = gsap.quickSetter(figure, 'opacity');
  const setContentY = gsap.quickSetter(content, 'y', 'px');
  const setContentX = gsap.quickSetter(content, 'x', 'px');
  const setContentOpacity = gsap.quickSetter(content, 'opacity');
  const setManifestoOpacity = manifesto ? gsap.quickSetter(manifesto, 'opacity') : null;
  const setManifestoY = manifesto ? gsap.quickSetter(manifesto, 'y', 'px') : null;
  const setBeliefOpacity = belief ? gsap.quickSetter(belief, 'opacity') : null;
  const setBeliefY = belief ? gsap.quickSetter(belief, 'y', 'px') : null;
  const setMiddleNearBlurOpacity = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'opacity') : null;
  const setNavOpacity = nav ? gsap.quickSetter(nav, 'opacity') : null;
  const setNavY = nav ? gsap.quickSetter(nav, 'y', 'px') : null;
  const setNavEdgeBlurOpacity = navEdgeBlur ? gsap.quickSetter(navEdgeBlur, 'opacity') : null;

  let renderedProgress = 0;
  let lastApplied = -1;
  let lastIntroProgress = -1;
  let lastMouseAppliedX = 99;
  let lastMouseAppliedY = 99;
  let lastNavReveal = -1;
  let lastInkProgress = -1;
  let lastManifestoProgress = -1;
  let lastManifestoExitProgress = -1;
  let lastBeliefProgress = -1;
  let lastBeliefExitProgress = -1;
  let lastSecondSceneRenderAt = 0;
  let touchStartY = 0;

  const smoothStep = (value) => value * value * (3 - 2 * value);
  const farInkEase = gsap.parseEase?.('sine.inOut') || smoothStep;
  const layerEntranceEase = gsap.parseEase?.('sine.inOut') || smoothStep;
  const stagedLayerEase = (value) => layerEntranceEase(clamp(value, 0, 1));
  const range01 = (value, start, end) => clamp((value - start) / (end - start), 0, 1);
  const getHeroRanges = () => {
    const totalRange = Math.max(1, hero.offsetHeight - window.innerHeight);
    const viewportH = Math.max(1, window.innerHeight);
    const transitionStartRange = Math.min(totalRange, viewportH * (HERO_PRE_TRANSITION_RANGE_VH / 100));
    const availableTransitionRange = Math.max(1, totalRange - transitionStartRange);
    const transitionRange = Math.min(availableTransitionRange, viewportH * (HERO_SCENE_TRANSITION_RANGE_VH / 100));
    const sceneRange = Math.max(1, transitionStartRange + transitionRange);
    return { totalRange, sceneRange, transitionStartRange, transitionRange };
  };
  const updateIntroInkTransition = (visibilityProgress, renderProgress = visibilityProgress) => {
    if (introInkCanvas) {
      const clarity = smoothStep(renderProgress);
      const blur = 4.5 + (1 - clarity) * 6.2;
      const saturate = 0.86 + clarity * 0.10;
      const contrast = 0.92 + clarity * 0.06;
      const brightness = 0.12 + clarity * 0.40;
      introInkCanvas.style.filter = `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(3)}) contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }
    introInkTransition?.render(renderProgress, mouseX, mouseY, visibilityProgress);
  };
  const updateInkTransition = (progress, renderOptions = {}) => {
    inkTransition?.render(progress, mouseX, mouseY, progress, renderOptions);
  };
  const updateExitInkTransition = (progress) => {
    exitInkTransition?.render(progress, mouseX, mouseY);
  };
  const playHeroTextIntro = () => {
    if (titleIntroPlayed) return;
    titleIntroPlayed = true;
    titleTimeline.restart(true);
  };
  const playHeroIntro = () => {
    if (heroIntroStarted) return;
    heroIntroStarted = true;
    gsap.timeline({
      defaults: { ease: 'none' },
      onComplete: () => {
        heroIntroState.progress = 1;
        heroIntroComplete = true;
        lastApplied = -1;
        lastIntroProgress = -1;
        updateHeroLayers();
        playHeroTextIntro();
      }
    }).to(heroIntroState, {
      progress: 1,
      duration: HERO_INTRO_DURATION_SECONDS,
      ease: 'none',
      onUpdate: updateHeroLayers
    }, 0);
  };
  const normalizeWheelDelta = (event) => {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  };
  const clampTopScroll = () => {
    const top = hero.offsetTop;
    if (window.scrollY > top + 1) return false;
    window.scrollTo(0, top);
    return true;
  };
  const handleTopWheel = (event) => {
    const delta = normalizeWheelDelta(event);
    const top = hero.offsetTop;
    if (delta >= 0 || window.scrollY > top + Math.abs(delta) + 1) return;
    window.scrollTo(0, top);
    event.preventDefault();
    lastHeroScrollAt = performance.now();
  };
  const handleTopTouchStart = (event) => {
    touchStartY = event.touches?.[0]?.clientY || 0;
  };
  const handleTopTouchMove = (event) => {
    const currentY = event.touches?.[0]?.clientY || 0;
    const pullingDown = currentY > touchStartY;
    if (!pullingDown || !clampTopScroll()) return;
    event.preventDefault();
    lastHeroScrollAt = performance.now();
  };

  const updateVideoPlayback = (progress, scrollDelta) => {
    const now = performance.now();
    const elapsedFrames = clamp((now - lastVideoEnergyAt) / 16.67, 0.5, 4);
    lastVideoEnergyAt = now;
    const inVideoRange = progress > 0.045 && progress < 0.74;
    const recentlyScrolled = now - lastHeroScrollAt < 120;
    const scrollMoving = inVideoRange && (recentlyScrolled || scrollDelta > 0.001);
    if (scrollMoving) {
      videoEnergy = 1;
    } else {
      videoEnergy *= Math.pow(0.955, elapsedFrames);
    }

    if (!inVideoRange || videoEnergy < 0.14) {
      videoEnergy = inVideoRange ? videoEnergy : 0;
      if (!figure.paused) figure.pause();
      return;
    }

    syncSegmentBounds();
    if (figure.currentTime >= segmentEnd - 0.035) {
      if (!scrollMoving) {
        videoEnergy = 0;
        figure.pause();
        return;
      }
      try {
        figure.currentTime = segmentStart;
      } catch {
        // Ignore transient seek failures; the next frame will retry.
      }
    }

    try {
      figure.playbackRate = clamp(0.56 + videoEnergy * 0.44, 0.56, 1);
    } catch {
      // Older engines can reject playbackRate changes during metadata setup.
    }
    if (figure.paused) figure.play().catch(() => undefined);
  };

  const updateDepthFilters = (progress, introProgress, middleIntro, figureIntro, firstSceneForegroundOpacity = 1) => {
    const introClarity = smoothStep(introProgress);
    const farClarity = smoothStep(range01(progress, 0.03, 0.66));
    const rockClarity = smoothStep(range01(progress, 0.10, 0.62));
    const farBlur = 1.15 + 3.35 * (1 - farClarity) + (1 - introClarity) * 6.2;
    const rockBlur = 0.15 * (1 - rockClarity) + (1 - middleIntro) * 18;
    const figureBlur = (1 - figureIntro) * 20;
    const nearBlurStrength = 1 - rockClarity;

    back.style.filter = `blur(${farBlur.toFixed(2)}px) saturate(${(0.88 + introClarity * 0.11 + farClarity * 0.08).toFixed(3)}) contrast(${(0.93 + introClarity * 0.06 + farClarity * 0.06).toFixed(3)}) brightness(${(0.20 + introClarity * 0.44 + farClarity * 0.24).toFixed(3)})`;
    middle.style.filter = `blur(${rockBlur.toFixed(2)}px) saturate(${(0.94 + rockClarity * 0.12).toFixed(3)}) contrast(${(0.97 + rockClarity * 0.07).toFixed(3)}) brightness(${(0.90 + rockClarity * 0.32).toFixed(3)})`;
    figure.style.filter = `url('#figure-alpha-clean') blur(${figureBlur.toFixed(2)}px) brightness(1.18) saturate(1.08) contrast(1.03)`;

    if (middleNearBlur) {
      setMiddleNearBlurOpacity(0.24 * nearBlurStrength * firstSceneForegroundOpacity);
    }
  };

  function updateHeroLayers() {
    const { totalRange, sceneRange } = getHeroRanges();
    const rawHeroScroll = window.scrollY - hero.offsetTop;
    const viewportH = window.innerHeight;
    const introProgress = clamp(heroIntroState.progress, 0, 1);
    if (introProgress >= HERO_TITLE_START_PROGRESS) {
      playHeroTextIntro();
    }
    const targetProgress = clamp(rawHeroScroll / sceneRange, 0, 1);
    const introSettled = heroIntroComplete || introProgress >= 0.999;
    let scrollDelta = 0;
    if (introSettled) {
      scrollDelta = previousTargetProgress === null ? 0 : Math.abs(targetProgress - previousTargetProgress);
      previousTargetProgress = targetProgress;
      renderedProgress += (targetProgress - renderedProgress) * 0.22;
    } else {
      previousTargetProgress = null;
      renderedProgress = 0;
    }
    if (introSettled) {
      mouseX = parallaxMouse.x;
      mouseY = parallaxMouse.y;
    } else {
      parallaxMouse.x = 0;
      parallaxMouse.y = 0;
      mouseX = 0;
      mouseY = 0;
    }
    updateVideoPlayback(renderedProgress, scrollDelta);

    const navReveal = setNavOpacity && setNavY
      ? (introSettled ? smoothStep(clamp((window.scrollY - (hero.offsetTop + totalRange + 16)) / 180, 0, 1)) : 0)
      : 0;
    const inkVisualProgress = 0;
    const heroInView = rawHeroScroll > -viewportH && rawHeroScroll < totalRange + viewportH;
    const manifestoEnterProgress = introSettled
      ? smoothStep(range01(rawHeroScroll, sceneRange - viewportH * 0.16, sceneRange + viewportH * 0.04))
      : 0;
    const manifestoExitStart = Math.max(sceneRange + viewportH * 0.20, totalRange - viewportH * 1.90);
    const manifestoExitEnd = Math.max(manifestoExitStart + viewportH * 0.52, totalRange - viewportH * 1.28);
    const manifestoExitProgress = introSettled
      ? smoothStep(range01(rawHeroScroll, manifestoExitStart, manifestoExitEnd))
      : 0;
    const manifestoSceneProgress = manifestoEnterProgress * (1 - smoothStep(range01(manifestoExitProgress, 0.985, 1)));
    const manifestoContentExitProgress = smoothStep(range01(manifestoExitProgress, 0.16, 0.50));
    const manifestoContentProgress = manifestoEnterProgress * (1 - manifestoContentExitProgress);
    const beliefExitStart = Math.max(manifestoExitEnd + viewportH * 0.34, totalRange - viewportH * 0.94);
    const beliefExitEnd = Math.max(beliefExitStart + viewportH * 0.48, totalRange - viewportH * 0.34);
    const beliefExitProgress = introSettled
      ? smoothStep(range01(rawHeroScroll, beliefExitStart, beliefExitEnd))
      : 0;
    const beliefEnterProgress = smoothStep(range01(manifestoExitProgress, 0.26, 0.52));
    const beliefSceneProgress = beliefEnterProgress * (1 - smoothStep(range01(beliefExitProgress, 0.58, 0.92)));
    const exitSweepProgress = smoothStep(range01(manifestoExitProgress, 0.015, 0.985));
    const exitOvershootProgress = smoothStep(range01(exitSweepProgress, 0.82, 1));
    const exitEdgePercent = 100 - exitSweepProgress * 100 - exitOvershootProgress * 24;
    const mouseChanged = Math.abs(lastMouseAppliedX - mouseX) > 0.001 || Math.abs(lastMouseAppliedY - mouseY) > 0.001;
    const introChanged = Math.abs(lastIntroProgress - introProgress) > 0.001;
    const navChanged = Math.abs(lastNavReveal - navReveal) > 0.001;
    const inkChanged = Math.abs(lastInkProgress - inkVisualProgress) > 0.001;
    const manifestoChanged = Math.abs(lastManifestoProgress - manifestoSceneProgress) > 0.001;
    const manifestoExitChanged = Math.abs(lastManifestoExitProgress - manifestoExitProgress) > 0.001;
    const beliefChanged = Math.abs(lastBeliefProgress - beliefSceneProgress) > 0.001;
    const beliefExitChanged = Math.abs(lastBeliefExitProgress - beliefExitProgress) > 0.001;
    const introInkAnimating = !heroIntroComplete && introProgress > 0.002 && introProgress < 0.999;
    const inkAnimating = inkVisualProgress > 0.002 && inkVisualProgress < 0.995;
    const exitInkAnimating = manifestoExitProgress > 0.002 && manifestoExitProgress < 0.995;
    const now = performance.now();
    const secondSceneFrameDue = Boolean(starFieldReveal?.ready && inkVisualProgress > 0.002 && heroInView && now - lastSecondSceneRenderAt > 72);
    if (Math.abs(lastApplied - renderedProgress) < 0.0012 && !introChanged && !introInkAnimating && !mouseChanged && !navChanged && !inkChanged && !manifestoChanged && !manifestoExitChanged && !beliefChanged && !beliefExitChanged && !inkAnimating && !exitInkAnimating && !secondSceneFrameDue) return;
    lastApplied = renderedProgress;
    lastIntroProgress = introProgress;
    lastMouseAppliedX = mouseX;
    lastMouseAppliedY = mouseY;
    lastNavReveal = navReveal;
    lastInkProgress = inkVisualProgress;
    lastManifestoProgress = manifestoSceneProgress;
    lastManifestoExitProgress = manifestoExitProgress;
    lastBeliefProgress = beliefSceneProgress;
    lastBeliefExitProgress = beliefExitProgress;

    const p = renderedProgress;
    const layerProgress = introSettled ? p : 0;
    const firstSceneForegroundOpacity = 1 - smoothStep(range01(inkVisualProgress, 0.08, 0.62));
    const firstSceneBackdropOpacity = 1 - smoothStep(range01(inkVisualProgress, 0.72, 0.98));
    const firstSceneForegroundVisible = firstSceneForegroundOpacity > 0.002;
    const viewportW = window.innerWidth;
    const farIntro = farInkEase(range01(introProgress, 0, 1));
    const middleIntro = stagedLayerEase(range01(introProgress, 0, 0.92));
    const figureIntro = stagedLayerEase(range01(introProgress, 0.02, 0.96));
    const backParallaxX = mouseX * 0.02;
    const backParallaxY = mouseY * 0.02;
    const middleParallaxX = mouseX * 0.04;
    const middleParallaxY = mouseY * 0.04;
    const figureParallaxX = mouseX * 0.06;
    const figureParallaxY = mouseY * 0.06;
    const backScrollY = (-5 * layerProgress) * viewportH / 100;
    const middleScrollY = (HERO_MIDDLE_BASE_Y_VH + layerProgress * (window.innerWidth < 600 ? 14 : 18)) * viewportH / 100;
    const figureScrollY = (HERO_FIGURE_BASE_Y_VH - layerProgress * 15) * viewportH / 100;
    const middleEnterY = (1 - middleIntro) * viewportH * 0.54;
    const middleEnterX = (1 - middleIntro) * viewportW * -0.018;
    const figureEnterY = (1 - figureIntro) * viewportH * 0.64;
    const figureEnterX = (1 - figureIntro) * viewportW * 0.028;

    setBackY(backScrollY + backParallaxY);
    setBackX(backParallaxX);
    const backOpacity = (introInkTransition ? smoothStep(range01(introProgress, 0.90, 0.97)) : (0.04 + farIntro * 0.96)) * firstSceneBackdropOpacity;
    setBackOpacity(backOpacity);
    back.style.visibility = backOpacity > 0.002 ? 'visible' : 'hidden';
    const backScale = HERO_BACK_BASE_SCALE + layerProgress * HERO_BACK_SCROLL_SCALE_DELTA;
    setBackScaleX(backScale);
    setBackScaleY(backScale);
    setMiddleY(middleScrollY + middleParallaxY + middleEnterY);
    setMiddleX(middleParallaxX + middleEnterX);
    setMiddleOpacity(firstSceneForegroundOpacity);
    middle.style.visibility = firstSceneForegroundVisible ? 'visible' : 'hidden';
    if (setMiddleNearBlurY) setMiddleNearBlurY(middleScrollY + middleParallaxY + middleEnterY);
    if (setMiddleNearBlurX) setMiddleNearBlurX(middleParallaxX + middleEnterX);
    const middleScale = HERO_MIDDLE_BASE_SCALE + layerProgress * HERO_MIDDLE_SCROLL_SCALE_DELTA + (1 - middleIntro) * 0.135;
    setMiddleScaleX(middleScale);
    setMiddleScaleY(middleScale);
    if (setMiddleNearBlurScaleX) setMiddleNearBlurScaleX(middleScale);
    if (setMiddleNearBlurScaleY) setMiddleNearBlurScaleY(middleScale);
    if (middleNearBlur) middleNearBlur.style.visibility = firstSceneForegroundVisible ? 'visible' : 'hidden';
    setFigureY(figureScrollY + figureParallaxY + figureEnterY);
    setFigureX(figureParallaxX + figureEnterX);
    const figureScale = HERO_FIGURE_BASE_SCALE + smoothStep(range01(layerProgress, 0.16, 0.92)) * 0.065 + (1 - figureIntro) * 0.12;
    setFigureScaleX(figureScale);
    setFigureScaleY(figureScale);
    setFigureOpacity(firstSceneForegroundOpacity);
    figure.style.visibility = firstSceneForegroundVisible ? 'visible' : 'hidden';
    if (!firstSceneForegroundVisible && !figure.paused) figure.pause();
    updateDepthFilters(layerProgress, farIntro, middleIntro, figureIntro, firstSceneForegroundOpacity);

    setContentX(0);
    setContentY(0);
    const heroContentOpacity = introSettled ? 1 - smoothStep(range01(inkVisualProgress, 0.06, 0.38)) : 1;
    setContentOpacity(heroContentOpacity);
    content.style.visibility = heroContentOpacity > 0.002 ? 'visible' : 'hidden';
    updateIntroInkTransition(introProgress, farIntro);
    const secondSceneSettle = smoothStep(range01(inkVisualProgress, 0.78, 1));
    const secondScenePerlinStrength = 0;
    const secondSceneBrightness = lerp(0.98, 0.92, secondSceneSettle);
    if (starFieldReveal?.ready && (inkChanged || inkAnimating || secondSceneFrameDue)) {
      const highlightResolve = smoothStep(range01(inkVisualProgress, 0.58, 1));
      starFieldReveal.renderBackground({
        timeSeconds: now / 1000,
        strength: lerp(1.35, 2.65, highlightResolve),
        noiseFloor: lerp(0.18, 0.03, highlightResolve)
      });
      starFieldCanvas.dataset.inkTextureReady = 'true';
      lastSecondSceneRenderAt = now;
    }
    updateInkTransition(inkVisualProgress, {
      perlinStrength: secondScenePerlinStrength,
      sceneBrightness: secondSceneBrightness
    });
    if (inkVisualProgress <= 0.002 || !starFieldReveal?.ready) {
      lastSecondSceneRenderAt = 0;
    }
    if (starFieldCanvas) {
      starFieldCanvas.style.visibility = 'hidden';
      starFieldCanvas.style.opacity = '0';
    }
    updateExitInkTransition(manifestoExitProgress);
    if (manifesto) {
      const manifestoY = (1 - manifestoEnterProgress) * 28;
      const manifestoContentY = -28 * manifestoContentExitProgress;
      const manifestoInteractive = manifestoSceneProgress > 0.98 && manifestoExitProgress < 0.02;
      const manifestoActive = manifestoSceneProgress > 0.01 && manifestoExitProgress < 0.998;
      root.style.setProperty('--hero-manifesto-opacity', manifestoSceneProgress.toFixed(4));
      root.style.setProperty('--hero-manifesto-y', `${manifestoY.toFixed(2)}px`);
      root.style.setProperty('--hero-manifesto-content-opacity', manifestoContentProgress.toFixed(4));
      root.style.setProperty('--hero-manifesto-content-y', `${manifestoContentY.toFixed(2)}px`);
      root.style.setProperty('--hero-exit-edge', `${exitEdgePercent.toFixed(2)}%`);
      root.style.setProperty('--hero-manifesto-exit-progress', manifestoExitProgress.toFixed(4));
      setManifestoOpacity(manifestoSceneProgress);
      setManifestoY(manifestoY);
      manifesto.style.visibility = manifestoActive ? 'visible' : 'hidden';
      manifesto.style.pointerEvents = manifestoInteractive ? 'auto' : 'none';
      manifesto.classList.toggle('is-active', manifestoActive);
      manifesto.classList.toggle('is-interactive', manifestoInteractive);
    }
    if (belief) {
      const beliefY = (1 - beliefEnterProgress) * viewportH * 0.035 - beliefExitProgress * viewportH * 0.06;
      const beliefActive = beliefSceneProgress > 0.01 && beliefExitProgress < 0.998;
      root.style.setProperty('--hero-belief-opacity', beliefSceneProgress.toFixed(4));
      root.style.setProperty('--hero-belief-y', `${beliefY.toFixed(2)}px`);
      setBeliefOpacity(beliefSceneProgress);
      setBeliefY(beliefY);
      belief.style.visibility = beliefActive ? 'visible' : 'hidden';
    }
    if (setNavOpacity && setNavY) {
      setNavOpacity(navReveal);
      setNavY((1 - navReveal) * -14);
      nav.style.visibility = navReveal > 0.01 ? 'visible' : 'hidden';
      nav.style.pointerEvents = navReveal > 0.98 ? 'auto' : 'none';
    }
    if (setNavEdgeBlurOpacity) {
      setNavEdgeBlurOpacity(navReveal);
      navEdgeBlur.style.visibility = navReveal > 0.01 ? 'visible' : 'hidden';
    }

    root.style.setProperty('--hero-progress', p.toFixed(4));
    root.style.setProperty('--hero-intro-progress', introProgress.toFixed(4));
    root.style.setProperty('--hero-transition-progress', inkVisualProgress.toFixed(4));
    root.style.setProperty('--hero-manifesto-progress', manifestoSceneProgress.toFixed(4));
    root.style.setProperty('--hero-manifesto-exit-progress', manifestoExitProgress.toFixed(4));
  }

  window.addEventListener('scroll', () => {
    lastHeroScrollAt = performance.now();
  }, { passive: true });

  window.addEventListener('wheel', handleTopWheel, { passive: false });
  window.addEventListener('touchstart', handleTopTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTopTouchMove, { passive: false });

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = hero.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) return;
    if (!heroIntroComplete) {
      parallaxMouse.x = 0;
      parallaxMouse.y = 0;
      return;
    }
    parallaxToX(event.clientX - window.innerWidth / 2);
    parallaxToY(event.clientY - window.innerHeight / 2);
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    parallaxToX(0);
    parallaxToY(0);
  }, { passive: true });

  gsap.ticker.add(updateHeroLayers);
  window.addEventListener('resize', () => {
    renderedProgress = -1;
    updateHeroLayers();
    ScrollTrigger.refresh();
  }, { passive: true });

  updateHeroLayers();
  ScrollTrigger.refresh();
  introInkTransition?.prewarm();
  inkTransition?.prewarm();
  exitInkTransition?.prewarm();
  if (body.classList.contains('is-loader-hidden')) {
    playHeroIntro();
  } else {
    window.addEventListener('site:loader-hidden', playHeroIntro, { once: true });
  }
  runtime.markLoaded(HERO_LOADER_READY_DELAY_MS);
}
