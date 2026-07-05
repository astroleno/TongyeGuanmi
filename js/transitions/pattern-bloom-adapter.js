import { createPatternBloomScene } from '../pattern-mirror-stage.js';
import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

const BELIEF_PIN_CLASS = 'is-pattern-bloom-pinned';
const COVER_PRIOR_SCENE_CLASS = 'is-pattern-bloom-covering';
const CENTER_INK = Object.freeze({ x: 0.50, y: 0.55, mobileX: 0.50, mobileY: 0.58 });
const LEFT_INK = Object.freeze({ x: 0.24, y: 0.55, mobileX: 0.50, mobileY: 0.58 });
const PATTERN_STATEMENT = Object.freeze({
  eyebrow: ['一句话讲清', '我们干什么'].join(''),
  headline: ['让 AI 从', '一场培训，', '变成账上的数字。'].join(''),
  body: ['我们不卖课、不卖软件，', '而是进到你的业务现场，', '把 AI 做成团队天天在用、', '月底对得上账的东西。'].join('')
});

function readPhaseRange(phases, name, fallback) {
  const range = phases?.[name];
  return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
    ? range
    : fallback;
}

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
  timeline,
  reportMilestone,
  addCleanup
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

  const statement = doc.createElement('div');
  statement.className = 'pattern-bloom-transition__statement';
  for (const [className, text] of [
    ['pattern-bloom-transition__statement-eyebrow', PATTERN_STATEMENT.eyebrow],
    ['pattern-bloom-transition__statement-headline', PATTERN_STATEMENT.headline],
    ['pattern-bloom-transition__statement-body', PATTERN_STATEMENT.body]
  ]) {
    const line = doc.createElement('p');
    line.className = className;
    line.textContent = text;
    statement.append(line);
  }

  stage.append(paper, canvas, statement, exitInkCanvas, revealInkCanvas);
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
    inkCenterX: CENTER_INK.x,
    inkCenterY: CENTER_INK.y,
    transparentOutside: true
  });
  const exitInkTransition = createInkSceneTransition(exitInkCanvas, {
    targetSrc: '',
    hideAtEnd: true,
    perlinOverlay: false,
    perlinStrength: 0,
    progressSpan: 0.94,
    colorLift: 0.52,
    sceneBrightness: 0.72,
    inkCenterX: LEFT_INK.x,
    inkCenterY: LEFT_INK.y,
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
  const hasExternalProgressSource = typeof progressSource === 'function';
  const phases = timeline?.join?.phases || {};
  const revealRange = readPhaseRange(phases, 'reveal', [0, 0.46]);
  const bloomRange = readPhaseRange(phases, 'bloom', [0.42, 0.70]);
  const secondRevealRange = readPhaseRange(phases, 'secondReveal', [0.80, 0.98]);
  const secondRevealEnd = secondRevealRange[1];
  const pinBlendEnd = Math.min(1, secondRevealEnd + 0.035);
  const getBloomProgress = () => range01(getRawProgress(), bloomRange[0], bloomRange[1]);

  const scene = createPatternBloomScene({
    canvas,
    progressSource: getBloomProgress,
    reducedMotion: reduceMotion,
    reducedMotionProgress: 1,
    continuousMotion: true,
    scrollDrivenMotion: true,
    dprLimit: 1,
    center: {
      x: LEFT_INK.x,
      y: LEFT_INK.y,
      mobileX: LEFT_INK.mobileX,
      mobileY: LEFT_INK.mobileY
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
    const overlayActive = progress > 0.002 && (
      progress < 0.999 || (!hasExternalProgressSource && viewportState.raw < 1.05)
    );
    const revealProgress = smoothStep(range01(progress, revealRange[0], revealRange[1]));
    const revealVisibility = revealProgress >= 0.998
      ? 1
      : (progress > 0.0001 ? Math.max(revealProgress, 0.003) : 0);
    const canvasRevealed = sceneReady && revealProgress >= 0.998;
    const starTextureReady = beliefStarCanvas?.dataset?.inkTextureReady === 'true';
    const secondRevealProgress = smoothStep(range01(progress, secondRevealRange[0], secondRevealRange[1]));
    const secondRevealVisibility = starTextureReady && secondRevealProgress < 0.998 ? secondRevealProgress : 0;
    const topSceneExit = starTextureReady
      ? smoothStep(range01(progress, secondRevealEnd, 0.998))
      : 0;
    const lotusOpacity = 1 - topSceneExit;
    reportMilestone?.('lotusContracted', progress >= secondRevealRange[0] && sceneReady);
    reportMilestone?.('targetReady', Boolean(beliefSection && sceneReady && starTextureReady));
    reportMilestone?.('beliefCopyComplete', secondRevealProgress >= 0.998);
    const timelineState = timeline?.getFrame?.();
    const sourceOpacity = starTextureReady ? timelineState?.sourceOpacity ?? lotusOpacity : 1;
    const targetOpacity = timelineState?.targetOpacity ?? secondRevealProgress;
    const beliefPinBlend = starTextureReady
      ? smoothStep(range01(progress, secondRevealEnd, pinBlendEnd))
      : 0;
    const beliefPinned = overlayActive && starTextureReady && beliefPinBlend > 0.01;
    const topSceneOpacity = canvasRevealed
      ? Math.max(0.18, Math.min(lotusOpacity, sourceOpacity)) * (1 - beliefPinBlend)
      : 0;
    const beliefSceneOpacity = targetOpacity * beliefPinBlend;
    const beliefCopyProgress = targetOpacity * beliefPinBlend;
    const lotusVisible = topSceneOpacity > 0.002;
    const patternCopyEnter = smoothStep(range01(progress, bloomRange[1] - 0.06, secondRevealRange[0]));
    const patternCopyExit = 1 - smoothStep(range01(progress, secondRevealRange[0], secondRevealEnd));
    const patternCopyOpacity = lotusVisible
      ? patternCopyEnter * patternCopyExit * Math.max(0, Math.min(lotusOpacity, sourceOpacity)) * (1 - beliefPinBlend)
      : 0;

    const coverPriorScene = overlayActive && sceneReady && (lotusVisible || secondRevealVisibility > 0.002 || beliefPinned);
    doc.body?.classList.toggle(COVER_PRIOR_SCENE_CLASS, coverPriorScene);
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
    statement.style.opacity = patternCopyOpacity.toFixed(4);
    statement.style.visibility = patternCopyOpacity > 0.002 ? 'visible' : 'hidden';
    statement.style.setProperty('--pattern-statement-y', `${((1 - patternCopyEnter) * 18).toFixed(2)}px`);
    revealInkTransition?.render(revealProgress, 0, 0, sceneReady ? revealVisibility : 0);
    exitInkTransition?.render(secondRevealProgress, 0, 0, secondRevealVisibility, {
      perlinStrength: 0.40,
      sceneBrightness: 0.84
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
