import { createPatternMirrorScene } from '../pattern-mirror-stage.js';

const STATUS = Object.freeze({
  IDLE: 'idle',
  MOUNTED: 'mounted',
  POSTER: 'poster',
  BLOOM_PROGRESS: 'bloom-progress',
  BLOOM_IN: 'bloom-in',
  STEADY_LOOP: 'steady-loop',
  LEFT_ROTATE_PREVIEW: 'left-rotate-preview',
  STABLE: 'stable',
  DESTROYED: 'destroyed'
});

const MODE = Object.freeze({
  POSTER: 'poster',
  BLOOM_PROGRESS: 'bloom-progress',
  BLOOM_IN: 'bloom-in',
  STEADY_LOOP: 'steady-loop',
  LEFT_ROTATE_PREVIEW: 'left-rotate-preview'
});

export const PATTERN_INITIAL_PROGRESS = 0;
export const PATTERN_POSTER_PROGRESS = 1;

const DEFAULT_DURATION_MS = Object.freeze({
  BLOOM_IN: 1800,
  LEFT_ROTATE_PREVIEW: 1600,
  REVERSE_TO_POSTER: 320
});

const PATTERN_CENTER = Object.freeze({
  x: 0.28,
  y: 0.55,
  mobileX: 0.50,
  mobileY: 0.58
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOutCubic = (value) => {
  const progress = clamp(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

function isAborted(signal) {
  return Boolean(signal?.aborted);
}

function addAbort(signal, callback) {
  if (!signal) return () => {};
  if (signal.aborted) {
    callback();
    return () => {};
  }
  signal.addEventListener('abort', callback, { once: true });
  return () => signal.removeEventListener('abort', callback);
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
  durations = {},
  deps = {},
  posterProgress = PATTERN_POSTER_PROGRESS
} = {}) {
  const durationMs = {
    bloomIn: durations.bloomIn ?? DEFAULT_DURATION_MS.BLOOM_IN,
    leftRotatePreview: durations.leftRotatePreview ?? DEFAULT_DURATION_MS.LEFT_ROTATE_PREVIEW,
    reverseToPoster: durations.reverseToPoster ?? DEFAULT_DURATION_MS.REVERSE_TO_POSTER
  };

  const state = {
    status: STATUS.IDLE,
    mode: null,
    progress: clamp(posterProgress),
    mounted: false,
    ready: false,
    destroyed: false,
    trace: [{ status: STATUS.IDLE, mode: null, progress: clamp(posterProgress) }]
  };

  let host = null;
  let doc = null;
  let view = deps.window || null;
  let root = null;
  let canvas = null;
  let scene = null;
  let readyPromise = null;
  let controlledProgress = clamp(posterProgress);
  let frameId = 0;
  let activeRun = null;
  let traceHandlers = [];
  let removeAbort = () => {};
  let removeResize = () => {};

  const getView = () => view || doc?.defaultView || globalThis.window;
  const now = () => deps.now?.() ?? getView()?.performance?.now?.() ?? performance.now();
  const requestFrame = (callback) => (
    deps.requestFrame?.(callback)
    ?? getView()?.requestAnimationFrame?.(callback)
    ?? setTimeout(() => callback(now()), 16)
  );
  const cancelFrame = (id) => {
    if (!id) return;
    if (deps.cancelFrame) {
      deps.cancelFrame(id);
      return;
    }
    const targetView = getView();
    if (targetView?.cancelAnimationFrame) {
      targetView.cancelAnimationFrame(id);
      return;
    }
    clearTimeout(id);
  };

  function addTraceHandler(handler) {
    if (handler && !traceHandlers.includes(handler)) traceHandlers.push(handler);
  }

  function emit(status, detail = {}) {
    state.status = status;
    const entry = {
      status,
      mode: state.mode,
      progress: state.progress,
      detail
    };
    state.trace.push(entry);
    for (const handler of traceHandlers) handler(entry);
    activeRun?.onTrace?.(entry);
  }

  function snapshot() {
    return {
      status: state.status,
      mode: state.mode,
      progress: state.progress,
      posterProgress: clamp(posterProgress),
      mounted: state.mounted,
      ready: state.ready,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      transientCount: 0,
      trace: state.trace.map((entry) => entry.status)
    };
  }

  function assertMounted() {
    if (!state.mounted || !root || !canvas) {
      throw new Error('pattern scene provider is not mounted');
    }
  }

  function stopFrame() {
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    removeAbort();
    removeAbort = () => {};
  }

  function setProgress(progress, { status = state.status, mode = state.mode, trace = false, detail = {} } = {}) {
    controlledProgress = clamp(progress);
    state.progress = controlledProgress;
    state.mode = mode;
    scene?.requestRender?.();
    if (trace) emit(status, detail);
  }

  async function waitReady(signal) {
    if (isAborted(signal)) return { completed: false, reason: 'aborted' };
    await readyPromise;
    if (isAborted(signal)) return { completed: false, reason: 'aborted' };
    return { completed: true };
  }

  function settleActiveRun(result) {
    const run = activeRun;
    if (!run || run.settled) return;
    run.settled = true;
    stopFrame();
    run.resolve(result);
  }

  function animateProgress({
    signal,
    from,
    to,
    duration,
    mode,
    status,
    settleStatus,
    settleMode,
    onProgress,
    onTrace
  }) {
    return new Promise((resolve) => {
      const startedAt = now();
      activeRun = {
        settled: false,
        mode,
        onTrace,
        resolve,
        cancel(reason = 'cancelled') {
          settleActiveRun({ completed: false, reason });
        }
      };
      removeAbort = addAbort(signal, () => activeRun?.cancel('aborted'));
      state.mode = mode;
      emit(status, { mode });

      const tick = () => {
        if (!activeRun || state.destroyed) {
          settleActiveRun({ completed: false, reason: 'destroyed' });
          return;
        }
        const linear = duration <= 0 ? 1 : clamp((now() - startedAt) / duration);
        const eased = easeInOutCubic(linear);
        const progress = from + (to - from) * eased;
        setProgress(progress, { mode });
        onProgress?.(state.progress, { mode, status: state.status });

        if (linear >= 1) {
          setProgress(to, { mode: settleMode ?? mode });
          emit(settleStatus, { mode });
          settleActiveRun({ completed: true });
          return;
        }
        frameId = requestFrame(tick);
      };

      frameId = requestFrame(tick);
    });
  }

  async function cancelActiveToPoster(reason = 'cancelled') {
    activeRun?.cancel?.(reason);
    activeRun = null;
    stopFrame();
    setProgress(posterProgress, {
      status: STATUS.POSTER,
      mode: MODE.POSTER,
      trace: true,
      detail: { reason }
    });
  }

  const api = {
    async mount({ host: nextHost, signal, onTrace } = {}) {
      addTraceHandler(onTrace);
      if (state.destroyed) state.destroyed = false;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };
      if (!nextHost) throw new Error('pattern scene provider requires a host');
      if (state.mounted) return waitReady(signal);

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

      controlledProgress = clamp(posterProgress);
      state.progress = controlledProgress;
      state.mode = null;
      scene = createScene({
        canvas,
        progressSource: () => controlledProgress,
        scrollStage: null,
        reducedMotion: false,
        reducedMotionProgress: posterProgress,
        continuousMotion: true,
        scrollDrivenMotion: false,
        dprLimit: 1.25,
        center: PATTERN_CENTER,
        scale: 1
      });

      const targetView = getView();
      const onResize = () => scene?.requestRender?.();
      targetView?.addEventListener?.('resize', onResize, { passive: true });
      removeResize = () => targetView?.removeEventListener?.('resize', onResize);

      state.mounted = true;
      state.ready = false;
      emit(STATUS.MOUNTED);

      readyPromise = Promise.resolve(scene.start?.()).then(() => {
        if (isAborted(signal)) {
          api.destroy();
          return { completed: false, reason: 'aborted' };
        }
        state.ready = true;
        canvas.dataset.patternSceneReady = 'true';
        scene.requestRender?.();
        return { completed: true };
      }).catch((error) => {
        api.destroy();
        throw error;
      });

      return waitReady(signal);
    },

    async showPoster({ signal } = {}) {
      assertMounted();
      const ready = await waitReady(signal);
      if (!ready.completed) return ready;
      await cancelActiveToPoster('poster');
      return { completed: true };
    },

    renderBloomProgress(progress) {
      assertMounted();
      activeRun?.cancel?.('manual-progress');
      activeRun = null;
      stopFrame();
      setProgress(progress, {
        status: STATUS.BLOOM_PROGRESS,
        mode: MODE.BLOOM_PROGRESS,
        trace: true
      });
      return { completed: true, progress: state.progress };
    },

    async playBloomIn({
      signal,
      onProgress,
      onTrace,
      from = PATTERN_INITIAL_PROGRESS,
      to = posterProgress
    } = {}) {
      assertMounted();
      const ready = await waitReady(signal);
      if (!ready.completed) return ready;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };

      activeRun?.cancel?.('superseded');
      activeRun = null;
      stopFrame();
      setProgress(from, { mode: MODE.BLOOM_IN });
      const result = await animateProgress({
        signal,
        from: clamp(from),
        to: clamp(to),
        duration: durationMs.bloomIn,
        mode: MODE.BLOOM_IN,
        status: STATUS.BLOOM_IN,
        settleStatus: STATUS.STABLE,
        settleMode: MODE.STEADY_LOOP,
        onProgress,
        onTrace
      });
      if (result.completed) activeRun = null;
      return result;
    },

    async playSteadyLoop({ signal } = {}) {
      assertMounted();
      const ready = await waitReady(signal);
      if (!ready.completed) return ready;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };
      activeRun?.cancel?.('steady-loop');
      activeRun = null;
      stopFrame();
      setProgress(posterProgress, {
        status: STATUS.STEADY_LOOP,
        mode: MODE.STEADY_LOOP,
        trace: true
      });
      return { completed: true };
    },

    async playLeftRotatePreview({
      signal,
      onProgress,
      onTrace,
      from = controlledProgress,
      to = PATTERN_INITIAL_PROGRESS
    } = {}) {
      assertMounted();
      const ready = await waitReady(signal);
      if (!ready.completed) return ready;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };

      activeRun?.cancel?.('superseded');
      activeRun = null;
      stopFrame();
      return animateProgress({
        signal,
        from: clamp(from),
        to: clamp(to),
        duration: durationMs.leftRotatePreview,
        mode: MODE.LEFT_ROTATE_PREVIEW,
        status: STATUS.LEFT_ROTATE_PREVIEW,
        settleStatus: STATUS.LEFT_ROTATE_PREVIEW,
        settleMode: MODE.LEFT_ROTATE_PREVIEW,
        onProgress,
        onTrace
      }).finally(() => {
        activeRun = null;
      });
    },

    async cancelToPoster({ signal } = {}) {
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };
      assertMounted();
      await cancelActiveToPoster('cancelled');
      return { completed: false, reason: 'cancelled' };
    },

    async reverseToPoster({ signal, onProgress, onTrace } = {}) {
      assertMounted();
      const ready = await waitReady(signal);
      if (!ready.completed) return ready;
      if (isAborted(signal)) return { completed: false, reason: 'aborted' };
      activeRun?.cancel?.('reversed');
      activeRun = null;
      stopFrame();
      const from = controlledProgress;
      const result = await animateProgress({
        signal,
        from,
        to: posterProgress,
        duration: durationMs.reverseToPoster,
        mode: MODE.POSTER,
        status: STATUS.BLOOM_PROGRESS,
        settleStatus: STATUS.POSTER,
        settleMode: MODE.POSTER,
        onProgress,
        onTrace
      });
      if (result.completed) activeRun = null;
      return result;
    },

    destroy() {
      activeRun?.cancel?.('destroyed');
      activeRun = null;
      stopFrame();
      removeResize();
      removeResize = () => {};
      scene?.destroy?.();
      scene = null;
      clearCanvas(canvas);
      root?.remove?.();
      state.mounted = false;
      state.ready = false;
      state.destroyed = true;
      state.mode = null;
      state.progress = clamp(posterProgress);
      emit(STATUS.DESTROYED);
      host = null;
      doc = null;
      view = deps.window || null;
      root = null;
      canvas = null;
      readyPromise = null;
    },

    getState() {
      return snapshot();
    }
  };

  return api;
}

export const createPatternScenePlayer = createPatternSceneProvider;
export { STATUS as PATTERN_SCENE_PROVIDER_STATUS };
