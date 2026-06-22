import { createTransitionRoute } from './transitions/route-entry.js';
import { createScrollProgressTrigger } from './transitions/scroll-scene.js';
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from './transitions/video-scrub.js';

const stage = document.querySelector('[data-ph-stage]');
const alphaVideo = document.querySelector('[data-ph-alpha-video]');

const VIDEO_DURATION_FALLBACK = 4.04;
const TRANSITION_DURATION_SECONDS = 2.5;
const SCROLL_TRIGGER_VH = 20;
const BG_PARALLAX_Y = -18;
const FRONT_PARALLAX_Y = 230;
const FIGURE_PARALLAX_Y = 135;

let progressTween = null;
const playhead = { raw: 0 };

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(value) {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
}

function acceleratedProgress(rawProgress) {
  const p = clamp(rawProgress);
  return clamp(0.78 * p + 0.22 * p * p);
}

function setSceneProgress(progress) {
  if (!stage) return;

  const p = clamp(progress);
  const eased = smoothStep(p);
  stage.style.setProperty('--ph-progress', p.toFixed(4));
  stage.style.setProperty('--ph-bg-parallax-y', `${(eased * BG_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-front-parallax-y', `${(eased * FRONT_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-figure-parallax-y', `${(eased * FIGURE_PARALLAX_Y).toFixed(2)}px`);
}

function renderRawProgress(rawProgress) {
  const visualProgress = acceleratedProgress(rawProgress);
  setSceneProgress(visualProgress);
  seekVideoToProgress(alphaVideo, visualProgress, {
    fallbackSeconds: VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
}

function tweenToRawProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (distance < 0.001 || !gsap) {
    playhead.raw = target;
    renderRawProgress(playhead.raw);
    return;
  }

  progressTween = gsap.to(playhead, {
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

function resetTransition() {
  tweenToRawProgress(0);
}

if (stage && alphaVideo) {
  createTransitionRoute({
    name: 'PH transition',
    stage,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    },
    prepare: () => {
      prepareScrubVideo(alphaVideo);
      setSceneProgress(0);
    },
    onReducedMotion: () => {
      let active = true;
      playhead.raw = 1;
      renderRawProgress(1);
      waitForVideoMetadata(alphaVideo).then(() => {
        if (active) renderRawProgress(1);
      });

      return () => {
        active = false;
      };
    },
    beforeMount: () => waitForVideoMetadata(alphaVideo),
    mount: ({ ScrollTrigger }) => {
      renderRawProgress(0);

      const scrollTrigger = createScrollProgressTrigger({
        ScrollTrigger,
        trigger: stage,
        start: 'top top',
        end: () => `+=${Math.max(1, window.innerHeight * (SCROLL_TRIGGER_VH / 100))}`,
        invalidateOnRefresh: true,
        onUpdate: (self) => tweenToRawProgress(self.progress),
        onLeave: () => tweenToRawProgress(1),
        onLeaveBack: resetTransition
      });

      return () => {
        progressTween?.kill?.();
        scrollTrigger.destroy();
        alphaVideo.pause();
      };
    },
    onError: (error) => {
      console.warn('PH transition failed to initialize.', error);
      renderRawProgress(0);
    }
  });
}
