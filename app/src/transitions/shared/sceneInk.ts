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

export type TransitionInkCanvasOptions = {
  renderer: 'curtain' | 'scene';
  origin: { x: number; y: number };
  preset?: 'cinematic-color';
  className?: string;
};

const CINEMATIC_CURTAIN_PRESET = Object.freeze({
  colorLift: 0.92,
  particleStrength: 1,
  coverAlpha: 0.82,
  fadeOutStart: 0.78,
  fadeOutEnd: 0.995,
  progressSpan: 1,
  dprLimit: 1
}) satisfies InkCurtainTransitionOptions;

const CINEMATIC_SCENE_PRESET = Object.freeze({
  colorLift: 0.92,
  particleStrength: 1,
  dynamicTextureFps: 24,
  dprLimit: 0.5
}) satisfies InkSceneTransitionOptions;

function markCinematicPreset(
  canvas: HTMLCanvasElement,
  renderer: TransitionInkCanvasOptions['renderer'],
  colorLift: number,
  particleStrength: number,
  dprLimit: number,
  dynamicTextureFps?: number
): void {
  canvas.dataset.r4InkPreset = 'cinematic-color';
  canvas.dataset.r4InkPresetApplied = 'true';
  canvas.dataset.r4InkParticleProfile = 'jade-gold';
  canvas.dataset.r4InkParticleStrength = particleStrength.toFixed(3);
  canvas.dataset.r4InkRenderer = renderer;
  canvas.dataset.r4InkColorLift = colorLift.toFixed(3);
  canvas.dataset.r4InkDprLimit = dprLimit.toFixed(2);
  if (dynamicTextureFps !== undefined) {
    canvas.dataset.r4InkTextureFps = String(dynamicTextureFps);
  }
}

/**
 * Shared DOM surface for every R4 ink handoff. Keeping the canvas beside the
 * scene layers prevents receiver masks and scene overflow from clipping the
 * colored particle field.
 */
export function mountTransitionInkCanvas(
  host: HTMLElement | null,
  segmentId: string,
  options: TransitionInkCanvasOptions
): HTMLCanvasElement | null {
  if (!host) {
    return null;
  }
  const existing = host.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${segmentId}"]`);
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = ['r4-ink-transition-canvas', options.renderer === 'scene' ? 'r4-scene-ink-canvas' : '', options.className ?? '']
    .filter(Boolean)
    .join(' ');
  canvas.dataset.r4InkSegment = segmentId;
  canvas.dataset.r4InkRenderer = options.renderer;
  canvas.dataset.r4InkPreset = options.preset ?? 'cinematic-color';
  canvas.dataset.inkOriginX = options.origin.x.toFixed(3);
  canvas.dataset.inkOriginY = options.origin.y.toFixed(3);
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  return canvas;
}

export function createSceneInkRenderer(canvas: HTMLCanvasElement | null, options: SceneInkOptions = {}): SceneInkRenderer | null {
  const resolvedOptions: InkSceneTransitionOptions = {
    ...options,
    ...CINEMATIC_SCENE_PRESET
  };
  if (canvas) {
    markCinematicPreset(
      canvas,
      'scene',
      resolvedOptions.colorLift ?? CINEMATIC_SCENE_PRESET.colorLift,
      resolvedOptions.particleStrength ?? CINEMATIC_SCENE_PRESET.particleStrength,
      resolvedOptions.dprLimit ?? CINEMATIC_SCENE_PRESET.dprLimit,
      resolvedOptions.dynamicTextureFps ?? CINEMATIC_SCENE_PRESET.dynamicTextureFps
    );
  }
  const transition: InkSceneTransition | null = createInkSceneTransition(canvas, resolvedOptions);
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
      transition.destroy();
      canvas.remove();
    }
  };
}

export function createCurtainInkRenderer(canvas: HTMLCanvasElement | null, options: CurtainInkOptions = {}): CurtainInkRenderer | null {
  const resolvedOptions: InkCurtainTransitionOptions = {
    ...CINEMATIC_CURTAIN_PRESET,
    ...options
  };
  if (canvas) {
    markCinematicPreset(
      canvas,
      'curtain',
      resolvedOptions.colorLift ?? CINEMATIC_CURTAIN_PRESET.colorLift,
      resolvedOptions.particleStrength ?? CINEMATIC_CURTAIN_PRESET.particleStrength,
      resolvedOptions.dprLimit ?? CINEMATIC_CURTAIN_PRESET.dprLimit
    );
  }
  const transition: InkCurtainTransition | null = createInkCurtainTransition(canvas, resolvedOptions);
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
      transition.destroy();
      canvas.remove();
    }
  };
}
