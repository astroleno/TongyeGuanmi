export type InkSceneTextureSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

export function releaseInkWebGlResources(
  gl: WebGLRenderingContext,
  resources?: {
    buffer?: WebGLBuffer | null;
    program?: WebGLProgram | null;
    shaders?: readonly (WebGLShader | null)[];
    textures?: readonly (WebGLTexture | null)[];
  }
): void;

export type InkSceneTransitionOptions = {
  assets?: {
    nextSceneSrc?: string;
    backDepthSrc?: string;
    middleDepthSrc?: string;
  };
  targetSrc?: string;
  nextSceneElement?: InkSceneTextureSource | null;
  figureMaskElement?: InkSceneTextureSource | null;
  sourceElement?: HTMLElement | null;
  farOnly?: boolean;
  hideAtEnd?: boolean;
  imageScale?: number;
  imageCenterX?: number;
  imageCenterY?: number;
  inkCenterX?: number;
  inkCenterY?: number;
  progressSpan?: number;
  colorLift?: number;
  particleStrength?: number;
  dynamicTextureFps?: number;
  dprLimit?: number;
  imageRect?: DOMRect;
  perlinOverlay?: boolean;
  perlinStrength?: number;
  sceneBrightness?: number;
  depthThresholdMode?: boolean;
  transparentOutside?: boolean;
};

export type InkSceneTransitionRenderOptions = {
  perlinStrength?: number;
  sceneBrightness?: number;
};

export type InkSceneTransition = {
  render(
    progress: number,
    pointerX?: number,
    pointerY?: number,
    visibilityProgress?: number,
    options?: InkSceneTransitionRenderOptions
  ): void;
  prewarm(): void;
  destroy(): void;
};

export type InkCurtainTransitionOptions = {
  direction?: 'top-down' | 'bottom-up';
  colorLift?: number;
  particleStrength?: number;
  dprLimit?: number;
  progressSpan?: number;
  coverAlpha?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
  targetElement?: InkSceneTextureSource | null;
  renderTarget?: () => void;
  targetTextureFps?: number;
};

export type InkCurtainTransition = {
  render(progress: number, pointerX?: number, pointerY?: number): void;
  prewarm(): void;
  destroy(): void;
};

export function dynamicTextureUploadDue(options: {
  fps: number;
  lastRevision?: string | null;
  nextRevision?: string | null;
  lastUploadAt: number;
  now: number;
}): boolean;

export function createInkSceneTransition(
  canvas: HTMLCanvasElement | null,
  options?: InkSceneTransitionOptions
): InkSceneTransition | null;

export function createInkCurtainTransition(
  canvas: HTMLCanvasElement | null,
  options?: InkCurtainTransitionOptions
): InkCurtainTransition | null;
