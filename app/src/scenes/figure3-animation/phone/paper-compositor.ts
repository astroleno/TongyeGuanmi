export const PHONE_FIGURE3_PAPER_COLOR = '#ede4d2';

const MAX_CANVAS_PIXEL_RATIO = 2;

type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export type PhoneFigure3PaperCoverRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type PhoneFigure3PaperCompositor = Readonly<{
  paint(): boolean;
  dispose(): void;
}>;

type PhoneFigure3PaperCompositorOptions = Readonly<{
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  paperColor?: string;
  onFrame?: () => void;
}>;

/**
 * Figure3's authored plate is 16:9 and uses a left-edge portrait crop.
 * Return that exact object-fit: cover geometry without scaling a desktop DOM.
 */
export function phoneFigure3PaperCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number
): PhoneFigure3PaperCoverRect {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const scale = Math.max(
    safeViewportWidth / safeSourceWidth,
    safeViewportHeight / safeSourceHeight
  );
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;
  return {
    x: 0,
    y: (safeViewportHeight - height) / 2,
    width,
    height
  };
}

/**
 * Composite the canonical video over desktop's #ede4d2 paper in one canvas.
 * Multiplication handles both valid alpha and Safari's exposed white matte,
 * so the visible result no longer depends on CSS blending across a video
 * compositor boundary.
 */
export function paintPhoneFigure3PaperFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  paperColor = PHONE_FIGURE3_PAPER_COLOR
): boolean {
  if (
    video.readyState < 2
    || video.videoWidth <= 0
    || video.videoHeight <= 0
  ) {
    return false;
  }
  const bounds = canvas.getBoundingClientRect();
  const viewportWidth = canvas.clientWidth || bounds.width;
  const viewportHeight = canvas.clientHeight || bounds.height;
  if (viewportWidth < 2 || viewportHeight < 2) return false;

  const pixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(
      MAX_CANVAS_PIXEL_RATIO,
      Math.max(1, window.devicePixelRatio || 1)
    );
  const pixelWidth = Math.max(1, Math.round(viewportWidth * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(viewportHeight * pixelRatio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return false;
  const frame = phoneFigure3PaperCoverRect(
    video.videoWidth,
    video.videoHeight,
    viewportWidth,
    viewportHeight
  );
  try {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = paperColor;
    context.fillRect(0, 0, viewportWidth, viewportHeight);
    context.globalCompositeOperation = 'multiply';
    context.drawImage(video, frame.x, frame.y, frame.width, frame.height);
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    return true;
  } catch {
    return false;
  } finally {
    context.globalCompositeOperation = 'source-over';
  }
}

/** Release the canvas backing store when Figure3 retires. */
export function releasePhoneFigure3PaperCanvas(
  canvas: HTMLCanvasElement | null
): void {
  if (!canvas) return;
  delete canvas.dataset.phoneFigure3PaperFrame;
  canvas.width = 1;
  canvas.height = 1;
}

/**
 * Keep the canvas on decoded-frame cadence for native forward playback.
 * Reverse playback is seek-driven, so seeked/timeupdate repaint the same
 * canvas without creating a second media owner.
 */
export function createPhoneFigure3PaperCompositor({
  video,
  canvas,
  paperColor = PHONE_FIGURE3_PAPER_COLOR,
  onFrame
}: PhoneFigure3PaperCompositorOptions): PhoneFigure3PaperCompositor {
  const frameVideo = video as VideoWithFrameCallbacks;
  let disposed = false;
  let frameReported = false;
  let animationFrame = 0;
  let videoFrame: number | undefined;

  const paint = () => {
    if (disposed) return false;
    const painted = paintPhoneFigure3PaperFrame(video, canvas, paperColor);
    if (painted && !frameReported) {
      frameReported = true;
      onFrame?.();
    }
    return painted;
  };

  const cancelScheduledFrame = () => {
    if (videoFrame !== undefined) {
      frameVideo.cancelVideoFrameCallback?.(videoFrame);
      videoFrame = undefined;
    }
    if (animationFrame && typeof window !== 'undefined') {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };

  const schedule = () => {
    if (disposed || video.paused || video.ended) return;
    if (frameVideo.requestVideoFrameCallback) {
      if (videoFrame !== undefined) return;
      videoFrame = frameVideo.requestVideoFrameCallback(() => {
        videoFrame = undefined;
        paint();
        schedule();
      });
      return;
    }
    if (!animationFrame && typeof window !== 'undefined') {
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        paint();
        schedule();
      });
    }
  };

  const onFrameEvidence = () => {
    paint();
    schedule();
  };
  const onPause = () => {
    cancelScheduledFrame();
    paint();
  };

  for (const event of ['loadeddata', 'canplay', 'seeked', 'timeupdate', 'play', 'playing']) {
    video.addEventListener(event, onFrameEvidence);
  }
  video.addEventListener('pause', onPause);

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(() => paint());
  resizeObserver?.observe(canvas);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', paint, { passive: true });
  }

  paint();
  schedule();

  return {
    paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelScheduledFrame();
      for (const event of ['loadeddata', 'canplay', 'seeked', 'timeupdate', 'play', 'playing']) {
        video.removeEventListener(event, onFrameEvidence);
      }
      video.removeEventListener('pause', onPause);
      resizeObserver?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', paint);
      }
      releasePhoneFigure3PaperCanvas(canvas);
    }
  };
}
