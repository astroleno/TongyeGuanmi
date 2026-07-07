import { createSceneInkRenderer, type DynamicTextureSource, type SceneInkRenderer } from './sceneInk';

export type Figure2DepthInkOptions = {
  targetSrc?: string;
  depthSrc: string;
  nextSceneElement?: DynamicTextureSource | null;
  figureMaskElement?: DynamicTextureSource | null;
  hideAtEnd?: boolean;
  progressSpan?: number;
  colorLift?: number;
  sceneBrightness?: number;
  inkCenterX?: number;
  inkCenterY?: number;
  transparentOutside?: boolean;
};

export type Figure2DepthInkRenderer = {
  render(progress: number, visibilityProgress?: number): void;
  prewarm(): void;
  destroy(): void;
};

function textureSourceIsReady(source: DynamicTextureSource | null | undefined): boolean {
  if (!source) {
    return false;
  }
  if (source instanceof HTMLCanvasElement) {
    return source.dataset.inkTextureReady === 'true' && source.width > 0 && source.height > 0;
  }
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0 && source.videoHeight > 0;
  }
  return source.complete && source.naturalWidth > 0 && source.naturalHeight > 0;
}

export function createFigure2DepthInkRenderer(canvas: HTMLCanvasElement | null, options: Figure2DepthInkOptions): Figure2DepthInkRenderer | null {
  if (!canvas) {
    return null;
  }

  let depthReady = false;
  const depthProbe = new Image();
  depthProbe.decoding = 'async';
  depthProbe.onload = () => {
    depthReady = true;
    canvas.dataset.figure2DepthReady = 'true';
  };
  depthProbe.src = options.depthSrc;

  const renderer: SceneInkRenderer | null = createSceneInkRenderer(canvas, {
    assets: {
      ...(options.targetSrc ? { nextSceneSrc: options.targetSrc } : {}),
      backDepthSrc: options.depthSrc,
      middleDepthSrc: options.depthSrc
    },
    ...(options.targetSrc ? { targetSrc: options.targetSrc } : {}),
    nextSceneElement: options.nextSceneElement ?? null,
    figureMaskElement: options.figureMaskElement ?? null,
    hideAtEnd: options.hideAtEnd ?? false,
    progressSpan: options.progressSpan ?? 1,
    colorLift: options.colorLift ?? 0.34,
    sceneBrightness: options.sceneBrightness ?? 1,
    inkCenterX: options.inkCenterX ?? 0.5,
    inkCenterY: options.inkCenterY ?? 0.52,
    transparentOutside: options.transparentOutside ?? true,
    depthThresholdMode: true,
    perlinOverlay: false,
    perlinStrength: 0
  });

  if (!renderer) {
    return null;
  }

  canvas.dataset.figure2DepthInkMode = 'threshold';

  return {
    render(progress: number, visibilityProgress = progress) {
      renderer.render(progress, visibilityProgress, {
        perlinStrength: 0,
        sceneBrightness: options.sceneBrightness ?? 1
      });
      canvas.dataset.figure2DepthInkMode = 'threshold';
      canvas.dataset.figure2DepthReady = String(depthReady);
      canvas.dataset.figure2FigureMaskReady = String(textureSourceIsReady(options.figureMaskElement ?? null));
    },
    prewarm() {
      renderer.prewarm();
      canvas.dataset.figure2DepthInkMode = 'threshold';
      canvas.dataset.figure2DepthReady = String(depthReady);
      canvas.dataset.figure2FigureMaskReady = String(textureSourceIsReady(options.figureMaskElement ?? null));
    },
    destroy() {
      renderer.destroy();
    }
  };
}
