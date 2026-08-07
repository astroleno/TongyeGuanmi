import {
  createPackedAlphaVideoCompositor,
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
  onFrame: ((presentationToken: string | null) => void) | null
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
  | readonly ['release']
  | readonly ['dispose'];

/** Callable bridge keeps the mutable decoder/compositor in its owner chunk. */
export type PhonePackedAlphaSurface = (
  command: PhonePackedAlphaSurfaceCommand
) => Promise<void> | void;

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
  let activePresentationToken: string | null = null;
  let activeFrameToken: string | null = null;
  let presentationGeneration = 0;

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
  };
  const retireCanvas = () => {
    if (!canvas) return;
    canvas.remove();
    canvas = undefined;
  };
  const clearPresentation = () => {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    timeout = undefined;
    clearSeek();
    compositor?.dispose();
    compositor = undefined;
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
    activePresentationToken = null;
    activeFrameToken = null;
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
    activeFrameToken = presentationToken;
    rejectSupersededPreparations(presentationToken);
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    timeout = undefined;
    if (root.dataset[statusDataset] === 'verified') {
      root.dataset[statusDataset] = mode === 'forward'
        ? 'awaiting-native-playback'
        : 'probing';
    }
    // A fresh immutable token may reuse a warmed WebGL context, but only the
    // physical draw after this rebind can settle its own preparation.
    compositor?.render();
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
    mode = nextMode;
    activePresentationToken = presentationToken ?? null;
    activeFrameToken = presentationToken ?? null;
    const generation = ++presentationGeneration;
    canvas = root.ownerDocument.createElement('canvas');
    canvas.className = options.canvasClassName;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.phonePackedAlphaCanvas = layerName;
    container.append(canvas);
    compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: () => {
        if (
          generation !== presentationGeneration
        ) return;
        if (video.dataset.packedAlphaSource !== 'rgb-alpha-side-by-side') return;
        if (
          mode === 'endpoint'
          && Math.abs(video.currentTime - options.endpointSeconds)
            > ENDPOINT_FRAME_TOLERANCE_SECONDS
        ) return;
        if (timeout !== undefined) globalThis.clearTimeout(timeout);
        timeout = undefined;
        root.dataset[statusDataset] = 'verified';
        options.onFrame?.(activeFrameToken);
        settle({ presentationToken: activePresentationToken });
      },
      // A compositor failure is terminal evidence, never a quietly false
      // render result that waits for a timeout or lets a second owner retry.
      onFailure: () => {
        if (generation !== presentationGeneration) return;
        failEndpoint();
      }
    });
    const status = canvas.dataset.packedAlphaStatus;
    if (status === 'webgl-unavailable') {
      video.dataset.phonePackedAlphaOwner = layerName;
      setPackedAlphaVideoSource(video, options.packedSourceUrl);
      failEndpoint();
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
          if (Math.abs(video.currentTime - endpoint) > 0.002) {
            video.currentTime = endpoint;
          } else compositor?.render();
        } catch {
          // Metadata can race source replacement; loadeddata retries.
        }
      };
      video.addEventListener('loadedmetadata', endpointSeek);
      video.addEventListener('loadeddata', endpointSeek);
    }
    setPackedAlphaVideoSource(video, options.packedSourceUrl);
    if (nextMode === 'endpoint') {
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
      if (nextMode === 'forward' && !requirePresentedFrame) {
        return Promise.resolve();
      }
      if (root.dataset[statusDataset] === 'verified') return Promise.resolve();
      if (root.dataset[statusDataset] === 'static-fallback') {
        return Promise.reject(new Error(
          `${layerName} packed-alpha presentation failed`
        ));
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
  };
  const dispose = () => {
    if (disposed) return;
    release();
    disposed = true;
  };
  const present = (presentationToken: string | null) => {
    if (disposed || !compositor) return;
    // The token is armed before `render()` so a retained endpoint must draw
    // again for the new immutable revision; an old successful frame cannot be
    // relabelled as proof for a newer transaction.
    rebindPresentationToken(presentationToken);
    activeFrameToken = presentationToken;
    compositor.render();
  };

  return (command) => {
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
      case 'release':
        release();
        return;
      case 'dispose':
        dispose();
    }
  };
}
