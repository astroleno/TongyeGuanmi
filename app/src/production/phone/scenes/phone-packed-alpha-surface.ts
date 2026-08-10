import {
  createPackedAlphaVideoCompositor,
  createPackedAlphaWebGlRestoreOwner,
  releasePackedAlphaWebGlContext,
  setPackedAlphaVideoSource,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';

export type PhonePackedAlphaSurfaceMode = 'forward' | 'endpoint';

export type PhonePackedAlphaSurfaceRequest = readonly [
  root: HTMLElement,
  container: HTMLElement,
  video: HTMLVideoElement,
  packedSourceUrl: string,
  endpointSeconds: number,
  statusDataset: string,
  layerName: string,
  canvasClassName: string,
  frameTimeoutMs: number | null,
  /** Called only after a successful WebGL draw for the currently armed token. */
  onFrame: ((presentationToken: string | null, mediaTime: number | null) => void) | null
];

export type PhonePackedAlphaSurfaceCommand =
  | readonly [
    'activate',
    mode: PhonePackedAlphaSurfaceMode,
    presentationToken?: string | null
  ]
  | readonly [
    'prepare',
    mode: PhonePackedAlphaSurfaceMode,
    signal: AbortSignal | null,
    requirePresentedFrame?: boolean,
    presentationToken?: string | null
  ]
  /** Rebind one already-mounted compositor to a fresh proof token and draw. */
  | readonly ['present', presentationToken: string | null]
  /** Draw the exact decoder sample returned by a token-bound rVFC prepare. */
  | readonly ['frame', mediaTime: number]
  /** Read the currently mounted canvas without taking ownership of it. */
  | readonly ['canvas']
  | readonly ['release']
  /** Retire the current compositor/context while retaining this surface owner. */
  | readonly ['retire']
  | readonly ['dispose'];

/** Callable bridge keeps the mutable decoder/compositor in its owner chunk. */
export type PhonePackedAlphaSurface = {
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['activate', ...unknown[]]>): void;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['prepare', ...unknown[]]>): Promise<void>;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['present', ...unknown[]]>): void;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['frame', ...unknown[]]>): boolean;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['canvas']>): HTMLCanvasElement | null;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['release']>): void;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['retire']>): void;
  (command: Extract<PhonePackedAlphaSurfaceCommand, readonly ['dispose']>): void;
};

type Preparation = Readonly<{
  presentationToken: string | null;
  resolve(): void;
  reject(error: Error | DOMException): void;
  signal?: AbortSignal;
  abort(): void;
}>;

type PreparationSettlement = 'all' | Readonly<{
  presentationToken: string | null;
}>;

const DEFAULT_FRAME_TIMEOUT_MS = 3000;
const HAVE_METADATA = 1;
const ENDPOINT_FRAME_TOLERANCE_SECONDS = 0.08;
const PRESENTATION_TOLERANCE_SECONDS = 0.05;
// A retained decoder can already sit on the endpoint when a new immutable
// lease is armed. A same-time render would only stamp currentTime fallback
// evidence, and some Safari builds will not schedule a new rVFC for it. Force
// one decode step away from the endpoint, then seek back to obtain a fresh
// exact mediaTime for the new lease.
const ENDPOINT_NUDGE_SECONDS = Math.max(
  1 / 15,
  ENDPOINT_FRAME_TOLERANCE_SECONDS * 2
);

function releaseVideoSource(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.replaceChildren();
  try {
    video.load();
  } catch {
    // Detached tests and a retiring Safari decoder can reject load().
  }
  delete video.dataset.packedAlphaSource;
  delete video.dataset.phonePackedAlphaOwner;
}

/**
 * Keeps one decoder/Canvas pair mounted for the active scene. Forward
 * preparation proves topology only; native playback owns the first moving
 * frame after the orchestrator completes the entry handoff. Reverse endpoint
 * preparation still waits for the authored terminal frame.
 */
