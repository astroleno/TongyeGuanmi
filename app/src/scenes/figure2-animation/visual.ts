import type { InkDepthTransform } from '../../transitions/shared/inkField';

export type Figure2AnimationRenderState = {
  progress: number;
  proofProgress: number;
  stageOpacity: number;
  backgroundOpacity: number;
  figureOpacity: number;
  cameraScale: number;
  depthTransform: InkDepthTransform;
};

type Figure2Root = HTMLElement & {
  __r4Figure2Progress?: number;
};

type Figure2RenderOptions = Readonly<{
  proofProgress?: number;
  videoMode?: 'seek' | 'native' | 'none';
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
    reducedMotion?: boolean;
  };
}>;

const FIGURE2_MIDDLE_ASPECT_RATIO = 16 / 9;

function smoothStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function figure2Viewport(root: HTMLElement | null): Readonly<{ width: number; height: number }> {
  const rect = root?.getBoundingClientRect?.();
  const width = rect?.width || root?.clientWidth || (typeof window === 'undefined' ? 1440 : window.innerWidth) || 1440;
  const height = rect?.height || root?.clientHeight || (typeof window === 'undefined' ? 900 : window.innerHeight) || 900;
  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

export function figure2DepthTransformForProgress(
  root: HTMLElement | null,
  progress: number
): InkDepthTransform {
  const viewport = figure2Viewport(root);
  const viewportRatio = viewport.width / viewport.height;
  const cover = viewportRatio >= FIGURE2_MIDDLE_ASPECT_RATIO
    ? {
        x: 0,
        y: (viewport.height - viewport.width / FIGURE2_MIDDLE_ASPECT_RATIO) / 2,
        width: viewport.width,
        height: viewport.width / FIGURE2_MIDDLE_ASPECT_RATIO
      }
    : {
        x: (viewport.width - viewport.height * FIGURE2_MIDDLE_ASPECT_RATIO) / 2,
        y: 0,
        width: viewport.height * FIGURE2_MIDDLE_ASPECT_RATIO,
        height: viewport.height
      };
  const eased = smoothStep(progress);
  return {
    viewport,
    cover,
    camera: {
      scale: Number((1.012 + eased * 0.13).toFixed(4)),
      translateX: 0,
      translateY: Number((-eased * 34).toFixed(2)),
      originX: 0.5,
      originY: 0.56
    }
  };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function retainedFigure2Arch(root: HTMLElement | null | undefined): HTMLImageElement | null | undefined {
  const phoneStory = root?.closest?.('.phone-story');
  const stage = root?.closest?.('[data-testid="r2-stage"]');
  return (phoneStory ?? stage)
    ?.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch="true"]');
}

export function renderFigure2AnimationProgress(
  root: HTMLElement | null,
  progress: number,
  options: Figure2RenderOptions = {}
): Figure2AnimationRenderState {
  const clamped = clamp(progress);
  const eased = smoothStep(clamped);
  const proofProgress = smoothStep(clamp(options.proofProgress ?? 0));
  const backgroundOpacity = 1;
  const stageOpacity = 1;
  const figureOpacity = 1;
  const cameraScale = 1.012 + eased * 0.13;
  const cloudScale = 1 + eased * 0.10;
  const cloudY = eased * 3;
  const farArcadeScale = 1 + eased * 0.22;
  const farArcadeY = 10 + eased * 8;
  const middleY = -eased * 34;
  const nearArchScale = 1.025 + eased * 0.11;
  const nearArchBlur = eased * 3.6;
  const figureY = -eased * 12;
  const figureScale = 1 + eased * 0.035;
  const depthTransform = figure2DepthTransformForProgress(root, clamped);
  root?.style.setProperty('--r4-figure2-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-figure2-proof-progress', proofProgress.toFixed(4));
  root?.style.setProperty('--r4-figure2-stage-opacity', stageOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-background-opacity', backgroundOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-figure-opacity', figureOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-contact-shadow-opacity', (0.82 * figureOpacity).toFixed(4));
  root?.style.setProperty('--r4-figure2-camera-scale', cameraScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-cloud-y', `${cloudY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-cloud-scale', cloudScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-far-arcade-y', `${farArcadeY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-far-arcade-scale', farArcadeScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-middle-y', `${middleY.toFixed(2)}px`);
  const retainedArch = retainedFigure2Arch(root);
  if (retainedArch?.dataset.figure2ArchMotion !== 'fixed') {
    retainedArch?.style.setProperty('--r4-figure2-near-arch-scale', nearArchScale.toFixed(4));
    retainedArch?.style.setProperty('--r4-figure2-near-arch-blur', `${nearArchBlur.toFixed(2)}px`);
    retainedArch?.style.setProperty('--r4-figure2-near-arch-brightness', '.76');
  }
  root?.style.setProperty('--r4-figure2-figure-y', `${figureY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-figure-scale', figureScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-video-opacity', '1');
  root?.setAttribute('data-figure2-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-proof-progress', proofProgress.toFixed(4));
  if (root) {
    (root as Figure2Root).__r4Figure2Progress = clamped;
  }
  if (options.mediaRun) {
    root?.setAttribute('data-figure2-playback-direction', String(options.mediaRun.direction));
    root?.setAttribute('data-figure2-playback-run', options.mediaRun.runId);
  }
  return {
    progress: clamped,
    proofProgress,
    stageOpacity,
    backgroundOpacity,
    figureOpacity,
    cameraScale,
    depthTransform
  };
}

export function renderFigure2ProofTransitionProgress(root: HTMLElement | null, progress: number): Figure2AnimationRenderState {
  return renderFigure2AnimationProgress(root, 1, { proofProgress: progress, videoMode: 'none' });
}

export function renderFigure2Hold(root: HTMLElement | null): void {
  renderFigure2AnimationProgress(root, 0, { videoMode: 'none' });
}
