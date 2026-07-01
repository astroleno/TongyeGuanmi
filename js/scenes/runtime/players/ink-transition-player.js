const variantBySegment = {
  'hero-to-pattern': 'radial-center',
  'pattern-to-star-map': 'rotating-left',
  'star-map-to-aod': 'horizontal-irregular-bottom-up'
};

const ease = (value) => value * value * (3 - 2 * value);

function animationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function createInkTransitionPlayer({
  root = document,
  durationMs = 620,
  reduceMotion = false,
  claimLayer = () => {}
} = {}) {
  let activeSurface = null;
  let activeRaf = 0;
  let stopped = false;

  function removeSurface() {
    activeSurface?.remove();
    activeSurface = null;
  }

  function render(surface, progress) {
    const safeProgress = Math.min(1, Math.max(0, progress));
    surface.style.setProperty('--scene-runtime-ink-progress', safeProgress.toFixed(4));
    surface.style.opacity = String(1 - ease(Math.max(0, safeProgress - 0.72) / 0.28));
  }

  async function play({ segment }) {
    const variant = variantBySegment[segment.id];
    if (!variant) throw new Error(`Unsupported MVP ink segment: ${segment.id}`);

    claimLayer({ layer: 'ink-mask', owner: 'SegmentPlayer', segmentId: segment.id });
    stopped = false;
    removeSurface();

    const host = root.querySelector(`[data-scene-id="${segment.to}"]`) || root.body;
    const surface = root.createElement('div');
    surface.className = 'scene-runtime-ink-transition';
    surface.dataset.inkTransitionPlayer = 'mvp';
    surface.dataset.inkVariant = variant;
    surface.dataset.segmentId = segment.id;
    surface.setAttribute('aria-hidden', 'true');
    host.appendChild(surface);
    activeSurface = surface;

    if (reduceMotion) {
      render(surface, 1);
      removeSurface();
      return { progress: 1, variant, reducedMotion: true };
    }

    const startedAt = performance.now();
    while (!stopped) {
      await animationFrame();
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      render(surface, progress);
      if (progress >= 1) break;
    }

    const completed = !stopped;
    removeSurface();
    if (!completed) return { cancelled: true, variant };
    return { progress: 1, variant };
  }

  function stop() {
    stopped = true;
    if (activeRaf) cancelAnimationFrame(activeRaf);
    activeRaf = 0;
    removeSurface();
  }

  return { play, stop, destroy: stop };
}

export const mvpInkTransitionVariants = Object.freeze({ ...variantBySegment });