export function createPhonePackedAlphaSurface(
  [
    root,
    container,
    video,
    packedSourceUrl,
    endpointSeconds,
    statusDataset,
    layerName,
    canvasClassName,
    frameTimeoutMs,
    onFrame
  ]: PhonePackedAlphaSurfaceRequest
): PhonePackedAlphaSurface {
  const options = {
    root,
    container,
    video,
    statusDataset,
    layerName,
    packedSourceUrl,
    endpointSeconds,
    canvasClassName,
    frameTimeoutMs: frameTimeoutMs ?? undefined,
    onFrame: onFrame ?? undefined
  };
  const preparations = new Set<Preparation>();
  let disposed = false;
  let mode: PhonePackedAlphaSurfaceMode | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let compositor: PackedAlphaVideoCompositor | undefined;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let endpointSeek: (() => void) | undefined;
  let endpointSeekStage: 'idle' | 'nudge' | 'target' | 'playing' = 'idle';
  let activePresentationToken: string | null = null;
  let exactForwardFrameRequired = false;
  // `endpoint` mode is also retained while PH performs its presented-frame
  // reverse. Those intermediate samples must be accepted as decoder evidence
  // without being mistaken for the authored terminal endpoint. The exact
  // frame command marks this synchronous compositor draw so the shared
  // callback does not restart endpoint priming or downgrade the frame to
  // `probing`.
  let exactFrameRenderInProgress = false;
  let exactFrameMode = false;
  let exactForwardFrameListener: (() => void) | undefined;
  let presentationGeneration = 0;
  let activationReady: Promise<void> | null = null;
  let resolveActivationReady: (() => void) | null = null;
  const restoreOwner = createPackedAlphaWebGlRestoreOwner();
  // `undefined` means no queued present command; `null` is a real token value.
  let queuedPresentationToken: string | null | undefined;

  const settle = (
    target: PreparationSettlement,
    error?: Error | DOMException
  ) => {
    for (const preparation of preparations) {
      if (
        target !== 'all'
        && preparation.presentationToken !== target.presentationToken
      ) continue;
      preparation.signal?.removeEventListener('abort', preparation.abort);
      if (error) preparation.reject(error);
      else preparation.resolve();
      preparations.delete(preparation);
    }
  };
  const rejectSupersededPreparations = (presentationToken: string | null) => {
    for (const preparation of preparations) {
      if (preparation.presentationToken === presentationToken) continue;
      preparation.signal?.removeEventListener('abort', preparation.abort);
      preparation.reject(new DOMException(
        `${layerName} packed-alpha presentation superseded`,
        'AbortError'
      ));
      preparations.delete(preparation);
    }
  };
  const clearSeek = () => {
    if (!endpointSeek) return;
    video.removeEventListener('loadedmetadata', endpointSeek);
    video.removeEventListener('loadeddata', endpointSeek);
    endpointSeek = undefined;
    endpointSeekStage = 'idle';
  };
  const clearExactForwardFrame = () => {
    if (exactForwardFrameListener) {
      video.removeEventListener('loadeddata', exactForwardFrameListener);
      exactForwardFrameListener = undefined;
    }
    exactForwardFrameRequired = false;
  };
  const retireCanvas = () => {
    if (!canvas) return;
    // Keep the owner node mounted while the browser dispatches the synthetic
    // context-lost event. Removing it in the same task as loseContext() makes
    // WebKit drop the restoration event and forces the next lease to allocate
    // a fresh context. The surface remains the sole owner; it is merely
    // hidden until its token-bound compositor is rearmed.
    canvas.style.visibility = 'hidden';
    canvas.style.opacity = '0';
    canvas.dataset.phonePackedAlphaRetired = 'true';
    delete canvas.dataset.phonePackedAlphaPresentationToken;
  };
  const settleActivation = () => {
    restoreOwner.cancel();
    const resolve = resolveActivationReady;
    resolveActivationReady = null;
    activationReady = null;
    resolve?.();
  };
  const clearPresentation = () => {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    timeout = undefined;
    clearSeek();
    if (compositor) {
      // Release shader/texture resources at every lease boundary. Ordinary
      // release keeps the context reusable; `retire()` is the explicit
      // non-terminal path that also hard-loses it while retaining this Canvas
      // owner for a later restore.
      compositor.dispose();
    }
    compositor = undefined;
    exactFrameMode = false;
    retireCanvas();
    delete root.dataset[statusDataset];
  };
  const failEndpoint = () => {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    timeout = undefined;
    root.dataset[statusDataset] = 'static-fallback';
    settle(
      { presentationToken: activePresentationToken },
      new Error(`${layerName} packed-alpha presentation failed`)
    );
  };
  const release = () => {
    presentationGeneration += 1;
    settleActivation();
    activePresentationToken = null;
    clearExactForwardFrame();
    queuedPresentationToken = undefined;
    settle('all', new DOMException(
      `${layerName} packed-alpha presentation retired`,
      'AbortError'
    ));
    clearPresentation();
    releaseVideoSource(video);
    mode = undefined;
  };
  const rebindPresentationToken = (presentationToken: string | null) => {
    if (activePresentationToken === presentationToken) return;
    activePresentationToken = presentationToken;
    if (canvas) delete canvas.dataset.phonePackedAlphaPresentationToken;
    rejectSupersededPreparations(presentationToken);
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    timeout = undefined;
    if (root.dataset[statusDataset] === 'verified') {
      root.dataset[statusDataset] = mode === 'forward'
        ? 'awaiting-native-playback'
        : 'probing';
    }
    if (canvas) {
      canvas.dataset.packedAlphaStatus = mode === 'forward'
        ? 'waiting'
        : 'probing';
    }
    // A fresh immutable token may reuse a warmed WebGL context, but only the
    // physical draw after this rebind can settle its own preparation.
    if (mode === 'endpoint') {
      // Re-arm the decoder, rather than relabelling a retained fallback draw
      // as proof for the new token. endpointSeek performs the bounded nudge
      // when the decoder is already sitting on the terminal sample.
      endpointSeek?.();
    } else {
      compositor?.render();
    }
  };
  const setupActive = (
    nextMode: PhonePackedAlphaSurfaceMode,
    generation: number
  ) => {
    if (
      disposed
      || generation !== presentationGeneration
      || mode !== nextMode
      || !canvas
    ) return;
    const activeCanvas = canvas;
    activeCanvas.className = options.canvasClassName;
    activeCanvas.setAttribute('aria-hidden', 'true');
    activeCanvas.dataset.phonePackedAlphaCanvas = layerName;
    if (activeCanvas.parentNode !== container) container.append(activeCanvas);
    activeCanvas.style.visibility = '';
    activeCanvas.style.opacity = '';
    delete activeCanvas.dataset.phonePackedAlphaRetired;
    restoreOwner.clear();
    compositor = createPackedAlphaVideoCompositor({
      video,
      canvas: activeCanvas,
      onFrame: (drawMediaTime) => {
        if (generation !== presentationGeneration) return;
        if (video.dataset.packedAlphaSource !== 'rgb-alpha-side-by-side') return;
        // Endpoint/reverse admission requires the decoder's rVFC-backed
        // evidence. A pause/seek event may draw with currentTime before the
        // browser has presented that exact sample; keep the lease pending
        // until the compositor marks the physical draw as exact.
        if (
          activeCanvas.dataset.packedAlphaStatus !== 'ready'
          || activeCanvas.dataset.packedAlphaFrameEvidence !== 'rvfc'
        ) return;
        const endpointPending = mode === 'endpoint'
          && !exactFrameRenderInProgress;
        if (
          exactForwardFrameRequired
          && (typeof drawMediaTime !== 'number' || !Number.isFinite(drawMediaTime))
        ) return;
        if (endpointPending) {
          if (typeof drawMediaTime !== 'number' || !Number.isFinite(drawMediaTime)) {
            return;
          }
          if (
            Math.abs(drawMediaTime - options.endpointSeconds)
              > ENDPOINT_FRAME_TOLERANCE_SECONDS
          ) {
            activeCanvas.dataset.packedAlphaStatus = 'probing';
            endpointSeekStage = 'nudge';
            video.pause();
            // The seeked event can be coalesced when the decoder was already
            // parked on this endpoint. Re-arm the exact target from the physical
            // rVFC callback itself instead of waiting for another DOM event.
            endpointSeek?.();
            return;
          }
          // A terminal rVFC is the only proof we need. Pause immediately so
          // this decoder priming frame cannot become a second playback clock.
          video.pause();
          endpointSeekStage = 'idle';
        }
        if (timeout !== undefined) globalThis.clearTimeout(timeout);
        timeout = undefined;
        root.dataset[statusDataset] = 'verified';
        if (activePresentationToken === null) {
          delete activeCanvas.dataset.phonePackedAlphaPresentationToken;
        } else {
          activeCanvas.dataset.phonePackedAlphaPresentationToken = activePresentationToken;
        }
        options.onFrame?.(
          activePresentationToken,
          drawMediaTime
        );
        if (exactForwardFrameRequired) video.pause();
        clearExactForwardFrame();
        settle({ presentationToken: activePresentationToken });
      },
      // A packed surface owns its Canvas and reuses its one WebGL context
      // across boundary leases. Terminal dispose below performs the only hard
      // context release, so a reverse loop cannot accumulate contexts or rely
      // on repeated WebKit restoration events.
      releaseContextOnDispose: false,
      // A compositor failure is terminal evidence, never a quietly false
      // render result that waits for a timeout or lets a second owner retry.
      onFailure: () => {
        if (generation !== presentationGeneration) return;
        failEndpoint();
      }
    });
    exactFrameMode = false;
    const status = activeCanvas.dataset.packedAlphaStatus;
    if (status === 'webgl-unavailable') {
      video.dataset.phonePackedAlphaOwner = layerName;
      setPackedAlphaVideoSource(video, options.packedSourceUrl);
      failEndpoint();
      settleActivation();
      return;
    }
    root.dataset[statusDataset] = nextMode === 'forward'
      ? 'awaiting-native-playback'
      : 'probing';
    video.dataset.phonePackedAlphaOwner = layerName;
    if (nextMode === 'endpoint') {
      endpointSeek = () => {
        if (mode !== 'endpoint' || video.readyState < HAVE_METADATA) return;
        const endpoint = Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(options.endpointSeconds, Math.max(0, video.duration - 1 / 120))
          : options.endpointSeconds;
        try {
          const nudge = endpoint > ENDPOINT_NUDGE_SECONDS
            ? endpoint - ENDPOINT_NUDGE_SECONDS
            : endpoint + ENDPOINT_NUDGE_SECONDS;
          if (endpointSeekStage === 'nudge') {
            if (Math.abs(video.currentTime - nudge) > 0.002) {
              video.currentTime = nudge;
              return;
            }
            endpointSeekStage = 'target';
            video.currentTime = endpoint;
          } else if (
            endpointSeekStage === 'target'
            && Math.abs(video.currentTime - endpoint) <= 0.002
          ) {
            // WebKit does not always issue rVFC for a paused terminal seek.
            // Prime exactly one decoded sample, then pause in the rVFC
            // callback above; semantic playback remains runner-owned.
            endpointSeekStage = 'playing';
            void video.play().catch(() => {
              failEndpoint();
            });
          } else if (Math.abs(video.currentTime - endpoint) > 0.002) {
            endpointSeekStage = 'target';
            video.currentTime = endpoint;
          } else if (activeCanvas.dataset.packedAlphaStatus === 'probing') {
            endpointSeekStage = 'nudge';
            video.currentTime = nudge;
          } else {
            endpointSeekStage = 'idle';
            compositor?.render();
          }
        } catch {
          // Metadata can race source replacement; loadeddata retries.
        }
      };
      video.addEventListener('loadedmetadata', endpointSeek);
      video.addEventListener('loadeddata', endpointSeek);
    }
    setPackedAlphaVideoSource(video, options.packedSourceUrl);
    if (nextMode === 'endpoint') {
      endpointSeekStage = 'nudge';
      // The handler performs the bounded nudge synchronously when metadata is
      // already available and otherwise retries from media readiness events.
      endpointSeek?.();
      timeout = globalThis.setTimeout(
        failEndpoint,
        options.frameTimeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS
      );
    } else {
      try {
        video.currentTime = 0;
      } catch {
        // loadeddata owns the first native playback frame.
      }
    }
    if (queuedPresentationToken !== undefined) {
      const token = queuedPresentationToken;
      queuedPresentationToken = undefined;
      rebindPresentationToken(token);
      compositor?.render();
    }
    settleActivation();
  };
  const initializeCanvas = (nextCanvas: HTMLCanvasElement) => {
    // Stamp ownership before the first retained-context probe. WebKit can
    // create the GL context during that probe, before setupActive() gets a
    // chance to assign the class/data marker; early diagnostics must still
    // identify the single surface owner rather than an anonymous canvas.
    nextCanvas.className = options.canvasClassName;
    nextCanvas.setAttribute('aria-hidden', 'true');
    nextCanvas.dataset.phonePackedAlphaCanvas = options.layerName;
  };
  const waitForRetainedContext = (
    nextMode: PhonePackedAlphaSurfaceMode,
    generation: number
  ) => {
    const retained = canvas;
    if (!retained) {
      canvas = root.ownerDocument.createElement('canvas');
      initializeCanvas(canvas);
      setupActive(nextMode, generation);
      return;
    }
    const getContext = retained.getContext?.bind(retained);
    const context = getContext?.('webgl');
    // Detached test canvases and browsers without WebGL are still valid
    // surface owners; there is no context to restore in that case.
    if (!getContext || (!restoreOwner.isPending() && !context?.isContextLost?.())) {
      setupActive(nextMode, generation);
      return;
    }
    const current = canvas;
    if (context?.isContextLost?.()) restoreOwner.markPending();
    if (!restoreOwner.isPending()) {
      setupActive(nextMode, generation);
      return;
    }
    restoreOwner.wait(
      current!,
      () => {
        if (
          disposed
          || generation !== presentationGeneration
          || mode !== nextMode
        ) {
          settleActivation();
          return;
        }
        setupActive(nextMode, generation);
      },
      () => {
        // A browser that never delivers contextlost has already retired the
        // old resources; use a fresh owner rather than waiting forever.
        current?.remove();
        canvas = root.ownerDocument.createElement('canvas');
        initializeCanvas(canvas);
        restoreOwner.clear();
        setupActive(nextMode, generation);
      }
    );
  };
  const activate = (
    nextMode: PhonePackedAlphaSurfaceMode = 'forward',
    presentationToken?: string | null
  ) => {
    if (disposed) return;
    if (mode === nextMode) {
      if (presentationToken !== undefined) {
        rebindPresentationToken(presentationToken);
      }
      return;
    }
    release();
    // `release()` clears the active compositor lease, but a prior `retire()`
    // deliberately left the Canvas in a restorable lost-context state. Carry
    // that fact across the mode reset so activation waits for restoration
    // instead of probing a dead context as if it were fresh.
    mode = nextMode;
    activePresentationToken = presentationToken ?? null;
    const generation = ++presentationGeneration;
    if (!canvas) {
      canvas = root.ownerDocument.createElement('canvas');
      initializeCanvas(canvas);
    }
    if (restoreOwner.isPending()) {
      activationReady = new Promise<void>((resolve) => {
        resolveActivationReady = resolve;
      });
    }
    waitForRetainedContext(nextMode, generation);
  };

  const prepare = (
    nextMode: PhonePackedAlphaSurfaceMode,
    signal: AbortSignal | null,
    requirePresentedFrame = false,
    presentationToken: string | null = null
  ): Promise<void> => {
      if (disposed) {
        return Promise.reject(new Error(
          `${layerName} packed-alpha surface is disposed`
        ));
      }
      if (signal?.aborted) {
        return Promise.reject(new DOMException(
          `${layerName} packed-alpha presentation aborted`,
          'AbortError'
        ));
      }
      if (
        mode === nextMode
        && root.dataset[statusDataset] === 'static-fallback'
      ) release();
      activate(nextMode, presentationToken);
      const waitForActivation = activationReady ?? Promise.resolve();
      return waitForActivation.then(() => {
        if (signal?.aborted) {
          throw new DOMException(
            `${layerName} packed-alpha presentation aborted`,
            'AbortError'
          );
        }
        if (mode !== nextMode || !compositor) {
          throw new Error(`${layerName} packed-alpha surface unavailable`);
        }
        if (nextMode === 'forward' && requirePresentedFrame) {
          exactForwardFrameRequired = true;
          const startExactForwardFrame = () => {
            if (
              disposed
              || mode !== 'forward'
              || !compositor
              || root.dataset[statusDataset] === 'verified'
            ) return;
            exactForwardFrameListener = undefined;
            try {
              video.currentTime = 0;
              void video.play().catch(() => failEndpoint());
            } catch {
              failEndpoint();
            }
          };
          if (video.readyState >= HAVE_METADATA) startExactForwardFrame();
          else {
            exactForwardFrameListener = startExactForwardFrame;
            video.addEventListener('loadeddata', startExactForwardFrame, { once: true });
          }
        }
        if (nextMode === 'forward' && !requirePresentedFrame) {
          return undefined;
        }
        if (root.dataset[statusDataset] === 'verified') return undefined;
        if (root.dataset[statusDataset] === 'static-fallback') {
          throw new Error(
            `${layerName} packed-alpha presentation failed`
          );
        }
        if (timeout !== undefined) globalThis.clearTimeout(timeout);
        timeout = globalThis.setTimeout(
          failEndpoint,
          options.frameTimeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS
        );
        return new Promise<void>((resolve, reject) => {
        const preparation: Preparation = {
          presentationToken,
          resolve,
          reject,
          ...(signal ? { signal } : {}),
          abort() {
            preparations.delete(preparation);
            reject(new DOMException(
              `${layerName} packed-alpha presentation aborted`,
              'AbortError'
            ));
          }
        };
        preparations.add(preparation);
        signal?.addEventListener('abort', preparation.abort, { once: true });
        });
      });
  };
  const dispose = () => {
    if (disposed) return;
    release();
    // This surface owns its Canvas outside React. Terminal disposal must be
    // the one place that hard-releases its context before removing the node;
    // ordinary lease release deliberately keeps the context reusable.
    const terminalContext = canvas?.getContext?.('webgl');
    if (terminalContext && !terminalContext.isContextLost()) {
      releasePackedAlphaWebGlContext(terminalContext);
    }
    restoreOwner.clear();
    canvas?.remove();
    if (canvas) delete canvas.dataset.phonePackedAlphaRetired;
    canvas = undefined;
    disposed = true;
  };
  const retire = () => {
    if (disposed) return;
    // A route may leave a packed-alpha scene for several legs while the
    // adapter remains mounted for a later reverse admission. Retiring loses
    // the context so it no longer counts against Safari's active budget, but
    // keeps the surface-owned Canvas and callable alive. The next activation
    // restores this same owner before creating a new compositor; terminal
    // disposal remains the only path that removes the Canvas.
    release();
    if (canvas) restoreOwner.retire(canvas);
    retireCanvas();
  };
  const present = (presentationToken: string | null) => {
    if (disposed) return;
    if (!compositor) {
      queuedPresentationToken = presentationToken;
      return;
    }
    if (
      activePresentationToken === presentationToken
      && canvas?.dataset.packedAlphaStatus === 'ready'
      && canvas.dataset.phonePackedAlphaPresentationToken === presentationToken
    ) {
      // Preparation may finish before the presentation adapter is bound. The
      // exact draw is still valid for this immutable token; replay its raw
      // evidence to the newly bound adapter instead of dropping admission.
      const mediaTime = Number(canvas.dataset.packedAlphaMediaTime);
      options.onFrame?.(
        activePresentationToken,
        Number.isFinite(mediaTime) ? mediaTime : null
      );
      return;
    }
    // The token is armed before `render()` so a retained endpoint must draw
    // again for the new immutable revision; an old successful frame cannot be
    // relabelled as proof for a newer transaction.
    rebindPresentationToken(presentationToken);
    compositor.render();
  };

  const presentExactFrame = (mediaTime: number): boolean => {
    if (!compositor || !canvas || !Number.isFinite(mediaTime)) {
      return false;
    }
    // The timeline driver is the decoder authority for PH reverse frames. The
    // caller-provided number is the immutable rVFC tuple returned by that
    // driver; draw it directly instead of reading video.currentTime. When a
    // browser has not retained the diagnostic dataset yet, the tuple remains
    // the source of truth; a conflicting retained value is rejected.
    const recordedMediaTime = Number(video.dataset.timelineVideoFrameMediaTime);
    if (
      Number.isFinite(recordedMediaTime)
      && Math.abs(recordedMediaTime - mediaTime) > PRESENTATION_TOLERANCE_SECONDS
    ) {
      if (canvas) canvas.dataset.packedAlphaStatus = 'probing';
      return false;
    }
    if (!exactFrameMode) {
      // Once the presented-frame reverse starts, the timeline driver is the
      // only frame clock. Suspend the compositor's seek/timeupdate/rVFC
      // listeners before drawing the immutable tuple; otherwise a late event
      // can paint an older currentTime between two exact reverse samples.
      compositor.setActive(false);
      exactFrameMode = true;
    }
    exactFrameRenderInProgress = true;
    let result: ReturnType<PackedAlphaVideoCompositor['render']>;
    try {
      result = compositor.render(mediaTime);
    } finally {
      exactFrameRenderInProgress = false;
    }
    return result === 'rendered'
      && canvas.dataset.packedAlphaStatus === 'ready'
      && canvas.dataset.packedAlphaFrameEvidence === 'rvfc'
      && Number.isFinite(Number(canvas.dataset.packedAlphaMediaTime))
      && Math.abs(Number(canvas.dataset.packedAlphaMediaTime) - mediaTime)
        <= PRESENTATION_TOLERANCE_SECONDS;
  };

  const surface = (command: PhonePackedAlphaSurfaceCommand) => {
    switch (command[0]) {
      case 'activate':
        activate(command[1], command[2]);
        return;
      case 'prepare':
        return prepare(
          command[1],
          command[2],
          command[3] ?? false,
          command[4] ?? null
        );
      case 'present':
        present(command[1]);
        return;
      case 'frame':
        return presentExactFrame(command[1]);
      case 'canvas':
        return canvas ?? null;
      case 'release':
        release();
        return;
      case 'retire':
        retire();
        return;
      case 'dispose':
        dispose();
    }
  };
  return surface as PhonePackedAlphaSurface;
}
