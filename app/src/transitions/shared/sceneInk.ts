import {
  createInkCurtainTransition,
  createInkSceneTransition,
  type InkCurtainTransition,
  type InkCurtainTransitionOptions,
  type InkSceneTextureSource,
  type InkSceneTransition,
  type InkSceneTransitionOptions,
  type InkSceneTransitionRenderOptions
} from '../../vendor/ink-scene-transition.js';

export type DynamicTextureSource = InkSceneTextureSource;

export type SceneInkOptions = InkSceneTransitionOptions;

export type SceneInkRenderer = {
  render(progress: number, visibilityProgress?: number, options?: InkSceneTransitionRenderOptions): void;
  prewarm(): void;
  destroy(): void;
};

export type CurtainInkOptions = InkCurtainTransitionOptions;

export type CurtainInkRenderer = {
  render(progress: number): void;
  prewarm(): void;
  destroy(): void;
};

export function createSceneInkRenderer(canvas: HTMLCanvasElement | null, options: SceneInkOptions = {}): SceneInkRenderer | null {
  const transition: InkSceneTransition | null = createInkSceneTransition(canvas, options);
  if (!canvas || !transition) {
    return null;
  }

  let destroyed = false;

  return {
    render(progress: number, visibilityProgress = progress, renderOptions: InkSceneTransitionRenderOptions = {}) {
      if (destroyed) {
        return;
      }
      transition.render(progress, 0, 0, visibilityProgress, renderOptions);
    },
    prewarm() {
      if (destroyed) {
        return;
      }
      transition.prewarm();
    },
    destroy() {
      destroyed = true;
      canvas.remove();
    }
  };
}

export function createCurtainInkRenderer(canvas: HTMLCanvasElement | null, options: CurtainInkOptions = {}): CurtainInkRenderer | null {
  const transition: InkCurtainTransition | null = createInkCurtainTransition(canvas, options);
  if (!canvas || !transition) {
    return null;
  }

  let destroyed = false;

  return {
    render(progress: number) {
      if (destroyed) {
        return;
      }
      transition.render(progress, 0, 0);
    },
    prewarm() {
      if (destroyed) {
        return;
      }
      transition.prewarm();
    },
    destroy() {
      destroyed = true;
      canvas.remove();
    }
  };
}
