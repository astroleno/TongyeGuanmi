import {
  createPackedAlphaVideoCompositor,
  renewPackedAlphaCanvas,
  setPackedAlphaVideoSource,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';

export type PhonePackedAlphaSurfaceMode = 'forward' | 'endpoint';

export type PhonePackedAlphaSurface = Readonly<{
  activate(mode?: PhonePackedAlphaSurfaceMode): void;
  prepare(
    mode?: PhonePackedAlphaSurfaceMode,
    signal?: AbortSignal
  ): Promise<void>;
  release(): void;
  dispose(): void;
}>;

type PhonePackedAlphaSurfaceOptions = Readonly<{
  root: HTMLElement;
  container: HTMLElement;
  canvas?: HTMLCanvasElement;
  video: HTMLVideoElement;
  packedSourceUrl: string;
  endpointSeconds: number;
  statusDataset: string;
  layerName: string;
  canvasClassName: string;
  frameTimeoutMs?: number;
  onFrame?: () => void;
}>;

type Preparation = Readonly<{
  resolve(): void;
  reject(error: Error | DOMException): void;
  signal?: AbortSignal;
  abort(): void;
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
  options: PhonePackedAlphaSurfaceOptions
): PhonePackedAlphaSurface {
  const {
    root,
    container,
    video,
    statusDataset,
    layerName
  } = options;
  const ownsCanvas = !options.canvas;
  const preparations = new Set<Preparation>();
  let disposed = false;
  let mode: PhonePackedAlphaSurfaceMode | undefined;
  let externalCanvas = options.canvas;
  let canvas: HTMLCanvasElement | undefined;
  let compositor: PackedAlphaVideoCompositor | undefined;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let endpointSeek: (() => void) | undefined;

  const settle = (error?: Error | DOMException) => {
    for (const preparation of preparations) {
      preparation.signal?.removeEventListener('abort', preparation.abort);
      if (error) preparation.reject(error);
      else preparation.resolve();
    }
    preparations.clear();
  };
  const clearSeek = () => {
    if (!endpointSeek) return;
    video.removeEventListener('loadedmetadata', endpointSeek);
    video.removeEventListener('loadeddata', endpointSeek);
    endpointSeek = undefined;
  };
  const retireCanvas = () => {
    if (!canvas) return;
    if (ownsCanvas) canvas.remove();
    else externalCanvas = renewPackedAlphaCanvas(canvas);
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
    settle(new Error(`${layerName} packed-alpha presentation failed`));
  };
  const release = () => {
    settle(new DOMException(
      `${layerName} packed-alpha presentation retired`,
      'AbortError'
    ));
    clearPresentation();
    releaseVideoSource(video);
    mode = undefined;
  };
  const activate = (nextMode: PhonePackedAlphaSurfaceMode = 'forward') => {
    if (disposed || mode === nextMode) return;
    release();
    mode = nextMode;
    canvas = externalCanvas ?? root.ownerDocument.createElement('canvas');
    canvas.className = options.canvasClassName;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.phonePackedAlphaCanvas = layerName;
    if (ownsCanvas) container.append(canvas);
    compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: () => {
        if (video.dataset.packedAlphaSource !== 'rgb-alpha-side-by-side') return;
        if (
          mode === 'endpoint'
          && Math.abs(video.currentTime - options.endpointSeconds)
            > ENDPOINT_FRAME_TOLERANCE_SECONDS
        ) return;
        if (timeout !== undefined) globalThis.clearTimeout(timeout);
        timeout = undefined;
        root.dataset[statusDataset] = 'verified';
        options.onFrame?.();
        settle();
      }
    });
    const status = canvas.dataset.packedAlphaStatus;
    if (status === 'webgl-unavailable' || status === 'setup-failed') {
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

  return {
    activate,
    prepare(nextMode = 'forward', signal) {
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
      activate(nextMode);
      if (nextMode === 'forward') return Promise.resolve();
      if (root.dataset[statusDataset] === 'verified') return Promise.resolve();
      if (root.dataset[statusDataset] === 'static-fallback') {
        return Promise.reject(new Error(
          `${layerName} packed-alpha presentation failed`
        ));
      }
      return new Promise<void>((resolve, reject) => {
        const preparation: Preparation = {
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
    },
    release,
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
    }
  };
}
