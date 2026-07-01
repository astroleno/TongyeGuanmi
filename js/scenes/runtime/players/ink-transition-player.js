import { createInkCurtainTransition } from '../../../effects/ink-scene-transition.js';
import { mountPatternBloomTransition } from '../../../transitions/pattern-bloom-adapter.js';

const PATTERN_BLOOM_SEGMENTS = Object.freeze({
  'hero-to-pattern': {
    start: 0,
    end: 0.58,
    durationMs: 1500,
    visual: 'radial-center-reveal',
    center: { x: 0.50, y: 0.55, mobileX: 0.50, mobileY: 0.58 }
  },
  'pattern-to-star-map': {
    start: 0.58,
    end: 1,
    durationMs: 1650,
    visual: 'rotating-left-exit',
    center: { x: 0.24, y: 0.55, mobileX: 0.50, mobileY: 0.58 }
  }
});

const INK_CURTAIN_SEGMENTS = Object.freeze({
  'star-map-to-aod': {
    durationMs: 860,
    visual: 'horizontal-irregular-bottom-up',
    coverAt: 0.52
  }
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);

function animationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPatternTexture(root, timeoutMs = 1300) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const readyCanvas = root.querySelector(
      '.pattern-bloom-transition__stage .pattern-bloom-transition__canvas[data-ink-texture-ready="true"]'
    );
    if (readyCanvas) return true;
    await animationFrame();
  }
  return false;
}

async function animate({
  from = 0,
  to = 1,
  durationMs,
  isStopped,
  onUpdate
}) {
  const startedAt = performance.now();
  onUpdate(from);

  while (!isStopped()) {
    await animationFrame();
    const elapsed = performance.now() - startedAt;
    const progress = clamp(elapsed / Math.max(1, durationMs));
    const value = from + (to - from) * smoothStep(progress);
    onUpdate(value);
    if (progress >= 1) break;
  }

  return !isStopped();
}

export function createInkTransitionPlayer({
  root = document,
  reduceMotion = false,
  claimLayer = () => {},
  onCover = () => {}
} = {}) {
  let activeCleanup = null;
  let stopped = false;

  function cleanup() {
    activeCleanup?.();
    activeCleanup = null;
  }

  async function playPatternBloom({ segment, config }) {
    claimLayer({ layer: 'visual-stage', owner: 'SegmentPlayer', segmentId: segment.id });
    claimLayer({ layer: 'ink-mask', owner: 'SegmentPlayer', segmentId: segment.id });
    stopped = false;
    cleanup();

    const host = root.querySelector(`[data-scene-id="${segment.from}"]`)
      || root.querySelector(`[data-scene-id="${segment.to}"]`)
      || root.body;
    let controlledProgress = reduceMotion ? config.end : config.start;
    const transition = mountPatternBloomTransition({
      host,
      reduceMotion,
      progressSource: () => controlledProgress,
      addCleanup: (destroy) => {
        activeCleanup = destroy;
      },
      center: config.center
    });
    activeCleanup = transition.destroy;

    if (reduceMotion) {
      controlledProgress = config.end;
      await wait(80);
      cleanup();
      return { progress: 1, visual: config.visual, reducedMotion: true };
    }

    await waitForPatternTexture(root);
    const completed = await animate({
      from: config.start,
      to: config.end,
      durationMs: config.durationMs,
      isStopped: () => stopped,
      onUpdate: (value) => {
        controlledProgress = value;
      }
    });

    if (!completed) {
      cleanup();
      return { cancelled: true, visual: config.visual };
    }
    return { progress: 1, visual: config.visual };
  }

  async function playInkCurtain({ segment, config }) {
    claimLayer({ layer: 'ink-mask', owner: 'SegmentPlayer', segmentId: segment.id });
    stopped = false;
    cleanup();

    const canvas = root.createElement('canvas');
    canvas.className = 'scene-runtime-ink-canvas';
    canvas.dataset.inkTransitionPlayer = 'mvp';
    canvas.dataset.segmentId = segment.id;
    canvas.setAttribute('aria-hidden', 'true');
    (root.body || root.documentElement).append(canvas);
    activeCleanup = () => {
      canvas.remove();
    };

    const inkTransition = reduceMotion ? null : createInkCurtainTransition(canvas, {
      direction: 'bottom-up',
      colorLift: 0.64,
      coverAlpha: 0.64,
      fadeOutStart: 0.82,
      fadeOutEnd: 1,
      progressSpan: 1
    });

    if (reduceMotion || !inkTransition) {
      inkTransition?.render(1);
      onCover({ segment, progress: 1, reducedMotion: reduceMotion, webglFallback: !inkTransition });
      cleanup();
      return {
        progress: 1,
        visual: config.visual,
        reducedMotion: reduceMotion,
        webglFallback: !inkTransition
      };
    }

    inkTransition.prewarm?.();
    let coverReported = false;
    const completed = await animate({
      from: 0,
      to: 1,
      durationMs: config.durationMs,
      isStopped: () => stopped,
      onUpdate: (progress) => {
        inkTransition.render(progress);
        if (!coverReported && progress >= (config.coverAt ?? 0.5)) {
          coverReported = true;
          onCover({ segment, progress });
        }
      }
    });

    if (!completed) {
      cleanup();
      return { cancelled: true, visual: config.visual };
    }
    if (!coverReported) onCover({ segment, progress: 1 });
    return { progress: 1, visual: config.visual };
  }

  async function play({ segment }) {
    const patternConfig = PATTERN_BLOOM_SEGMENTS[segment.id];
    if (patternConfig) return playPatternBloom({ segment, config: patternConfig });

    const inkConfig = INK_CURTAIN_SEGMENTS[segment.id];
    if (inkConfig) return playInkCurtain({ segment, config: inkConfig });

    throw new Error(`Unsupported MVP ink segment: ${segment.id}`);
  }

  function stop() {
    stopped = true;
    cleanup();
  }

  return { play, stop, destroy: stop };
}

export const mvpInkTransitionVariants = Object.freeze({
  'hero-to-pattern': PATTERN_BLOOM_SEGMENTS['hero-to-pattern'].visual,
  'pattern-to-star-map': PATTERN_BLOOM_SEGMENTS['pattern-to-star-map'].visual,
  'star-map-to-aod': INK_CURTAIN_SEGMENTS['star-map-to-aod'].visual
});
