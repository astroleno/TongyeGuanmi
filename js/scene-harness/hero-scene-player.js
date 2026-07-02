import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

const PHASES = new Set([
  'idle',
  'mounted',
  'poster',
  'playing-forward',
  'complete',
  'stable',
  'destroyed'
]);

const DEFAULT_CONFIG = {
  durationMs: 2700,
  stableDelayMs: 180,
  heroVideoSrc: 'assets/figure1.webm',
  heroPosterSrc: 'assets/figure-poster.jpg',
  heroBackSceneSrc: 'assets/back1.png',
  heroNextSceneSrc: 'assets/back2.png',
  heroBackDepthSrc: 'assets/back1_depth.png',
  heroMiddleDepthSrc: 'assets/middle1_depth.png',
  heroMiddleSrc: 'assets/middle1.png',
  titleStartProgress: 0.78,
  subtitleStartProgress: 0.86,
  videoSegmentSeconds: 2,
  backBaseScale: 1.10,
  backImageBoxScale: 1.12,
  middleBaseYVh: 1,
  middleBaseScale: 0.98,
  figureBaseYVh: 12,
  figureBaseScale: 1
};

const HERO_MARKUP = `
  <section class="hero-wrap" data-hero-scene-root aria-label="同野观幂首屏">
    <div class="hero-sticky">
      <canvas class="hero-webgl" data-hero-webgl aria-hidden="true"></canvas>
      <div class="fallback-scene">
        <img class="fallback-layer fallback-back" src="assets/back1.png" alt="" decoding="async" />
        <canvas class="hero-back-ink-transition" data-hero-intro-ink-canvas aria-hidden="true"></canvas>
        <div class="hero-content" data-depth="0.04">
          <h1 class="hero-title-split" aria-label="同野观幂">
            <span class="hero-title-group" aria-hidden="true"><span class="hero-title-char">同</span><span class="hero-title-char">野</span></span>
            <span class="hero-title-group" aria-hidden="true"><span class="hero-title-char">观</span><span class="hero-title-char">幂</span></span>
          </h1>
          <p class="hero-subtitle">你的同行不是更聪明，只是更早把 AI 用进了生意里。</p>
        </div>
        <img class="fallback-layer fallback-middle" src="assets/middle1.png" alt="" decoding="async" />
        <img class="fallback-layer fallback-depth-blur fallback-middle-near-blur" src="assets/middle1.png" alt="" decoding="async" />
        <video class="fallback-layer fallback-figure" src="assets/figure1.webm" poster="assets/figure-poster.jpg" muted preload="auto" playsinline></video>
      </div>
      <div class="hero-vignette" aria-hidden="true"></div>
      <canvas class="hero-pattern-field" data-hero-pattern-field aria-hidden="true"></canvas>
      <canvas class="hero-ink-transition" data-hero-ink-canvas aria-hidden="true"></canvas>
    </div>
  </section>
`;

const SUPPORT_STYLE_ID = 'hero-scene-player-support-style';

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));

