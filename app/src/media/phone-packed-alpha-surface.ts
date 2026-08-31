import {
  createPackedAlphaVideoCompositor,
  renewPackedAlphaCanvas,
  setPackedAlphaVideoSource,
  type PackedAlphaContextRetirement,
  type PackedAlphaVideoCompositor,
  type PackedAlphaVideoFailure
} from './packed-alpha-video';
import { semanticBoolean } from '../runtime/semantic-data-attribute';
import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap,
  type VideoFrameMap
} from './frame-timebase';
import type {
  PresentedFrameReceipt,
  PresentedFrameRequest
} from './presented-frame-clock';
import { MediaPreparationError } from './media-preparation';

export type PhonePackedAlphaSurfaceMode = 'forward' | 'initial' | 'endpoint';

export type PhonePackedAlphaSurfaceFailure = Readonly<{
  code: string;
  message: string;
  generation: number;
}>;

export type PhonePackedAlphaSurfaceFrame = Readonly<{
  canvas: HTMLCanvasElement;
  generation: number;
  mediaTimeSeconds: number;
  frameIndex: number;
}>;

export type PhonePackedAlphaSurfaceFrameRequest = PresentedFrameRequest;

export type PhonePackedAlphaSurfaceFrameReceipt = PresentedFrameReceipt & Readonly<{
  canvas: HTMLCanvasElement;
  generation: number;
}>;

export type PhonePackedAlphaSurface = Readonly<{
  activate(mode?: PhonePackedAlphaSurfaceMode): number;
  presentFrame(request: PhonePackedAlphaSurfaceFrameRequest): Promise<PhonePackedAlphaSurfaceFrameReceipt>;
  /** Change frame acceptance without replacing the generation or, optionally, its proof. */
  setMode?(mode: PhonePackedAlphaSurfaceMode, preservePresentation?: boolean): void;
  /** Best-effort repaint for retained proof; a transient miss is not terminal. */
  probe(): boolean;
  render(): boolean;
  release(): void;
  dispose(retirement?: PackedAlphaContextRetirement): void;
}>;

export type PhonePackedAlphaSurfaceOptions = Readonly<{
  root: HTMLElement;
  container: HTMLElement;
  canvas?: HTMLCanvasElement;
  video: HTMLVideoElement;
  packedSourceUrl: string;
  endpointSeconds: number;
  statusDataset: string;
  layerName: string;
  canvasClassName: string;
  frameMap?: VideoFrameMap;
  frameTimeoutMs?: number;
  renewCanvasAfterFailure?: boolean;
  onCanvasRenewed?(canvas: HTMLCanvasElement): void;
  onFrame?(frame: PhonePackedAlphaSurfaceFrame): void;
  onFailure?(failure: PhonePackedAlphaSurfaceFailure): void;
}>;

const DEFAULT_FRAME_TIMEOUT_MS = 3000;
const HAVE_CURRENT_DATA = 2;
const ENDPOINT_FRAME_TOLERANCE_SECONDS = 0.08;
const INITIAL_FRAME_TOLERANCE_SECONDS = 0.04;

function releaseVideoSource(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.replaceChildren();
  try {
    video.load();
  } catch {
    // Detached test media and a retiring Safari decoder can reject load().
  }
  delete video.dataset.packedAlphaSource;
  delete video.dataset.phonePackedAlphaOwner;
}

/**
 * One generation-bound packed-alpha surface. Soft release preserves an
 * injected Canvas context; a real compositor failure can renew that Canvas
 * before the next activation without letting the retired generation report.
 */
