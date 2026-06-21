import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from '../transitions/video-scrub.js';

const VIDEO_DURATION_FALLBACK = 76 / 30;
const BG_PARALLAX_Y = -18;
const FRONT_PARALLAX_Y = 230;
const FIGURE_PARALLAX_Y = 135;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function smoothStep(value) {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
}

function acceleratedProgress(rawProgress) {
  const p = clamp(rawProgress);
  return clamp(0.78 * p + 0.22 * p * p);
}

export function getPhTransitionElements(stage) {
  return {
    alphaVideo: stage?.querySelector('[data-ph-alpha-video]') || null
  };
}

export function preparePhTransition(stage, { progress = 0 } = {}) {
  const { alphaVideo } = getPhTransitionElements(stage);
  prepareScrubVideo(alphaVideo);
  renderPhTransitionProgress(stage, progress, { alphaVideo });
  return { alphaVideo };
}

export function renderPhTransitionProgress(stage, rawProgress, options = {}) {
  if (!stage) return;

  const { alphaVideo } = getPhTransitionElements(stage);
  const p = acceleratedProgress(rawProgress);
  const eased = smoothStep(p);

  stage.style.setProperty('--ph-progress', p.toFixed(4));
  stage.style.setProperty('--ph-bg-parallax-y', `${(eased * BG_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-front-parallax-y', `${(eased * FRONT_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-figure-parallax-y', `${(eased * FIGURE_PARALLAX_Y).toFixed(2)}px`);

  seekVideoToProgress(options.alphaVideo ?? alphaVideo, p, {
    fallbackSeconds: options.videoDurationFallback ?? VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: options.endPaddingSeconds ?? 0.02,
    minDeltaSeconds: options.minDeltaSeconds ?? 0.016
  });
}

export function waitForPhTransitionMetadata(stage, options = {}) {
  const { alphaVideo } = getPhTransitionElements(stage);
  return waitForVideoMetadata(alphaVideo, options);
}