function makeAbortError() {
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw makeAbortError();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function ensureSupportStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById(SUPPORT_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = SUPPORT_STYLE_ID;
  style.textContent = `
    .hero-scene-player-host {
      position: relative;
      overflow: hidden;
      min-height: min(100dvh, 960px);
      height: 100%;
      isolation: isolate;
      background: #07110e;
      color: #f7edd7;
      --hero-exit-edge: 100%;
      --hero-exit-feather: 10vh;
      --hero-exit-feather-soft: 3vh;
    }

    .hero-scene-player-host .hero-wrap {
      position: absolute;
      inset: 0;
      height: 100%;
      min-height: 0;
    }

    .hero-scene-player-host .hero-sticky {
      position: absolute;
      inset: 0;
      top: auto;
      min-height: 0;
      height: 100%;
    }

    .hero-scene-player-host .hero-webgl {
      position: absolute;
      inset: 0;
      z-index: 0;
      display: none;
      width: 100%;
      height: 100%;
    }

    .hero-scene-player-host .hero-content h1 {
      margin: 0;
      width: max-content;
      max-width: 86vw;
      display: flex;
      justify-content: center;
      gap: clamp(24px, 2.2vw, 42px);
      font-family: "Tongye Title", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: clamp(76px, 12vw, 176px);
      line-height: .82;
      letter-spacing: 0;
      font-weight: 400;
      color: rgba(247,237,215,.82);
      text-shadow: 0 24px 74px rgba(0,0,0,.34);
    }

    .hero-scene-player-host .hero-title-group {
      display: inline-flex;
      gap: .055em;
    }

    .hero-scene-player-host .hero-title-char {
      display: block;
      transform-origin: 50% 50%;
      will-change: transform, filter, opacity;
    }

    .hero-scene-player-host .hero-subtitle {
      margin: 28px 0 0;
      width: min(720px, 88vw);
      color: rgba(247,237,215,.74);
      font-size: clamp(18px, 2vw, 28px);
      line-height: 1.36;
      letter-spacing: .04em;
      text-align: center;
      text-shadow: 0 18px 58px rgba(0,0,0,.38);
    }

    @media (max-width: 720px) {
      .hero-scene-player-host .hero-content {
        padding: 18vh 24px 0;
      }

      .hero-scene-player-host .hero-content h1 {
        max-width: 86vw;
        font-size: clamp(52px, 16vw, 96px);
        line-height: .86;
        gap: clamp(18px, 4vw, 34px);
      }

      .hero-scene-player-host .hero-title-group {
        gap: .04em;
      }

      .hero-scene-player-host .hero-subtitle {
        width: min(88vw, 360px);
        margin-top: 20px;
        font-size: 16px;
      }
    }
  `;
  documentRef.head.append(style);
}

function decodeImage(image) {
  if (!image) return Promise.resolve();
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  if (typeof image.decode === 'function') {
    return image.decode().catch(() => undefined);
  }
  return new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}

function setLayerTransform(element, xPx, yPx, scale) {
  if (!element) return;
  element.style.transform = `translate3d(calc(-50% + ${xPx.toFixed(2)}px), calc(-50% + ${yPx.toFixed(2)}px), 0) scale(${scale.toFixed(4)})`;
}

function setOpacityVisibility(element, opacity) {
  if (!element) return;
  const visible = opacity > 0.002;
  element.style.opacity = visible ? opacity.toFixed(4) : '0';
  element.style.visibility = visible ? 'visible' : 'hidden';
}

function setCanvasHidden(canvas) {
  if (!canvas) return;
  canvas.style.opacity = '0';
  canvas.style.visibility = 'hidden';
  canvas.removeAttribute('data-ink-texture-ready');
}

function safeCurrentTime(video, time) {
  try {
    video.currentTime = time;
  } catch {
    // The first seek can be rejected until metadata settles; the poster remains valid.
  }
}

export function createHeroScenePlayer(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const raf = options.requestFrame || ((callback) => requestAnimationFrame(callback));
  const caf = options.cancelFrame || ((id) => cancelAnimationFrame(id));
  const clock = options.now || (() => performance.now());
  const createIntroTransition = options.createInkSceneTransition || createInkSceneTransition;
  const traceLog = [];

  let host = null;
  let documentRef = null;
  let root = null;
  let ownedRoot = false;
  let readyPromise = null;
  let introTransition = null;
  let playFrame = 0;
  let stableTimer = 0;
  let assetReadyCleanup = null;
  let mountedAbortCleanup = null;
  let playAbortCleanup = null;
  let activePlaySettle = null;
  let lifecycleId = 0;
  let operationId = 0;
  let progress = 0;
  let segmentStart = 0.34;
  let segmentEnd = 2.45;
  let lastRenderProgress = 0;
  let state = {
    phase: 'idle',
    ready: false,
    posterShown: false,
    playing: false,
    destroyed: false
  };

  const refs = {
    scene: null,
    back: null,
    middle: null,
    middleNearBlur: null,
    figure: null,
    content: null,
    titleChars: [],
    subtitle: null,
    introInkCanvas: null,
    inkCanvas: null,
    patternFieldCanvas: null
  };

  function trace(phase, detail = {}) {
    if (!PHASES.has(phase)) throw new Error(`Unknown hero scene phase: ${phase}`);
    state = { ...state, phase };
    const entry = { phase, at: Math.round(clock()), ...detail };
    traceLog.push(entry);
    if (traceLog.length > 32) traceLog.shift();
    options.onTrace?.(entry);
    return entry;
  }

  function traceLocal(callback, entry) {
    if (callback && callback !== options.onTrace) callback(entry);
  }

  function startOperation() {
    operationId += 1;
    return { lifecycleId, operationId };
  }

  function assertCurrentToken(token) {
    if (!token || token.lifecycleId !== lifecycleId || token.operationId !== operationId || !root || state.destroyed) {
      throw makeAbortError();
    }
  }

  function clearAssetWaiters() {
    if (!assetReadyCleanup) return;
    assetReadyCleanup();
    assetReadyCleanup = null;
  }

  function collectRefs() {
    refs.scene = root.querySelector('.fallback-scene');
    refs.back = root.querySelector('.fallback-back');
    refs.middle = root.querySelector('.fallback-middle');
    refs.middleNearBlur = root.querySelector('.fallback-middle-near-blur');
    refs.figure = root.querySelector('.fallback-figure');
    refs.content = root.querySelector('.hero-content');
    refs.titleChars = Array.from(root.querySelectorAll('.hero-title-char'));
    refs.subtitle = root.querySelector('.hero-subtitle');
    refs.introInkCanvas = root.querySelector('[data-hero-intro-ink-canvas]');
    refs.inkCanvas = root.querySelector('[data-hero-ink-canvas]');
    refs.patternFieldCanvas = root.querySelector('[data-hero-pattern-field]');
  }

  function applyAssetConfig() {
    refs.back.src = config.heroBackSceneSrc;
    refs.middle.src = config.heroMiddleSrc;
    refs.middleNearBlur.src = config.heroMiddleSrc;
    refs.figure.src = config.heroVideoSrc;
    refs.figure.poster = config.heroPosterSrc;
    refs.figure.muted = true;
    refs.figure.loop = false;
    refs.figure.autoplay = false;
    refs.figure.playsInline = true;
    refs.figure.preload = 'auto';
    refs.figure.setAttribute('muted', '');
    refs.figure.setAttribute('playsinline', '');
    refs.figure.setAttribute('webkit-playsinline', '');
    refs.figure.load?.();
  }

  function updateSegmentBounds() {
    const duration = Number.isFinite(refs.figure?.duration) && refs.figure.duration > 0 ? refs.figure.duration : 5.04;
    segmentStart = Math.min(0.42, Math.max(0, duration * 0.08));
    segmentEnd = Math.min(duration - 0.08, segmentStart + Math.min(config.videoSegmentSeconds, duration * 0.55));
  }

  function waitForImageReady(image, cleanups) {
    if (!image || (image.complete && image.naturalWidth > 0)) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        image.removeEventListener?.('load', done);
        image.removeEventListener?.('error', done);
        resolve();
      };
      cleanups.push(done);
      image.addEventListener?.('load', done, { once: true });
      image.addEventListener?.('error', done, { once: true });
      if (typeof image.decode === 'function') {
        image.decode().then(done, done);
      }
    });
  }

  function waitForVideoMetadata(figure, cleanups) {
    if (!figure || figure.readyState >= 1) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        figure.removeEventListener('loadedmetadata', done);
        figure.removeEventListener('canplay', done);
        figure.removeEventListener('error', done);
        resolve();
      };
      cleanups.push(done);
      figure.addEventListener('loadedmetadata', done, { once: true });
      figure.addEventListener('canplay', done, { once: true });
      figure.addEventListener('error', done, { once: true });
    });
  }

  function prepareAssets(instanceId) {
    clearAssetWaiters();
    const cleanups = [];
    let cleanupDone = false;
    assetReadyCleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      cleanups.splice(0).forEach((cleanup) => cleanup());
    };
    const figure = refs.figure;
    const metadataReady = waitForVideoMetadata(figure, cleanups).then(() => {
      if (instanceId === lifecycleId) updateSegmentBounds();
    });

    return Promise.all([
      waitForImageReady(refs.back, cleanups),
      waitForImageReady(refs.middle, cleanups),
      waitForImageReady(refs.middleNearBlur, cleanups),
      metadataReady
    ]).then(() => {
      if (assetReadyCleanup) {
        assetReadyCleanup();
        assetReadyCleanup = null;
      }
      if (instanceId !== lifecycleId || !root || state.destroyed) return;
      state = { ...state, ready: true };
    });
  }

  function resetTransientCanvases() {
    setCanvasHidden(refs.introInkCanvas);
    setCanvasHidden(refs.inkCanvas);
    setCanvasHidden(refs.patternFieldCanvas);
  }

  function stopFigurePlayback({ seekToPoster = false } = {}) {
    const figure = refs.figure;
    if (!figure) return;
    figure.pause();
    if (seekToPoster && figure.readyState >= 1) {
      updateSegmentBounds();
      safeCurrentTime(figure, segmentStart);
    }
  }

  function startFigurePlayback() {
    const figure = refs.figure;
    if (!figure || figure.readyState < 1) return;
    updateSegmentBounds();
    if (figure.currentTime < segmentStart || figure.currentTime >= segmentEnd) {
      safeCurrentTime(figure, segmentStart);
    }
    try {
      figure.playbackRate = 0.82;
    } catch {
      // Playback rate can be locked briefly while metadata is settling.
    }
    figure.play?.().catch(() => undefined);
  }

  function settleActivePlay(result, error) {
    const settle = activePlaySettle;
    activePlaySettle = null;
    if (!settle) return;
    if (error) {
      settle.reject(error);
    } else {
      settle.resolve(result || getState());
    }
  }

  function stopPlayback({ settle = false } = {}) {
    if (playFrame) {
      caf(playFrame);
      playFrame = 0;
    }
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = 0;
    }
    if (playAbortCleanup) {
      playAbortCleanup();
      playAbortCleanup = null;
    }
    state = { ...state, playing: false };
    stopFigurePlayback({ seekToPoster: settle });
  }

  async function waitUntilReady(token) {
    const pendingReady = readyPromise;
    await pendingReady;
    assertCurrentToken(token);
  }

  function getViewportBox() {
    const rect = host?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    const height = Math.max(1, rect?.height || window.innerHeight || 1);
    return { width, height };
  }

  function renderHero(progressValue) {
    if (!root) return;
    lastRenderProgress = clamp(progressValue);
    const { width, height } = getViewportBox();
    const introProgress = lastRenderProgress;
    const introClarity = smoothStep(introProgress);
    const farIntro = smoothStep(range01(introProgress, 0, 1));
    const middleIntro = smoothStep(range01(introProgress, 0, 0.92));
    const figureIntro = smoothStep(range01(introProgress, 0.02, 0.96));
    const titleBase = config.titleStartProgress;

    const backOpacity = 0.04 + farIntro * 0.96;
    const backScale = config.backBaseScale + (1 - farIntro) * 0.015;
    setLayerTransform(refs.back, 0, -height * 0.05 * (1 - farIntro), backScale);
    setOpacityVisibility(refs.back, backOpacity);

    const middleEnterY = (1 - middleIntro) * height * 0.54;
    const middleEnterX = (1 - middleIntro) * width * -0.018;
    const middleY = height * (config.middleBaseYVh / 100) + middleEnterY;
    const middleScale = config.middleBaseScale + (1 - middleIntro) * 0.135;
    setLayerTransform(refs.middle, middleEnterX, middleY, middleScale);
    setOpacityVisibility(refs.middle, middleIntro);
    setLayerTransform(refs.middleNearBlur, middleEnterX, middleY, middleScale);
    setOpacityVisibility(refs.middleNearBlur, 0.24 * (1 - smoothStep(range01(introProgress, 0.10, 0.62))));

    const figureEnterY = (1 - figureIntro) * height * 0.64;
    const figureEnterX = (1 - figureIntro) * width * 0.028;
    const figureY = height * (config.figureBaseYVh / 100) + figureEnterY;
    const figureScale = config.figureBaseScale + (1 - figureIntro) * 0.12;
    setLayerTransform(refs.figure, figureEnterX, figureY, figureScale);
    setOpacityVisibility(refs.figure, figureIntro);

    const farClarity = smoothStep(range01(introProgress, 0.03, 0.66));
    const rockClarity = smoothStep(range01(introProgress, 0.10, 0.62));
    const farBlur = 1.15 + 3.35 * (1 - farClarity) + (1 - introClarity) * 6.2;
    const rockBlur = 0.15 * (1 - rockClarity) + (1 - middleIntro) * 18;
    const figureBlur = (1 - figureIntro) * 20;
    refs.back.style.filter = `blur(${farBlur.toFixed(2)}px) saturate(${(0.88 + introClarity * 0.11 + farClarity * 0.08).toFixed(3)}) contrast(${(0.93 + introClarity * 0.06 + farClarity * 0.06).toFixed(3)}) brightness(${(0.20 + introClarity * 0.44 + farClarity * 0.24).toFixed(3)})`;
    refs.middle.style.filter = `blur(${rockBlur.toFixed(2)}px) saturate(${(0.94 + rockClarity * 0.12).toFixed(3)}) contrast(${(0.97 + rockClarity * 0.07).toFixed(3)}) brightness(${(0.90 + rockClarity * 0.32).toFixed(3)})`;
    refs.figure.style.filter = `url('#figure-alpha-clean') blur(${figureBlur.toFixed(2)}px) brightness(1.18) saturate(1.08) contrast(1.03)`;

    refs.content.style.opacity = '1';
    refs.content.style.visibility = 'visible';
    refs.content.style.transform = 'translate3d(0, 0, 0)';
    refs.titleChars.forEach((char, index) => {
      const charProgress = smoothStep(range01(introProgress, titleBase + index * 0.035, 1));
      char.style.opacity = charProgress.toFixed(4);
      char.style.visibility = charProgress > 0.002 ? 'visible' : 'hidden';
      char.style.transform = `translate3d(0, ${((1 - charProgress) * 18).toFixed(2)}px, 0) scaleX(${(0.94 + charProgress * 0.06).toFixed(4)})`;
      char.style.filter = `blur(${((1 - charProgress) * 9).toFixed(2)}px)`;
    });

    if (refs.subtitle) {
      const subtitleProgress = smoothStep(range01(introProgress, config.subtitleStartProgress, 1));
      refs.subtitle.style.opacity = subtitleProgress.toFixed(4);
      refs.subtitle.style.visibility = subtitleProgress > 0.002 ? 'visible' : 'hidden';
      refs.subtitle.style.transform = `translate3d(0, ${((1 - subtitleProgress) * 14).toFixed(2)}px, 0)`;
      refs.subtitle.style.filter = `blur(${((1 - subtitleProgress) * 6).toFixed(2)}px)`;
    }

    const inkVisibility = introProgress > 0.002 && introProgress < 0.998 ? introProgress : 0;
    if (introTransition && inkVisibility > 0) {
      const clarity = smoothStep(introProgress);
      refs.introInkCanvas.style.filter = `blur(${(4.5 + (1 - clarity) * 6.2).toFixed(2)}px) saturate(${(0.86 + clarity * 0.10).toFixed(3)}) contrast(${(0.92 + clarity * 0.06).toFixed(3)}) brightness(${(0.12 + clarity * 0.40).toFixed(3)})`;
      introTransition.render(introProgress, 0, 0, inkVisibility);
    } else {
      setCanvasHidden(refs.introInkCanvas);
    }
  }

  function renderStable() {
    progress = 1;
    renderHero(1);
    resetTransientCanvases();
    stopFigurePlayback({ seekToPoster: true });
  }

  function bindSignal(signal, handler) {
    if (!signal) return null;
    assertNotAborted(signal);
    signal.addEventListener('abort', handler, { once: true });
    return () => signal.removeEventListener('abort', handler);
  }

  function mount({ host: nextHost, signal } = {}) {
    assertNotAborted(signal);
    if (!nextHost) throw new Error('hero scene player mount() requires a host element');
    if (root) destroy();
    lifecycleId += 1;
    operationId += 1;
    const instanceId = lifecycleId;

    host = nextHost;
    documentRef = host.ownerDocument;
    ensureSupportStyles(documentRef);
    host.classList.add('hero-scene-player-host');

    const existingRoot = host.querySelector('[data-hero-scene-root], .hero-wrap');
    if (existingRoot) {
      root = existingRoot;
      ownedRoot = false;
    } else {
      const template = documentRef.createElement('template');
      template.innerHTML = HERO_MARKUP.trim();
      root = template.content.firstElementChild;
      host.replaceChildren(root);
      ownedRoot = true;
    }

    collectRefs();
    applyAssetConfig();
    updateSegmentBounds();
    readyPromise = prepareAssets(instanceId);
    introTransition = createIntroTransition(refs.introInkCanvas, {
      assets: {
        nextSceneSrc: config.heroNextSceneSrc,
        backDepthSrc: config.heroBackDepthSrc,
        middleDepthSrc: config.heroMiddleDepthSrc
      },
      targetSrc: config.heroBackSceneSrc,
      farOnly: true,
      hideAtEnd: true,
      imageScale: config.backImageBoxScale * config.backBaseScale,
      imageCenterX: 0.5,
      imageCenterY: 0.5,
      inkCenterX: 0.5,
      inkCenterY: 0.5,
      progressSpan: 1,
      colorLift: 0.72,
      sourceElement: refs.back
    });
    introTransition?.prewarm?.();
    renderHero(0);
    resetTransientCanvases();

    state = {
      phase: 'mounted',
      ready: false,
      posterShown: false,
      playing: false,
      destroyed: false
    };
    trace('mounted');
    mountedAbortCleanup = bindSignal(signal, () => destroy());
    return getState();
  }

  async function showPoster({ direction = 1 } = {}) {
    if (!root) throw new Error('hero scene player must be mounted before showPoster()');
    const token = startOperation();
    stopPlayback({ settle: true });
    await waitUntilReady(token);
    await nextFrame();
    assertCurrentToken(token);
    renderStable();
    state = {
      ...state,
      ready: true,
      posterShown: true,
      playing: false,
      destroyed: false
    };
    trace('poster', { direction });
    settleActivePlay(getState());
    return getState();
  }

  async function playForward({ signal, onProgress, onTrace } = {}) {
    assertNotAborted(signal);
    if (!root) throw new Error('hero scene player must be mounted before playForward()');
    const token = startOperation();
    const supersededPlay = Boolean(activePlaySettle);
    stopPlayback({ settle: true });
    if (supersededPlay) {
      renderStable();
      state = {
        ...state,
        ready: state.ready,
        posterShown: true,
        playing: false,
        destroyed: false
      };
      trace('stable', { cancelled: true });
      settleActivePlay(getState());
    }
    await waitUntilReady(token);

    state = {
      ...state,
      ready: true,
      posterShown: true,
      playing: true,
      destroyed: false
    };
    const startedTrace = trace('playing-forward');
    traceLocal(onTrace, startedTrace);
    progress = 0;
    renderHero(0);
    startFigurePlayback();
    const startedAt = clock();

    return new Promise((resolve, reject) => {
      activePlaySettle = { resolve, reject };
      playAbortCleanup = bindSignal(signal, () => {
        operationId += 1;
        stopPlayback({ settle: true });
        renderStable();
        state = { ...state, playing: false, posterShown: true };
        trace('stable', { cancelled: true });
        const error = makeAbortError();
        activePlaySettle = null;
        reject(error);
      });

      const tick = () => {
        try {
          assertCurrentToken(token);
        } catch (error) {
          activePlaySettle = null;
          reject(error);
          return;
        }
        const elapsed = clock() - startedAt;
        const raw = config.durationMs <= 0 ? 1 : clamp(elapsed / config.durationMs);
        progress = raw;
        renderHero(raw);
        onProgress?.(raw);

        if (raw >= 1) {
          stopPlayback({ settle: true });
          renderStable();
          state = { ...state, playing: false, posterShown: true };
          const completeTrace = trace('complete');
          traceLocal(onTrace, completeTrace);
          stableTimer = setTimeout(() => {
            stableTimer = 0;
            if (!root || state.phase !== 'complete') return;
            const stableTrace = trace('stable');
            traceLocal(onTrace, stableTrace);
          }, config.stableDelayMs);
          activePlaySettle = null;
          resolve(getState());
          return;
        }

        playFrame = raf(tick);
      };

      playFrame = raf(tick);
    });
  }

  async function cancelToSource({ signal } = {}) {
    assertNotAborted(signal);
    if (!root) return getState();
    const token = startOperation();
    stopPlayback({ settle: true });
    await waitUntilReady(token);
    renderStable();
    state = {
      ...state,
      ready: true,
      posterShown: true,
      playing: false,
      destroyed: false
    };
    trace('stable', { cancelled: true });
    settleActivePlay(getState());
    return getState();
  }

  async function reverseToPoster({ signal } = {}) {
    assertNotAborted(signal);
    if (!root) throw new Error('hero scene player must be mounted before reverseToPoster()');
    const token = startOperation();
    stopPlayback({ settle: true });
    await waitUntilReady(token);
    renderStable();
    state = {
      ...state,
      ready: true,
      posterShown: true,
      playing: false,
      destroyed: false
    };
    trace('poster', { direction: -1 });
    settleActivePlay(getState());
    return getState();
  }

  function destroy() {
    if (!root && state.destroyed) return getState();
    lifecycleId += 1;
    operationId += 1;
    stopPlayback();
    clearAssetWaiters();
    resetTransientCanvases();
    stopFigurePlayback();
    if (mountedAbortCleanup) {
      mountedAbortCleanup();
      mountedAbortCleanup = null;
    }
    if (ownedRoot && root?.parentNode) {
      root.remove();
    }
    if (host) {
      host.classList.remove('hero-scene-player-host');
      if (ownedRoot) host.replaceChildren();
    }
    root = null;
    host = null;
    documentRef = null;
    ownedRoot = false;
    readyPromise = null;
    introTransition = null;
    progress = 0;
    lastRenderProgress = 0;
    state = {
      phase: 'destroyed',
      ready: false,
      posterShown: false,
      playing: false,
      destroyed: true
    };
    trace('destroyed');
    settleActivePlay(getState());
    return getState();
  }

  function getState() {
    return {
      phase: state.phase,
      ready: state.ready,
      posterShown: state.posterShown,
      playing: state.playing,
      destroyed: state.destroyed,
      progress: Number(lastRenderProgress.toFixed(4)),
      trace: traceLog.slice()
    };
  }

  return {
    mount,
    showPoster,
    playForward,
    cancelToSource,
    reverseToPoster,
    destroy,
    getState
  };
}

const defaultPlayer = createHeroScenePlayer();

export const mount = (options) => defaultPlayer.mount(options);
export const showPoster = (options) => defaultPlayer.showPoster(options);
export const playForward = (options) => defaultPlayer.playForward(options);
export const cancelToSource = (options) => defaultPlayer.cancelToSource(options);
export const reverseToPoster = (options) => defaultPlayer.reverseToPoster(options);
export const destroy = () => defaultPlayer.destroy();
export const getState = () => defaultPlayer.getState();
