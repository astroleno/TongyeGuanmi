export function releaseInkWebGlResources(
  gl: WebGLRenderingContext,
  resources?: {
    buffer?: WebGLBuffer | null;
    program?: WebGLProgram | null;
    shaders?: readonly (WebGLShader | null)[];
    textures?: readonly (WebGLTexture | null)[];
  }
): void;

export type InkBoundaryTransitionOptions = {
  colorLift?: number;
  particleStrength?: number;
  dprLimit?: number;
  coverAlpha?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
};

export type InkBoundaryTransition = {
  render(frame: InkBoundaryFrame, pointerX?: number, pointerY?: number): void;
  prewarm(frame: InkBoundaryFrame): void;
  destroy(): void;
};

export function createInkBoundaryTransition(
  canvas: HTMLCanvasElement | null,
  options?: InkBoundaryTransitionOptions
): InkBoundaryTransition | null;
import type { InkBoundaryFrame } from '../transitions/shared/inkBoundary';
