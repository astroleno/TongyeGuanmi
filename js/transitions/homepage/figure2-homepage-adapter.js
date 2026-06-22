import { createFigure2TransitionController } from '../../components/figure2-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';

const FIGURE2_PAPER_GROUND = '#ece8dc';
const FIGURE2_PAPER_GROUND_SOFT = '#f6f2e8';
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

function findTransitionTargetScene(host) {
  const targetSceneId = host?.dataset?.transitionTo;
  if (!targetSceneId) return null;
  const scenes = host.ownerDocument?.querySelectorAll('[data-scene-id]') || [];
  return [...scenes].find((scene) => scene.dataset.sceneId === targetSceneId) || null;
}

function createProofSceneTexture(host) {
  const canvas = host.ownerDocument.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;

  let width = 0;
  let height = 0;
  let dirty = true;
  let disposed = false;

  const invalidate = () => {
    if (disposed) return;
    dirty = true;
  };

  const update = () => {
    if (disposed) return;
    const viewportWidth = Math.max(1, window.innerWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const nextWidth = Math.round(viewportWidth * ratio);
    const nextHeight = Math.round(viewportHeight * ratio);
    if (!dirty && nextWidth === width && nextHeight === height) return;

    width = nextWidth;
    height = nextHeight;
    dirty = false;
    canvas.width = width;
    canvas.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    const paperGradient = context.createLinearGradient(0, 0, 0, viewportHeight);
    paperGradient.addColorStop(0, FIGURE2_PAPER_GROUND_SOFT);
    paperGradient.addColorStop(0.58, FIGURE2_PAPER_GROUND);
    paperGradient.addColorStop(1, '#e4ddcf');
    context.fillStyle = paperGradient;
    context.fillRect(0, 0, viewportWidth, viewportHeight);
    canvas.dataset.inkTextureReady = 'true';
  };

  update();
  host.ownerDocument.fonts?.ready?.then(() => {
    invalidate();
    update();
  });
  window.addEventListener('resize', invalidate, { passive: true });

  return {
    canvas,
    update,
    destroy() {
      disposed = true;
      window.removeEventListener('resize', invalidate);
      canvas.dataset.inkTextureReady = 'false';
    }
  };
}

function createProofScrollOverlay(host) {
  const targetScene = findTransitionTargetScene(host);
  const sourceProof = targetScene?.querySelector('.method-proof');
  const field = host.querySelector('.figure2-field');
  if (!sourceProof || !field) return null;

  const overlay = host.ownerDocument.createElement('div');
  overlay.className = 'figure2-proof-scroll';
  overlay.dataset.transitionGhost = 'method-proof-bridge';
  overlay.setAttribute('aria-hidden', 'true');

  const marker = host.ownerDocument.createComment('method proof overlay marker');
  const originalParent = sourceProof.parentNode;
  const originalNextSibling = sourceProof.nextSibling;
  const originalClass = sourceProof.getAttribute('class');
  const originalAriaLabel = sourceProof.getAttribute('aria-label');

  originalParent.insertBefore(marker, sourceProof);
  sourceProof.classList.add('figure2-proof-scroll__content');
  sourceProof.classList.remove('quiet-proof', 'quiet-proof--source');
  sourceProof.removeAttribute('aria-label');
  overlay.append(sourceProof);
  field.append(overlay);

  let disposed = false;
  const maxScroll = () => Math.max(160, Math.min(520, (window.innerHeight || 1) * 0.42));

  return {
    update({ transitionProgress = 0, postProgress = 0, handoffProgress = 0 } = {}) {
      if (disposed) return 0;
      const transitionRevealProgress = smoothStep(range01(transitionProgress, 0.10, 0.94));
      const revealProgress = clamp(Math.max(transitionRevealProgress, postProgress > 0 ? 1 : 0));
      const handoffFade = 1 - smoothStep(range01(handoffProgress, 0.58, 0.90));
      const opacity = smoothStep(range01(revealProgress, 0.015, 0.16)) * handoffFade;
      const scrollY = -maxScroll() * clamp(postProgress);
      overlay.style.setProperty('--figure2-proof-reveal-stop', `${(-12 + revealProgress * 122).toFixed(2)}%`);
      overlay.style.setProperty('--figure2-proof-reveal-edge', `${(2 + revealProgress * 132).toFixed(2)}%`);
      overlay.style.setProperty('--figure2-proof-overlay-opacity', opacity.toFixed(3));
      overlay.style.setProperty('--figure2-proof-scroll-y', `${scrollY.toFixed(1)}px`);
      return revealProgress;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      if (marker.parentNode) {
        marker.parentNode.insertBefore(sourceProof, marker);
        marker.remove();
      } else if (originalNextSibling?.parentNode === originalParent) {
        originalParent.insertBefore(sourceProof, originalNextSibling);
      } else {
        originalParent.append(sourceProof);
      }
      if (originalClass === null) {
        sourceProof.removeAttribute('class');
      } else {
        sourceProof.setAttribute('class', originalClass);
      }
      if (originalAriaLabel === null) {
        sourceProof.removeAttribute('aria-label');
      } else {
        sourceProof.setAttribute('aria-label', originalAriaLabel);
      }
      overlay.remove();
    }
  };
}

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  postProgressSource,
  handoffTarget,
  handoffProgressSource,
  addCleanup
}) {
  host.classList.add('homepage-transition', 'homepage-transition--figure2', 'figure2-alpha-video');
  host.innerHTML = `
    <section
      class="figure2-scroll"
      data-figure2-transition
      data-figure2-stage
      data-figure2-scroll-vh="140"
      data-figure2-duration="2.4"
      data-figure2-scene-duration="1.28"
      data-figure2-scene-range-vh="100"
      data-figure2-video-segment="5"
      aria-hidden="true"
    >
      <div class="figure2-sticky">
        <div class="figure2-field">
          <div class="figure2-backdrop" aria-hidden="true"></div>
          <div class="figure2-arch-stack" aria-hidden="true">
            <div class="figure2-middle-camera">
              <div class="figure2-middle-window-mask">
                <img class="figure2-arch-layer figure2-arch-layer--cloud" src="assets/figure2-cloud-source.png?v=cloudsource3" alt="" />
                <div class="figure2-arch-layer figure2-arch-layer--far-arcade-window">
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--white" src="assets/figure2-front-white-source.png" alt="" />
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--color" src="assets/figure2-front-color-source.png" alt="" />
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--relief" src="assets/figure2-front-white-source.png" alt="" />
                </div>
              </div>
              <img class="figure2-arch-layer figure2-arch-layer--middle-composite" src="assets/figure2-middle-fresco-opaque-alpha.png?v=middlemaskhard1" alt="" />
            </div>
          </div>
          <div class="figure2-fresco-warmth" aria-hidden="true"></div>
          <div class="figure2-center-wash" aria-hidden="true"></div>
          <div class="figure2-fresco-texture" aria-hidden="true"></div>
          <img class="figure2-arch-layer figure2-arch-layer--near-arch" src="assets/arch2d-alpha.png" alt="" aria-hidden="true" />
          <div class="figure2-figures" aria-label="子问老子人物动画">
            <div class="figure2-people-contact-shadow" aria-hidden="true"></div>
            <figure class="figure2-figure figure2-figure--left">
              <video class="figure2-figure-video" data-alpha-src="assets/figure2a-alpha-auto.webm?v=auto2" data-fallback-src="assets/figure2a-reverse.mp4" poster="assets/figure2a-alpha-reverse-lite-poster.png" muted preload="auto" playsinline webkit-playsinline data-figure2-video></video>
              <figcaption>问道者</figcaption>
            </figure>
            <figure class="figure2-figure figure2-figure--right">
              <video class="figure2-figure-video" data-alpha-src="assets/figure2b-alpha-auto.webm?v=auto2" data-fallback-src="assets/figure2b-reverse.mp4" poster="assets/figure2b-alpha-reverse-lite-poster.png" muted preload="auto" playsinline webkit-playsinline data-figure2-video></video>
              <figcaption>老子</figcaption>
            </figure>
          </div>
          <canvas class="figure2-scene-ink-transition" data-figure2-ink-canvas aria-hidden="true"></canvas>
          <div class="figure2-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-figure2-transition]');
  const field = host.querySelector('.figure2-field');
  const proofSceneTexture = createProofSceneTexture(host);
  const proofScrollOverlay = createProofScrollOverlay(host);
  const brandReceiver = createHandoffReceiver({
    container: field,
    target: handoffTarget,
    sourceSelector: '.brand-definition-grid',
    className: 'homepage-handoff-receiver--brand'
  });
  const controller = createFigure2TransitionController(section, {
    root: host,
    body: host,
    reduceMotion,
    nextSceneElement: proofSceneTexture?.canvas
  });
  if (!controller) throw new Error('Figure2 homepage transition could not initialize.');

  let raf = 0;
  let destroyed = false;
  let videoPlaybackStage = 'idle';

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const introProgress = reduceMotion ? 1 : range01(progress, 0, 0.72);
    const transitionProgress = reduceMotion ? 1 : range01(progress, 0.72, 1);
    const postProgress = reduceMotion
      ? 1
      : transitionProgress >= 0.998
        ? postProgressSource?.() ?? 0
        : 0;
    const handoffProgress = reduceMotion ? 1 : handoffProgressSource?.() ?? postProgress;
    proofScrollOverlay?.update({ transitionProgress, postProgress, handoffProgress });
    brandReceiver?.update(Math.max(postProgress, handoffProgress), { start: 0.58, end: 0.96, liftPx: 22 });
    proofSceneTexture?.update();

    if (reduceMotion) {
      controller.renderRawFigureVideoProgress(1);
    } else if (introProgress <= 0.001) {
      if (videoPlaybackStage !== 'idle') {
        controller.resetFigureVideoPlayback();
        videoPlaybackStage = 'idle';
      }
    } else if (introProgress >= 0.998) {
      if (videoPlaybackStage !== 'complete') {
        controller.finishFigureVideoPlayback();
        videoPlaybackStage = 'complete';
      }
    } else if (videoPlaybackStage === 'idle') {
      controller.startFigureVideoPlayback();
      videoPlaybackStage = 'playing';
    }

    controller.renderStaticState({
      introProgress,
      transitionProgress
    });

    raf = requestAnimationFrame(render);
  };

  controller.prepare();
  controller.waitForVideos();
  render();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    controller.destroy();
    proofSceneTexture?.destroy();
    proofScrollOverlay?.destroy();
    brandReceiver?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--figure2', 'figure2-alpha-video', 'figure2-multiply-video');
  };

  addCleanup?.(destroy);
  return { destroy };
}
