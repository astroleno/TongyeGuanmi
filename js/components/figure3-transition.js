import { loadTransitionLibraries } from '../transitions/load-libraries.js';
import { createReduceMotionState, createScrollProgressTrigger } from '../transitions/scroll-scene.js';
import { prepareScrubVideo, seekVideoToProgress, waitForVideoMetadata } from '../transitions/video-scrub.js';

const DEFAULT_DURATION_SECONDS = 2;
const DEFAULT_SCROLL_VH = 20;
const DEFAULT_VIDEO_DURATION_FALLBACK = 5.04;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / (end - start));

function readNumberAttribute(element, name, fallback) {
  const value = Number(element?.dataset?.[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getFigure3TransitionElements(section) {
  return {
    alphaVideo: section?.querySelector('[data-figure3-alpha-video]') || null
  };
}

export function readFigure3TransitionConfig(section, overrides = {}) {
  return {
    durationSeconds: overrides.durationSeconds ?? readNumberAttribute(section, 'figure3Duration', DEFAULT_DURATION_SECONDS),
    scrollVh: overrides.scrollVh ?? readNumberAttribute(section, 'figure3ScrollVh', DEFAULT_SCROLL_VH),
    videoDurationFallback: overrides.videoDurationFallback
      ?? readNumberAttribute(section, 'figure3VideoDuration', DEFAULT_VIDEO_DURATION_FALLBACK)
  };
}

function acceleratedProgress(rawProgress) {
  const t = clamp(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t);
}

function setComponentProgress(section, progress) {
  const p = clamp(progress);
  const fill = smoothStep(range01(p, 0.86, 0.995));
  const videoOpacity = 1 - smoothStep(range01(p, 0.93, 1));
  const backdropSettle = smoothStep(range01(p, 0.06, 0.84));

  section.style.setProperty('--figure3-progress', p.toFixed(4));
  section.style.setProperty('--figure3-fill-opacity', fill.toFixed(4));
  section.style.setProperty('--figure3-video-opacity', videoOpacity.toFixed(4));
  section.style.setProperty('--figure3-backdrop-opacity', (1 - backdropSettle * 0.46).toFixed(4));
  section.style.setProperty('--figure3-backdrop-scale', (1.06 + backdropSettle * 0.08).toFixed(4));
  section.style.setProperty('--figure3-video-scale', (1.004 + p * 0.052).toFixed(4));
  return {
    visualProgress: Number(p.toFixed(4)),
    sceneOpacity: Number(videoOpacity.toFixed(4))
  };
}

export function renderFigure3TransitionProgress(section, rawProgress, options = {}) {
  if (!section) return null;

  const { alphaVideo } = getFigure3TransitionElements(section);
  const config = readFigure3TransitionConfig(section, options);
  const video = options.alphaVideo ?? alphaVideo;
  const visualProgress = acceleratedProgress(rawProgress);

  const metrics = setComponentProgress(section, visualProgress);
  seekVideoToProgress(video, visualProgress, {
    fallbackSeconds: config.videoDurationFallback,
    endPaddingSeconds: options.endPaddingSeconds ?? 0.02,
    minDeltaSeconds: options.minDeltaSeconds ?? 0.016
  });
  return metrics;
}

export function prepareFigure3Transition(section, options = {}) {
  const elements = getFigure3TransitionElements(section);

  prepareScrubVideo(elements.alphaVideo, options.videoOptions);
  if (Number.isFinite(options.progress)) {
    renderFigure3TransitionProgress(section, options.progress, elements);
  }

  return elements;
}

export function waitForFigure3TransitionMetadata(section, options = {}) {
  const { alphaVideo } = getFigure3TransitionElements(section);
  return waitForVideoMetadata(alphaVideo, options);
}

export async function initFigure3Transition(section, options = {}) {
  if (!section) {
    return {
      destroy() {}
    };
  }

  const config = readFigure3TransitionConfig(section, options);
  const {
    gsap = window.gsap,
    ScrollTrigger = window.ScrollTrigger,
    reduceMotion = createReduceMotionState(),
    durationSeconds = config.durationSeconds,
    scrollVh = config.scrollVh,
    videoDurationFallback = config.videoDurationFallback,
    refresh = true
  } = options;

  if (!reduceMotion && (!gsap || !ScrollTrigger)) {
    throw new Error('Figure3 transition requires GSAP and ScrollTrigger.');
  }

  const { alphaVideo } = getFigure3TransitionElements(section);
  const playhead = { raw: 0 };
  let progressTween = null;
  let scrollTrigger = null;
  let destroyed = false;

  const renderRawProgress = (rawProgress) => {
    renderFigure3TransitionProgress(section, rawProgress, {
      alphaVideo,
      videoDurationFallback
    });
  };

  const tweenToRawProgress = (rawProgress) => {
    if (destroyed) return;

    const target = clamp(rawProgress);
    const distance = Math.abs(target - playhead.raw);

    progressTween?.kill?.();
    progressTween = null;

    if (distance < 0.001 || reduceMotion) {
      playhead.raw = target;
      renderRawProgress(playhead.raw);
      return;
    }

    progressTween = gsap.to(playhead, {
      raw: target,
      duration: Math.max(0.06, distance * durationSeconds),
      ease: 'none',
      overwrite: true,
      onUpdate: () => renderRawProgress(playhead.raw),
      onComplete: () => {
        playhead.raw = target;
        progressTween = null;
        renderRawProgress(playhead.raw);
      }
    });
  };

  const resetTransition = () => {
    tweenToRawProgress(0);
  };

  prepareFigure3Transition(section);

  if (reduceMotion) {
    playhead.raw = 1;
    renderRawProgress(1);
    waitForVideoMetadata(alphaVideo).then(() => {
      if (!destroyed) renderRawProgress(1);
    });
  } else {
    await waitForVideoMetadata(alphaVideo);

    if (destroyed) {
      return {
        destroy() {}
      };
    }

    const trigger = createScrollProgressTrigger({
      ScrollTrigger,
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.max(1, window.innerHeight * (scrollVh / 100))}`,
      onUpdate: (self) => tweenToRawProgress(self.progress),
      onLeave: () => tweenToRawProgress(1),
      onLeaveBack: resetTransition
    });
    scrollTrigger = trigger;
    renderRawProgress(0);
  }

  if (refresh) ScrollTrigger?.refresh?.();

  return {
    section,
    reset: resetTransition,
    destroy() {
      destroyed = true;
      progressTween?.kill?.();
      progressTween = null;
      scrollTrigger?.destroy?.();
      alphaVideo?.pause?.();
    }
  };
}

export async function mountFigure3Transitions(options = {}) {
  const {
    selector = '[data-figure3-transition]',
    root = document,
    loadLibraries = true,
    libraryOptions = {},
    ...transitionOptions
  } = options;

  const sections = [...root.querySelectorAll(selector)];
  if (!sections.length) return [];

  const reduceMotion = transitionOptions.reduceMotion ?? createReduceMotionState();
  let runtime = {
    gsap: transitionOptions.gsap || window.gsap,
    ScrollTrigger: transitionOptions.ScrollTrigger || window.ScrollTrigger
  };

  if (!reduceMotion && loadLibraries && (!runtime.gsap || !runtime.ScrollTrigger)) {
    runtime = await loadTransitionLibraries(libraryOptions);
  }

  if (!reduceMotion) runtime.gsap.registerPlugin(runtime.ScrollTrigger);

  return Promise.all(sections.map((section) => initFigure3Transition(section, {
    ...transitionOptions,
    reduceMotion,
    gsap: runtime.gsap,
    ScrollTrigger: runtime.ScrollTrigger,
    refresh: false
  }))).then((instances) => {
    runtime.ScrollTrigger?.refresh?.();
    return instances;
  });
}
