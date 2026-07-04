import { createPatternMirrorScene } from '../pattern-mirror-stage.js';

const PATTERN_CENTER = Object.freeze({
  x: 0.28,
  y: 0.55,
  mobileX: 0.50,
  mobileY: 0.58
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function isAborted(signal) {
  return Boolean(signal?.aborted);
}

function ensureStyle(doc) {
  if (!doc?.head || doc.querySelector?.('[data-pattern-scene-provider-style]')) return;

  const style = doc.createElement('style');
  style.dataset.patternSceneProviderStyle = 'true';
  style.textContent = `
    .pattern-scene-provider {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 100%;
      overflow: clip;
      isolation: isolate;
      background:
        center / cover no-repeat url("assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png"),
        #d9c08f;
      contain: layout paint;
    }

    .pattern-scene-provider__canvas {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
    }
  `;
  doc.head.append(style);
}

function makeCanvas(doc) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'pattern-scene-provider__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function clearCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
  delete canvas.dataset.patternSceneReady;
}

export function createPatternSceneProvider({
  createScene = createPatternMirrorScene,
  deps = {},
  initialProgress = 0
} = {}) {
  const state = {
    progress: clamp(initialProgress),
    mounted: false,
    ready: false,
    destroyed: false
  };

  let host = null;
  let doc = null;
  let view = deps.window || null;
  let root = null;
  let canvas = null;
  let scene = null;
  let readyPromise = null;
  let controlledProgress = state.progress;
  let removeResize = () => {};
  let mountGeneration = 0;

  const getView = () => view || doc?.defaultView || globalThis.window;

  function snapshot() {
    return {
      mounted: state.mounted,
      ready: state.ready,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      progress: state.progress
    };
  }

  function assertMounted() {
    if (!state.mounted || !root || !canvas) {
      throw new Error('pattern scene provider is not mounted');
    }
  }

  async function waitReady(signal) {
    if (isAborted(signal)) return { completed: false, reason: 'aborted' };
    const result = await readyPromise;
    if (result?.completed === false) return result;
    if (isAborted(signal)) return { completed: false, reason: 'aborted' };
    return { completed: true };
  }

  function requestRender() {
    scene?.requestRender?.();
  }

  function setProgress(progress) {
    controlledProgress = clamp(progress);
    state.progress = controlledProgress;
    requestRender();
    return state.progress;
  }

  const api = {
    async mount({ host: nextHost, signal } = {}) {
      if (state.destroyed) state.destroyed = false;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };
      if (!nextHost) throw new Error('pattern scene provider requires a host');
      if (state.mounted) return waitReady(signal);
      const mountId = ++mountGeneration;

      host = nextHost;
      doc = host.ownerDocument || globalThis.document;
      if (!doc) throw new Error('pattern scene provider requires a document');
      view = deps.window || doc.defaultView || globalThis.window;
      ensureStyle(doc);

      root = doc.createElement('div');
      root.className = 'pattern-scene-provider';
      root.dataset.patternSceneProvider = 'true';
      canvas = makeCanvas(doc);
      root.append(canvas);
      host.replaceChildren?.(root);
      if (!host.replaceChildren) host.append(root);

      controlledProgress = clamp(initialProgress);
      state.progress = controlledProgress;
      scene = createScene({
        canvas,
        progressSource: () => controlledProgress,
        scrollStage: null,
        reducedMotion: false,
        reducedMotionProgress: controlledProgress,
        continuousMotion: true,
        scrollDrivenMotion: false,
        dprLimit: 1.25,
        center: PATTERN_CENTER,
        scale: 1
      });

      const targetView = getView();
      const onResize = () => requestRender();
      targetView?.addEventListener?.('resize', onResize, { passive: true });
      removeResize = () => targetView?.removeEventListener?.('resize', onResize);

      state.mounted = true;
      state.ready = false;

      readyPromise = Promise.resolve(scene.start?.()).then(() => {
        if (mountId !== mountGeneration || state.destroyed || !canvas) {
          return { completed: false, reason: 'destroyed' };
        }
        if (isAborted(signal)) {
          api.destroy();
          return { completed: false, reason: 'aborted' };
        }
        state.ready = true;
        canvas.dataset.patternSceneReady = 'true';
        requestRender();
        return { completed: true };
      }).catch((error) => {
        if (mountId !== mountGeneration || state.destroyed) {
          return { completed: false, reason: 'destroyed' };
        }
        api.destroy();
        throw error;
      });

      return waitReady(signal);
    },

    setProgress(progress) {
      assertMounted();
      return setProgress(progress);
    },

    requestRender() {
      assertMounted();
      requestRender();
      return snapshot();
    },

    destroy() {
      mountGeneration += 1;
      removeResize();
      removeResize = () => {};
      scene?.destroy?.();
      scene = null;
      clearCanvas(canvas);
      root?.remove?.();
      state.mounted = false;
      state.ready = false;
      state.destroyed = true;
      state.progress = clamp(initialProgress);
      controlledProgress = state.progress;
      host = null;
      doc = null;
      view = deps.window || null;
      root = null;
      canvas = null;
      readyPromise = null;
      return snapshot();
    },

    getSnapshot() {
      return snapshot();
    }
  };

  return api;
}
