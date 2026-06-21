import { createTransitionRoute } from './transitions/route-entry.js';
import { createScrollProgressTrigger } from './transitions/scroll-scene.js';
import {
  preparePhTransition,
  renderPhTransitionProgress,
  waitForPhTransitionMetadata
} from './components/ph-transition.js';

const stage = document.querySelector('[data-ph-stage]');
const alphaVideo = document.querySelector('[data-ph-alpha-video]');

const TRANSITION_DURATION_SECONDS = 2.5;
const SCROLL_TRIGGER_VH = 20;

let progressTween = null;
const playhead = { raw: 0 };

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function renderRawProgress(rawProgress) {
  playhead.raw = clamp(rawProgress);
  renderPhTransitionProgress(stage, playhead.raw, { alphaVideo });
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
      preparePhTransition(stage, { progress: 0 });
      renderRawProgress(0);
    },
    onReducedMotion: () => {
      let active = true;
      renderRawProgress(1);
      waitForPhTransitionMetadata(stage).then(() => {
        if (active) renderRawProgress(1);
      });

      return () => {
        active = false;
      };
    },
    beforeMount: () => waitForPhTransitionMetadata(stage),
    mount: ({ ScrollTrigger }) => {
      renderRawProgress(0);

      const scrollTrigger = createScrollProgressTrigger({
        ScrollTrigger,
        trigger: stage,
        start: 'top top',
        end: () => `+=${Math.max(1, window.innerHeight * (SCROLL_TRIGGER_VH / 100))}`,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (self.progress <= 0.001 && self.direction >= 0) {
            renderRawProgress(0);
            return;
          }

          tweenToRawProgress(self.direction >= 0 ? 1 : 0);
        },
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
