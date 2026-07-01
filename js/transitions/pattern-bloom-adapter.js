import { createPatternBloomScene } from '../pattern-mirror-stage.js';
import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

const REVEAL_END = 0.46;
const BLOOM_START = 0.42;
const BLOOM_END = 0.70;
const SECOND_REVEAL_START = 0.58;
const SECOND_REVEAL_END = 0.985;
const BELIEF_PIN_CLASS = 'is-pattern-bloom-pinned';
const COVER_PRIOR_SCENE_CLASS = 'is-pattern-bloom-covering';

function getCurrentHashId() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return '';
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

function isDirectVisitToBelief(beliefSection) {
  const hashId = getCurrentHashId();
  return Boolean(
    hashId
    && beliefSection
    && (beliefSection.id === hashId || beliefSection.dataset?.sectionId === hashId)
  );
}

export function mountPatternBloomTransition({
  host,
  reduceMotion = false,
  progressSource,
  addCleanup,
  center = {}
} = {}) {
  if (!host || host.dataset.patternBloomMounted === 'true') {
    return { destroy() {} };
  }

  host.dataset.patternBloomMounted = 'true';
  const doc = host.ownerDocument || document;
  const beliefSection = doc.querySelector('.canvas-section--belief');
  if (isDirectVisitToBelief(beliefSection)) {
    delete host.dataset.patternBloomMounted;
    return { destroy() {} };
  }

  host.classList.add('homepage-transition', 'homepage-transition--pattern-bloom', 'chapter-transition--pattern-bloom');
  const previousAriaHidden = host.getAttribute('aria-hidden');
  const previousRole = host.getAttribute('role');
  const previousAriaLabel = host.getAttribute('aria-label');
  host.removeAttribute('aria-hidden');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', '同野观幂莲花转场');

  const beliefStarCanvas = beliefSection?.querySelector('[data-belief-star-field]') || null;
  const presentationTarget = beliefSection;
  const stage = doc.createElement('div');
  stage.className = 'pattern-bloom-transition__stage';

  const paper = doc.createElement('div');
  paper.className = 'pattern-bloom-transition__paper';
  paper.setAttribute('aria-hidden', 'true');

  const canvas = doc.createElement('canvas');
  canvas.className = 'pattern-bloom-transition__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const revealInkCanvas = doc.createElement('canvas');
  revealInkCanvas.className = 'pattern-bloom-transition__reveal-ink';
  revealInkCanvas.setAttribute('aria-hidden', 'true');

  const exitInkCanvas = doc.createElement('canvas');
  exitInkCanvas.className = 'pattern-bloom-transition__exit-ink';
  exitInkCanvas.setAttribute('aria-hidden', 'true');

  stage.append(paper, canvas, exitInkCanvas, revealInkCanvas);
  stage.dataset.transitionGhost = 'pattern-bloom-lotus';
  (doc.body || host).append(stage);
  const revealInkTransition = createInkSceneTransition(revealInkCanvas, {
    targetSrc: '',
    nextSceneElement: canvas,
    hideAtEnd: true,
    perlinOverlay: false,
    perlinStrength: 0,
    progressSpan: 1,
    colorLift: 0.58,
    sceneBrightness: 1,
    inkCenterX: 0.5,
    inkCenterY: 0.5,
    transparentOutside: true
  });
  const exitInkTransition = createInkSceneTransition(exitInkCanvas, {
    targetSrc: 'assets/back2.png',
    nextSceneElement: beliefStarCanvas,
    hideAtEnd: true,
    perlinOverlay: true,
    perlinStrength: 0.40,
    progressSpan: 0.94,
    colorLift: 0.62,
    sceneBrightness: 0.92,
    inkCenterX: 0.50,
    inkCenterY: 1.04,
    transparentOutside: true
  });
  const getViewportState = () => {
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const rect = host.getBoundingClientRect();
    const scrollSpan = Math.max(1, rect.height || host.offsetHeight || viewportHeight);
    const raw = (viewportHeight - rect.top) / scrollSpan;
    return {
      raw,
      progress: clamp(raw),
      active: raw > 0 && raw < 1
    };
  };
  const getRawProgress = () => {
    const viewportState = getViewportState();
    if (typeof progressSource !== 'function') return viewportState.progress;
    return clamp(progressSource());
  };
  const getBloomProgress = () => range01(getRawProgress(), BLOOM_START, BLOOM_END);

  const scene = createPatternBloomScene({
    canvas,
    progressSource: getBloomProgress,
    reducedMotion: reduceMotion,
    reducedMotionProgress: 1,
    continuousMotion: true,
    scrollDrivenMotion: true,
    dprLimit: 1,
    center: {
      x: center.x ?? 0.24,
      y: center.y ?? 0.55,
      mobileX: center.mobileX ?? 0.50,
      mobileY: center.mobileY ?? 0.58
    }
  });

  let destroyed = false;
  let sceneReady = false;
  let overlayRaf = 0;
  let beliefPinY = 0;
  const clearBeliefTransitionState = () => {
    if (!beliefSection) return;
    beliefSection.classList.remove(BELIEF_PIN_CLASS);
    beliefSection.style.removeProperty('--belief-transition-opacity');
    beliefSection.style.removeProperty('--belief-transition-y');
    beliefSection.style.removeProperty('--belief-copy-opacity');
    beliefSection.style.removeProperty('--belief-copy-y');
    beliefSection.style.removeProperty('--belief-copy-blur');
    beliefPinY = 0;
  };
  const setBeliefTransitionState = ({ pinned, sceneOpacity = 1, textProgress, presentationTarget: target = beliefSection }) => {
    if (!target) return;
    if (!pinned) {
      clearBeliefTransitionState();
      return;
    }

    const transformedTop = target.getBoundingClientRect().top;
    const baseTop = transformedTop - beliefPinY;
    beliefPinY = -baseTop;

    const copyY = (1 - textProgress) * 28;
    const copyBlur = (1 - textProgress) * 10;
    target.classList.add(BELIEF_PIN_CLASS);
    target.style.setProperty('--belief-transition-y', `${beliefPinY.toFixed(2)}px`);
    target.style.setProperty('--belief-transition-opacity', sceneOpacity.toFixed(4));
    target.style.setProperty('--belief-copy-opacity', textProgress.toFixed(4));
    target.style.setProperty('--belief-copy-y', `${copyY.toFixed(2)}px`);
    target.style.setProperty('--belief-copy-blur', `${copyBlur.toFixed(2)}px`);
  };

  const renderOverlays = () => {
    if (destroyed) return;
    const viewportState = getViewportState();
    const progress = getRawProgress();
    const overlayActive = progress > 0.002 && (progress < 0.999 || viewportState.raw < 1.05);
    const revealProgress = smoothStep(range01(progress, 0, REVEAL_END));
    const revealVisibility = revealProgress >= 0.998
      ? 1
      : (progress > 0.0001 ? Math.max(revealProgress, 0.003) : 0);
    const canvasRevealed = sceneReady && revealProgress >= 0.998;
    const secondRevealProgress = smoothStep(range01(progress, SECOND_REVEAL_START, SECOND_REVEAL_END));
    const topSceneExit = smoothStep(range01(secondRevealProgress, 0.68, 0.98));
    const beliefPinned = overlayActive && secondRevealProgress > 0.002;
    const lotusOpacity = 1 - topSceneExit;
    const topSceneOpacity = canvasRevealed && secondRevealProgress < 0.998
      ? Math.min(lotusOpacity, beliefPinned ? 0.18 : 1)
      : 0;
    const beliefSceneOpacity = beliefPinned
      ? Math.max(0.86, smoothStep(range01(secondRevealProgress, 0.002, 0.18)))
      : 0;
    const beliefCopyProgress = beliefPinned
      ? Math.max(0.92, smoothStep(range01(secondRevealProgress, 0.002, 0.16)))
      : 0;
    const lotusVisible = topSceneOpacity > 0.002;

    doc.body?.classList.toggle(COVER_PRIOR_SCENE_CLASS, overlayActive && revealProgress > 0.92);
    setBeliefTransitionState({
      pinned: beliefPinned,
      sceneOpacity: beliefSceneOpacity,
      textProgress: beliefCopyProgress,
      presentationTarget: beliefSection
    });

    stage.style.opacity = overlayActive ? '1' : '0';
    stage.style.visibility = overlayActive ? 'visible' : 'hidden';
    paper.style.opacity = '0';
    paper.style.visibility = 'hidden';
    canvas.style.opacity = lotusVisible ? topSceneOpacity.toFixed(4) : '0';
    canvas.style.visibility = lotusVisible ? 'visible' : 'hidden';
    revealInkTransition?.render(revealProgress, 0, 0, sceneReady ? revealVisibility : 0);
    exitInkTransition?.render(secondRevealProgress, 0, 0, secondRevealProgress, {
      perlinStrength: 0.40,
      sceneBrightness: 0.92
    });
    overlayRaf = requestAnimationFrame(renderOverlays);
  };
  renderOverlays();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(overlayRaf);
    clearBeliefTransitionState();
    doc.body?.classList.remove(COVER_PRIOR_SCENE_CLASS);
    scene.destroy();
    stage.remove();
    host.classList.remove('homepage-transition', 'homepage-transition--pattern-bloom', 'chapter-transition--pattern-bloom');
    if (previousAriaHidden === null) {
      host.removeAttribute('aria-hidden');
    } else {
      host.setAttribute('aria-hidden', previousAriaHidden);
    }
    if (previousRole === null) {
      host.removeAttribute('role');
    } else {
      host.setAttribute('role', previousRole);
    }
    if (previousAriaLabel === null) {
      host.removeAttribute('aria-label');
    } else {
      host.setAttribute('aria-label', previousAriaLabel);
    }
    delete host.dataset.patternBloomMounted;
  };

  scene.start().then(() => {
    sceneReady = true;
    canvas.dataset.inkTextureReady = 'true';
  }).catch((error) => {
    console.warn('Pattern bloom transition failed; falling back to soft divider.', error);
    host.dataset.transitionModule = 'soft-divider';
    host.classList.add('chapter-transition--fallback', 'scene-transition--fallback');
    destroy();
  });

  addCleanup?.(destroy);
  return { destroy };
}
