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
  fieldKind?: InkFieldFrame['spec']['kind'];
  colorLift?: number;
  particleGain?: number;
  dprLimit?: number;
  coverAlpha?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
};

export type InkBoundaryTransition = {
  render(frame: InkFieldFrame, pointerX?: number, pointerY?: number): void;
  prewarm(frame: InkFieldFrame): void;
  destroy(): void;
};

export function createInkBoundaryTransition(
  canvas: HTMLCanvasElement | null,
  options?: InkBoundaryTransitionOptions
): InkBoundaryTransition | null;
import type { InkFieldFrame } from '../transitions/shared/inkField';
