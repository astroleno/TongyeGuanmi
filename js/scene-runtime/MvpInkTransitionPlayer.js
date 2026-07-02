import {
  TransitionSegmentAbortError,
  TransitionSegmentError,
  TransitionSegmentTimeoutError
} from './TransitionSegmentPlayer.js';
import {
  createInkCurtainTransition,
  createInkSceneTransition
} from '../effects/ink-scene-transition.js';

const SUPPORTED_SEGMENTS = new Set([
  'center-ink-expand',
  'left-rotate-bloom',
  'bottom-to-top-ink'
]);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(value) {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function abortReason(signal, fallback = 'transition aborted') {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new TransitionSegmentAbortError(String(reason || fallback));
}

function getView(layer) {
  return layer?.ownerDocument?.defaultView || globalThis.window || globalThis;
}

function createCanvas(layer) {
  const documentRef = layer?.ownerDocument || globalThis.document;
  if (!documentRef?.createElement) {
    throw new Error('MvpInkTransitionPlayer requires a DOM-like layer');
  }
  const canvas = documentRef.createElement('canvas');
  canvas.setAttribute('data-mvp-ink-transition', '');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  return canvas;
}

function segmentOptions(segmentId, { from, to } = {}) {
  if (segmentId === 'center-ink-expand') {
    return {
      type: 'scene',
      targetSrc: 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png',
      inkCenterX: 0.5,
      inkCenterY: 0.52,
      colorLift: 0.58,
      progressSpan: 1,
      transparentOutside: true,
      perlinOverlay: true,
      from,
      to
    };
  }
  if (segmentId === 'left-rotate-bloom') {
    return {
      type: 'scene',
      targetSrc: 'assets/back2.png',
      inkCenterX: 0.28,
      inkCenterY: 0.55,
      colorLift: 0.62,
      progressSpan: 0.94,
      transparentOutside: true,
      perlinOverlay: true,
      depthThresholdMode: true,
      from,
      to
    };
  }
  return {
    type: 'curtain',
    direction: 'bottom-up',
    colorLift: 0.64,
    coverAlpha: 0.66,
    fadeOutStart: 0.82,
    fadeOutEnd: 1,
    progressSpan: 1,
    from,
    to
  };
}

export class MvpInkTransitionPlayer {
  constructor({
    layer = null,
    defaultDurationMs = 520,
    defaultTimeoutMs = 1600,
    behavior = {}
  } = {}) {
    this.layer = layer;
    this.defaultDurationMs = defaultDurationMs;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.behavior = behavior;
    this.trace = [];
    this.active = null;
  }

  setLayer(layer) {
    this.layer = layer;
  }

  snapshot() {
    return { trace: this.trace.slice() };
  }

  emit(phase, detail = {}, callback = null) {
    const entry = {
      type: 'mvp-ink-transition',
      phase,
      ...detail
    };
    this.trace.push(entry);
    callback?.(entry);
    return entry;
  }

  clear(reason = 'clear') {
    if (!this.layer) return;
    this.layer.replaceChildren?.();
    this.layer.dataset.transitionActive = 'false';
    this.layer.dataset.transitionClearReason = reason;
    delete this.layer.dataset.transitionSegment;
    delete this.layer.dataset.transitionFrom;
    delete this.layer.dataset.transitionTo;
  }

  prepare({ segmentId, from, to }) {
    if (!this.layer) throw new Error('MvpInkTransitionPlayer requires transition layer');
    this.clear('prepare');
    this.layer.dataset.transitionActive = 'true';
    this.layer.dataset.transitionSegment = segmentId;
    this.layer.dataset.transitionFrom = from || '';
    this.layer.dataset.transitionTo = to || '';
    const canvas = createCanvas(this.layer);
    canvas.setAttribute('data-transition-segment', segmentId);
    canvas.setAttribute('data-transition-from', from || '');
    canvas.setAttribute('data-transition-to', to || '');
    this.layer.appendChild(canvas);

    const options = segmentOptions(segmentId, { from, to });
    let renderer = null;
    try {
      renderer = options.type === 'curtain'
        ? createInkCurtainTransition(canvas, options)
        : createInkSceneTransition(canvas, options);
    } catch {
      renderer = null;
    }
    if (!renderer) {
      canvas.dataset.inkFallback = 'true';
      canvas.style.background = 'radial-gradient(circle at 50% 52%, rgba(236,214,153,.44), rgba(9,18,15,.78))';
    }
    return { canvas, renderer };
  }

  play({
    segmentId,
    from,
    to,
    attemptId,
    epoch,
    signal,
    timeoutMs = this.defaultTimeoutMs,
    onTrace,
    onProgress
  } = {}) {
    if (!SUPPORTED_SEGMENTS.has(segmentId)) {
      throw new TransitionSegmentError(`Unsupported transition segment: ${segmentId}`);
    }
    if (this.active?.controller && !this.active.controller.signal.aborted) {
      this.active.controller.abort(new TransitionSegmentAbortError('superseded'));
    }

    const behavior = this.behavior[segmentId] || {};
    const durationMs = behavior.durationMs ?? this.defaultDurationMs;
    const view = getView(this.layer);
    const raf = view.requestAnimationFrame?.bind(view) || ((callback) => setTimeout(() => callback(Date.now()), 16));
    const caf = view.cancelAnimationFrame?.bind(view) || ((id) => clearTimeout(id));
    const setTimer = view.setTimeout?.bind(view) || setTimeout;
    const clearTimer = view.clearTimeout?.bind(view) || clearTimeout;
    const controller = new AbortController();
    const cleanups = [];
    let frameId = 0;
    let timeoutId = 0;
    let prepared = null;

    const abort = (reason) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };

    if (signal?.aborted) abort(abortReason(signal));
    else if (signal) {
      const onAbort = () => abort(abortReason(signal));
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
    }

    const cleanup = (reason) => {
      if (frameId) caf(frameId);
      frameId = 0;
      if (timeoutId) clearTimer(timeoutId);
      timeoutId = 0;
      cleanups.splice(0).forEach((fn) => fn());
      this.clear(reason);
      if (this.active?.controller === controller) this.active = null;
    };

    this.active = { controller };
    prepared = this.prepare({ segmentId, from, to });
    this.emit('started', { segmentId, from, to, attemptId, epoch }, onTrace);

    return new Promise((resolve, reject) => {
      let settled = false;
      const startedAt = view.performance?.now?.() ?? Date.now();

      const settle = (error, result = null) => {
        if (settled) return;
        settled = true;
        if (error) {
          this.emit('failed', { segmentId, from, to, attemptId, epoch, error: error.message }, onTrace);
          cleanup(error.name || 'failed');
          reject(error);
          return;
        }
        this.emit('ended', { segmentId, from, to, attemptId, epoch }, onTrace);
        cleanup('ended');
        resolve(result || { completed: true, segmentId, from, to });
      };

      const onAbort = () => settle(abortReason(controller.signal));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => controller.signal.removeEventListener('abort', onAbort));

      timeoutId = setTimer(() => {
        abort(new TransitionSegmentTimeoutError(`${segmentId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (behavior.reject) {
        settle(new TransitionSegmentError(behavior.rejectMessage || `${segmentId} rejected`));
        return;
      }
      if (behavior.neverResolve) return;

      const tick = (timestamp) => {
        const elapsed = Math.max(0, (timestamp || Date.now()) - startedAt);
        const linear = durationMs <= 0 ? 1 : clamp(elapsed / durationMs);
        const progress = smoothStep(linear);
        prepared?.renderer?.render?.(progress, 0, 0, progress);
        if (!prepared?.renderer && prepared?.canvas) {
          prepared.canvas.style.opacity = String(Math.max(0.001, 1 - progress * 0.05));
          prepared.canvas.dataset.inkProgress = progress.toFixed(4);
        }
        onProgress?.({ progress, segmentId, attemptId, epoch });
        this.emit('progress', { segmentId, from, to, attemptId, epoch, progress }, onTrace);

        if (linear >= 1) {
          settle(null);
          return;
        }
        frameId = raf(tick);
      };

      frameId = raf(tick);
    });
  }
}

export function createMvpInkTransitionPlayer(options = {}) {
  return new MvpInkTransitionPlayer(options);
}