export function createPhonePackedAlphaSurface(
  options: PhonePackedAlphaSurfaceOptions
): PhonePackedAlphaSurface {
  const { root, container, video, statusDataset, layerName } = options;
  const ownsCanvas = !options.canvas;
  let retainedCanvas = options.canvas;
  let activeCanvas: HTMLCanvasElement | undefined;
  let compositor: PackedAlphaVideoCompositor | undefined;
  let dormantCompositor: PackedAlphaVideoCompositor | undefined;
  let mode: PhonePackedAlphaSurfaceMode | undefined;
  let frameTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let endpointSeek: (() => void) | undefined;
  let disposed = false;
  let generationSequence = 0;
  let activeGeneration = 0;
  let canvasNeedsRenewal = false;
  let activeFrameMap = options.frameMap;
  let latestPresentSequence = Number.NEGATIVE_INFINITY;
  type PendingPresentation = Readonly<{
    request: PhonePackedAlphaSurfaceFrameRequest;
    desiredFrameIndex: number;
    generation: number;
    canvas: HTMLCanvasElement;
    resolve(receipt: PhonePackedAlphaSurfaceFrameReceipt): void;
    reject(error: Error): void;
    onAbort?: () => void;
  }>;
  const pendingPresentations = new Set<PendingPresentation>();

  const abortError = (reason: unknown, runId: string): Error => (
    new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      `packed-alpha frame preparation aborted for ${runId}`,
      reason === undefined ? {} : { cause: reason }
    )
  );

  const staleReceipt = (pending: PendingPresentation): PhonePackedAlphaSurfaceFrameReceipt => ({
    status: 'stale',
    runId: pending.request.runId,
    sequence: pending.request.sequence,
    desiredFrameIndex: pending.desiredFrameIndex,
    presentedFrameIndex: -1,
    mediaTimeSeconds: Number.NaN,
    presentedProgress: pending.request.desiredProgress,
    evidence: 'packed-canvas-draw',
    canvas: pending.canvas,
    generation: pending.generation
  });

  const removePending = (pending: PendingPresentation) => {
    pendingPresentations.delete(pending);
    if (pending.onAbort) {
      pending.request.signal.removeEventListener('abort', pending.onAbort);
    }
  };

  const resolvePendingStale = (generation?: number) => {
    for (const pending of [...pendingPresentations]) {
      if (generation !== undefined && pending.generation !== generation) continue;
      removePending(pending);
      pending.resolve(staleReceipt(pending));
    }
  };

  const rejectPending = (generation: number, error: Error) => {
    for (const pending of [...pendingPresentations]) {
      if (pending.generation !== generation) continue;
      removePending(pending);
      pending.reject(error);
    }
  };

  if (retainedCanvas) {
    retainedCanvas.dataset.packedAlphaCompositorActive = semanticBoolean(false);
  }

  const clearEndpointSeek = () => {
    if (!endpointSeek) return;
    video.removeEventListener('loadedmetadata', endpointSeek);
    video.removeEventListener('loadeddata', endpointSeek);
    endpointSeek = undefined;
  };

  const retireCompositor = (retirement: PackedAlphaContextRetirement) => {
    if (compositor) {
      compositor.dispose(retirement);
      dormantCompositor = retirement === 'reactivatable' ? compositor : undefined;
      compositor = undefined;
      return;
    }
    if (retirement === 'terminal' && dormantCompositor) {
      dormantCompositor.dispose('terminal');
      dormantCompositor = undefined;
    }
  };

  const retireCanvas = () => {
    if (!activeCanvas) return;
    if (ownsCanvas) {
      activeCanvas.remove();
      retainedCanvas = undefined;
    } else {
      activeCanvas.width = 1;
      activeCanvas.height = 1;
      retainedCanvas = activeCanvas;
    }
    activeCanvas = undefined;
  };

  const clearPresentation = (retirement: PackedAlphaContextRetirement) => {
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    clearEndpointSeek();
    resolvePendingStale();
    activeGeneration = 0;
    activeFrameMap = undefined;
    latestPresentSequence = Number.NEGATIVE_INFINITY;
    retireCompositor(retirement);
    retireCanvas();
    delete root.dataset[statusDataset];
  };

  const fail = (
    failure: Pick<PhonePackedAlphaSurfaceFailure, 'code' | 'message'>,
    generation: number
  ) => {
    if (disposed || generation === 0 || generation !== activeGeneration) return;
    const error = new Error(failure.message);
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    clearEndpointSeek();
    rejectPending(generation, error);
    activeGeneration = 0;
    activeFrameMap = undefined;
    latestPresentSequence = Number.NEGATIVE_INFINITY;
    mode = undefined;
    canvasNeedsRenewal = options.renewCanvasAfterFailure === true;
    root.dataset[statusDataset] = 'failed';
    retireCompositor('reactivatable');
    options.onFailure?.({ ...failure, generation });
  };

  const settleStaticFallback = (generation: number) => {
    if (options.onFailure) {
      fail({
        code: 'packed-alpha-static-fallback',
        message: 'Packed-alpha endpoint frame did not become available'
      }, generation);
      return;
    }
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    clearEndpointSeek();
    resolvePendingStale(generation);
    retireCompositor(ownsCanvas ? 'terminal' : 'reactivatable');
    retireCanvas();
    root.dataset[statusDataset] = 'static-fallback';
  };

  const deferForwardProbeUntilPlayback = () => {
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    if (mode === 'forward') root.dataset[statusDataset] = 'awaiting-native-playback';
  };

  const release = () => {
    clearPresentation(ownsCanvas ? 'terminal' : 'reactivatable');
    if (retainedCanvas) {
      retainedCanvas.dataset.packedAlphaCompositorActive = semanticBoolean(false);
    }
    releaseVideoSource(video);
    mode = undefined;
  };

  const renewRetainedCanvas = () => {
    if (!canvasNeedsRenewal || ownsCanvas || !retainedCanvas) return;
    dormantCompositor?.dispose('terminal');
    dormantCompositor = undefined;
    retainedCanvas = renewPackedAlphaCanvas(retainedCanvas);
    canvasNeedsRenewal = false;
    options.onCanvasRenewed?.(retainedCanvas);
  };

  const presentFrame = (
    request: PhonePackedAlphaSurfaceFrameRequest
  ): Promise<PhonePackedAlphaSurfaceFrameReceipt> => {
    const frameMap = validateVideoFrameMap(request.frameMap);
    const desiredProgress = Math.min(1, Math.max(0, request.desiredProgress));
    const desiredFrameIndex = frameIndexForProgress(frameMap, desiredProgress);
    const canvas = activeCanvas;
    const generation = activeGeneration;
    if (disposed || !canvas || !compositor || generation === 0) {
      return Promise.reject(new Error('Packed-alpha surface is not active'));
    }
    if (request.sequence <= latestPresentSequence) {
      return Promise.resolve({
        status: 'stale',
        runId: request.runId,
        sequence: request.sequence,
        desiredFrameIndex,
        presentedFrameIndex: -1,
        mediaTimeSeconds: Number.NaN,
        presentedProgress: desiredProgress,
        evidence: 'packed-canvas-draw',
        canvas,
        generation
      });
    }
    latestPresentSequence = request.sequence;
    activeFrameMap = frameMap;
    resolvePendingStale(generation);
    if (request.signal.aborted) {
      return Promise.reject(abortError(request.signal.reason, request.runId));
    }

    let resolve!: (receipt: PhonePackedAlphaSurfaceFrameReceipt) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<PhonePackedAlphaSurfaceFrameReceipt>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    const onAbort = () => {
      if (!pendingPresentations.has(pending)) return;
      removePending(pending);
      pending.reject(abortError(request.signal.reason, request.runId));
    };
    const pending: PendingPresentation = {
      request: { ...request, desiredProgress },
      desiredFrameIndex,
      generation,
      canvas,
      resolve,
      reject,
      onAbort
    };
    pendingPresentations.add(pending);
    request.signal.addEventListener('abort', onAbort, { once: true });

    const targetTime = mediaTimeForFrame(frameMap, desiredFrameIndex);
    try {
      if (Math.abs(video.currentTime - targetTime) > 0.001) {
        video.currentTime = targetTime;
      } else if (compositor.render() === false && video.readyState >= HAVE_CURRENT_DATA) {
        removePending(pending);
        reject(new Error('Packed-alpha frame render failed'));
      }
    } catch (cause) {
      removePending(pending);
      reject(new Error(`Packed-alpha frame seek failed: ${String(cause)}`));
    }
    return result;
  };

  return Object.freeze({
    activate(nextMode = 'forward') {
      if (disposed) return 0;
      release();
      mode = nextMode;
      renewRetainedCanvas();
      activeFrameMap = options.frameMap;
      latestPresentSequence = Number.NEGATIVE_INFINITY;
      const generation = ++generationSequence;
      activeGeneration = generation;
      activeCanvas = ownsCanvas
        ? root.ownerDocument.createElement('canvas')
        : retainedCanvas;
      if (!activeCanvas) {
        fail({ code: 'packed-alpha-canvas-missing', message: 'Packed-alpha Canvas is missing' }, generation);
        return generation;
      }
      activeCanvas.className = options.canvasClassName;
      activeCanvas.setAttribute('aria-hidden', 'true');
      activeCanvas.dataset.phonePackedAlphaCanvas = layerName;
      activeCanvas.dataset.packedAlphaGeneration = String(generation);
      if (ownsCanvas) {
        container.append(activeCanvas);
        retainedCanvas = activeCanvas;
      }
      const canvasForGeneration = activeCanvas;
      let synchronousFailure: PackedAlphaVideoFailure | null = null;
      compositor = createPackedAlphaVideoCompositor({
        video,
        canvas: canvasForGeneration,
        onFrame: (renderedFrame = { mediaTimeSeconds: video.currentTime }) => {
          const mediaTimeSeconds = renderedFrame.mediaTimeSeconds;
          const pending = [...pendingPresentations].find((candidate) => (
            candidate.generation === generation
          ));
          const frameMap = pending?.request.frameMap ?? activeFrameMap;
          const frameIndex = frameMap && Number.isFinite(mediaTimeSeconds)
            ? frameIndexForMediaTime(frameMap, mediaTimeSeconds)
            : -1;
          const exactPending = pending
            && !video.seeking
            && Number.isFinite(mediaTimeSeconds)
            && frameIndexForMediaTime(pending.request.frameMap, mediaTimeSeconds)
              === pending.desiredFrameIndex;
          if (disposed || generation !== activeGeneration
            || canvasForGeneration !== activeCanvas
            || video.dataset.packedAlphaSource !== 'rgb-alpha-side-by-side') return;
          const modeAcceptsFrame = !(mode === 'endpoint' && (video.seeking
            || Math.abs(video.currentTime - options.endpointSeconds)
              > ENDPOINT_FRAME_TOLERANCE_SECONDS))
            && !(mode === 'initial' && (!video.paused || video.seeking
            || Math.abs(video.currentTime) > INITIAL_FRAME_TOLERANCE_SECONDS));
          if (!modeAcceptsFrame && !exactPending) {
            delete canvasForGeneration.dataset.packedAlphaFrameReady;
            delete canvasForGeneration.dataset.packedAlphaFrame;
            delete canvasForGeneration.dataset.packedAlphaMediaTime;
            return;
          }
          if (pending && !exactPending) return;
          if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
          frameTimeout = undefined;
          root.dataset[statusDataset] = 'verified';
          const frame = {
            canvas: canvasForGeneration,
            generation,
            mediaTimeSeconds,
            frameIndex
          } satisfies PhonePackedAlphaSurfaceFrame;
          options.onFrame?.(frame);
          if (exactPending && pending) {
            removePending(pending);
            pending.resolve({
              status: 'presented',
              runId: pending.request.runId,
              sequence: pending.request.sequence,
              desiredFrameIndex: pending.desiredFrameIndex,
              presentedFrameIndex: frameIndex,
              mediaTimeSeconds,
              presentedProgress: progressForFrameIndex(pending.request.frameMap, frameIndex),
              evidence: 'packed-canvas-draw',
              canvas: canvasForGeneration,
              generation
            });
          }
        },
        onFailure: (failure) => {
          synchronousFailure = failure;
          fail(failure, generation);
        }
      });
      const compositorStatus = canvasForGeneration.dataset.packedAlphaStatus;
      if (synchronousFailure || compositorStatus === 'webgl-unavailable'
        || compositorStatus === 'setup-failed') {
        if (!synchronousFailure) fail({
          code: compositorStatus ?? 'packed-alpha-setup-failed',
          message: 'Packed-alpha compositor setup failed'
        }, generation);
        if (!options.onFailure) {
          video.dataset.phonePackedAlphaOwner = layerName;
          setPackedAlphaVideoSource(video, options.packedSourceUrl);
          settleStaticFallback(generation);
        }
        return generation;
      }
      // A replacement compositor now owns the retained context. A softly
      // retired predecessor must never hard-retire that shared context later.
      dormantCompositor = undefined;
      root.dataset[statusDataset] = 'probing';
      video.dataset.phonePackedAlphaOwner = layerName;
      if (nextMode === 'endpoint') {
        endpointSeek = () => {
          if (mode !== 'endpoint' || generation !== activeGeneration
            || video.readyState < HAVE_CURRENT_DATA) return;
          const endpoint = Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(options.endpointSeconds, Math.max(0, video.duration - 1 / 120))
            : options.endpointSeconds;
          try {
            if (Math.abs(video.currentTime - endpoint) > 0.002) video.currentTime = endpoint;
            else if (compositor?.render() === false) fail({
              code: 'packed-alpha-render-failed',
              message: 'Packed-alpha endpoint render failed'
            }, generation);
          } catch {
            // loadeddata retries metadata/source replacement races on Safari.
          }
        };
        video.addEventListener('loadedmetadata', endpointSeek);
        video.addEventListener('loadeddata', endpointSeek);
      }
      setPackedAlphaVideoSource(video, options.packedSourceUrl);
      if (nextMode === 'endpoint') endpointSeek?.();
      else {
        try { video.currentTime = 0; } catch {
          // loadeddata presents frame zero after source selection.
        }
      }
      frameTimeout = globalThis.setTimeout(() => {
        if (generation !== activeGeneration || root.dataset[statusDataset] === 'verified') return;
        if (mode === 'forward') deferForwardProbeUntilPlayback();
        else settleStaticFallback(generation);
      }, options.frameTimeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS);
      return generation;
    },
    presentFrame,
    setMode(nextMode: PhonePackedAlphaSurfaceMode, preservePresentation = false) {
      if (disposed || activeGeneration === 0) return;
      mode = nextMode;
      if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
      frameTimeout = undefined;
      if (!preservePresentation || root.dataset[statusDataset] !== 'verified') {
        root.dataset[statusDataset] = nextMode === 'forward'
          ? 'awaiting-native-playback' : 'probing';
      }
    },
    probe() {
      return activeGeneration > 0 && compositor?.render() === true;
    },
    render() {
      const generation = activeGeneration;
      if (!generation || !compositor) return false;
      const rendered = compositor.render();
      if (!rendered) fail({
        code: 'packed-alpha-render-failed', message: 'Packed-alpha compositor did not draw'
      }, generation);
      return rendered;
    },
    release,
    dispose(retirement = ownsCanvas ? 'terminal' : 'reactivatable') {
      if (disposed) return;
      clearPresentation(retirement);
      releaseVideoSource(video);
      mode = undefined;
      disposed = true;
    }
  });
}

/** Release a parked compositor only after its scroll transition is invisible. */
export function releasePhonePackedAlphaWhenHidden(
  root: HTMLElement,
  releaseWhenHidden: () => void
): () => void {
  let retired = false;
  const retireIfHidden = () => {
    if (retired) return;
    const opacity = Number.parseFloat(root.style.opacity || '1');
    if (root.style.visibility !== 'hidden' && opacity > 0.001) return;
    retired = true;
    observer?.disconnect();
    releaseWhenHidden();
  };
  const observer = typeof MutationObserver === 'undefined'
    ? undefined
    : new MutationObserver(retireIfHidden);
  observer?.observe(root, { attributes: true, attributeFilter: ['style'] });
  retireIfHidden();
  return () => {
    retired = true;
    observer?.disconnect();
  };
}
