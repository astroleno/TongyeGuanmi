export function releaseInkWebGlResources(
  gl: WebGLRenderingContext,
  resources?: {
    buffer?: WebGLBuffer | null;
    program?: WebGLProgram | null;
    shaders?: readonly (WebGLShader | null)[];
    textures?: readonly (WebGLTexture | null)[];
  }
): void;

export type InkCurtainTransitionOptions = {
  direction?: 'top-down' | 'bottom-up';
  colorLift?: number;
  particleStrength?: number;
  dprLimit?: number;
  progressSpan?: number;
  coverAlpha?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
};

export type InkCurtainTransition = {
  render(progress: number, pointerX?: number, pointerY?: number): void;
  prewarm(): void;
  destroy(): void;
};

export function createInkCurtainTransition(
  canvas: HTMLCanvasElement | null,
  options?: InkCurtainTransitionOptions
): InkCurtainTransition | null;
