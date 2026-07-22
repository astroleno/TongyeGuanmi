import {
  createPackedAlphaVideoCompositor,
  setPackedAlphaVideoSource,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';

export type PhonePackedAlphaSurfaceMode = 'forward' | 'endpoint';

export type PhonePackedAlphaSurface = Readonly<{
  activate(mode?: PhonePackedAlphaSurfaceMode): void;
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
    // Detached test media and a retiring Safari decoder can reject load().
  }
  delete video.dataset.packedAlphaSource;
  delete video.dataset.phonePackedAlphaOwner;
}

/**
 * Figure2/AOD's Safari compositor topology, packaged for Unit 6 layers.
 * The canonical video remains the only decoder and the injected Canvas is its
 * only moving presentation surface. Authored scene plates remain the stable
 * fallback, and decoder/Canvas ownership ends once the chapter is invisible.
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
  let disposed = false;
  let mode: PhonePackedAlphaSurfaceMode | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let compositor: PackedAlphaVideoCompositor | undefined;
  let frameTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let endpointSeek: (() => void) | undefined;

  const clearEndpointSeek = () => {
    if (!endpointSeek) return;
    video.removeEventListener('loadedmetadata', endpointSeek);
    video.removeEventListener('loadeddata', endpointSeek);
    endpointSeek = undefined;
  };

  const retireCanvas = () => {
    if (!canvas) return;
    if (ownsCanvas) {
      canvas.remove();
    } else {
      // Keep the React-owned node/topology, but release its backing store once
      // the chapter is hidden. A later activation restores the authored size.
      canvas.width = 1;
      canvas.height = 1;
    }
    canvas = undefined;
  };

  const clearPresentation = () => {
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    clearEndpointSeek();
    compositor?.dispose();
    compositor = undefined;
    retireCanvas();
    delete root.dataset[statusDataset];
  };

  const settleStaticFallback = () => {
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    clearEndpointSeek();
    compositor?.dispose();
    compositor = undefined;
    retireCanvas();
    // Keep the decoder source alive. On physical Safari the first WebGL video
    // upload can legitimately wait for the gesture that starts native
    // playback. Releasing the source here left the later autoplay owner with
    // an empty video and made the snap look permanently frozen.
    root.dataset[statusDataset] = 'static-fallback';
  };

  const deferForwardProbeUntilPlayback = () => {
    if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
    frameTimeout = undefined;
    if (mode !== 'forward') return;
    // Figure2 keeps its compositor mounted while the poster is visible; AOD
    // likewise retains one decoder/Canvas pair until its native run starts.
    // Unit 6 must not treat a pre-gesture frame timeout as media failure.
    root.dataset[statusDataset] = 'awaiting-native-playback';
  };

  const release = () => {
    clearPresentation();
    releaseVideoSource(video);
    mode = undefined;
  };

  return {
    activate(nextMode = 'forward') {
      if (disposed || mode === nextMode) return;
      release();
      mode = nextMode;

      canvas = options.canvas ?? root.ownerDocument.createElement('canvas');
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
          ) {
            return;
          }
          if (frameTimeout !== undefined) globalThis.clearTimeout(frameTimeout);
          frameTimeout = undefined;
          root.dataset[statusDataset] = 'verified';
          options.onFrame?.();
        }
      });
      const compositorStatus = canvas.dataset.packedAlphaStatus;
      if (
        compositorStatus === 'webgl-unavailable'
        || compositorStatus === 'setup-failed'
      ) {
        video.dataset.phonePackedAlphaOwner = layerName;
        setPackedAlphaVideoSource(video, options.packedSourceUrl);
        settleStaticFallback();
        return;
      }
      root.dataset[statusDataset] = 'probing';
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
            } else {
              compositor?.render();
            }
          } catch {
            // Metadata can race source replacement on Safari; loadeddata retries.
          }
        };
        video.addEventListener('loadedmetadata', endpointSeek);
        video.addEventListener('loadeddata', endpointSeek);
      }

      setPackedAlphaVideoSource(video, options.packedSourceUrl);
      if (nextMode === 'endpoint') {
        endpointSeek?.();
      } else {
        try {
          video.currentTime = 0;
        } catch {
          // loadeddata presents frame zero after the new source is ready.
        }
      }
      frameTimeout = globalThis.setTimeout(() => {
        if (root.dataset[statusDataset] === 'verified') return;
        if (mode === 'forward') {
          deferForwardProbeUntilPlayback();
          return;
        }
        settleStaticFallback();
      }, options.frameTimeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS);
    },
    release,
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
    }
  };
}

/** Release a parked compositor only after its scroll transition is invisible. */
export function releasePhonePackedAlphaWhenHidden(
  root: HTMLElement,
  release: () => void
): () => void {
  let retired = false;
  const retireIfHidden = () => {
    if (retired) return;
    const opacity = Number.parseFloat(root.style.opacity || '1');
    if (root.style.visibility !== 'hidden' && opacity > 0.001) return;
    retired = true;
    observer?.disconnect();
    release();
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
