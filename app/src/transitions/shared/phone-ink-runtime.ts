import {
  createInkFieldFrame,
  type InkDepthTransform,
  type InkFieldSpec
} from './inkField';
import {
  applyConcealBoundary,
  applyRevealBoundary,
  clearBoundaryGeometry
} from './inkOwnership';
import {
  createInkFieldRenderer,
  InkRendererRunError,
  mountTransitionInkCanvas,
  productionInkRendererRequired,
  type InkGradePreset,
  type InkRendererFailure
} from './sceneInk';
import { createRadialInkIntroController } from './radialInkIntro';

/** Ordered field data keeps Phone Ink independent from per-chunk property maps. */
export type PhoneInkRuntimeFieldRequest = readonly [
  kind: 'horizontal' | 'radial',
  seed: string,
  direction: 'top-to-bottom' | 'bottom-to-top' | null,
  originX: number | null,
  originY: number | null
];

export type PhoneInkRuntimeRequest = readonly [
  host: HTMLElement | null,
  canvas: HTMLCanvasElement | null,
  id: string,
  from: HTMLElement | null,
  additionalFrom: HTMLElement | null,
  to: HTMLElement | null,
  field: PhoneInkRuntimeFieldRequest,
  grade: InkGradePreset | null
];

export type PhoneInkRuntimeCommand =
  | readonly ['render', progress: number]
  | readonly ['dispose'];

export type PhoneInkRuntimeBridge = (command: PhoneInkRuntimeCommand) => void;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fieldFor([
  kind,
  seed,
  direction,
  originX,
  originY
]: PhoneInkRuntimeFieldRequest): InkFieldSpec {
  if (kind === 'horizontal') {
    if (!direction) throw new Error('Phone horizontal ink requires a direction');
    return { kind, direction, seed };
  }
  if (originX === null || originY === null) {
    throw new Error('Phone radial ink requires an origin');
  }
  return { kind, origin: { x: originX, y: originY }, seed };
}

function viewportFor(
  canvas: HTMLCanvasElement,
  host: HTMLElement
): Readonly<{ width: number; height: number }> {
  return {
    width: Math.max(1, canvas.clientWidth || host.clientWidth || window.innerWidth || 1),
    height: Math.max(1, canvas.clientHeight || host.clientHeight || window.innerHeight || 1)
  };
}

/**
 * Own all raw renderer, field, and mask objects in story-runtime. Lazy Phone
 * adapters can exchange only this callable command bridge with the chunk.
 */
export function createPhoneInkRuntimeBridge([
  host,
  existingCanvas,
  id,
  from,
  additionalFrom,
  to,
  fieldRequest,
  requestGrade
]: PhoneInkRuntimeRequest): PhoneInkRuntimeBridge {
  const field = fieldFor(fieldRequest);
  const canvasClassName = existingCanvas?.className || 'phone-story-shell__ink';
  const surface = mountTransitionInkCanvas(host, id, {
    renderer: 'field',
    grade: requestGrade ?? 'dark',
    generation: `phone-story:${id}`,
    className: canvasClassName
  }, existingCanvas ?? undefined);
  if (!surface || !host) {
    return () => undefined;
  }

  const mountedCanvas = existingCanvas ? null : surface;
  const renderer = createInkFieldRenderer(surface, {
    fieldKind: field.kind,
    grade: requestGrade ?? 'dark',
    generation: `phone-story:${id}`,
    removeCanvasOnDestroy: false,
    loseContextOnDestroy: false
  });
  const sourceEndpoints = [from, additionalFrom].filter(
    (element, index, elements): element is HTMLElement => (
      Boolean(element) && elements.indexOf(element) === index
    )
  );
  let lastProgress = Number.NaN;

  if (import.meta.env.DEV) {
    surface.dataset.phoneInkRenderer = renderer ? 'active' : 'unavailable';
  }
  if (renderer) {
    renderer.prewarm(createInkFieldFrame(field, 0.003, viewportFor(surface, host)));
  }

  const render = (rawProgress: number) => {
    const progress = clamp(rawProgress);
    const rendererNeedsFrame = Math.abs(progress - lastProgress) >= 0.0005;
    lastProgress = progress;
    if (import.meta.env.DEV) {
      surface.dataset.phoneInkProgress = progress.toFixed(4);
    }
    const fieldActive = progress > 0.001 && progress < 0.999;
    surface.style.visibility = fieldActive ? 'visible' : 'hidden';
    surface.style.opacity = fieldActive ? '1' : '0';
    const frame = createInkFieldFrame(field, progress, viewportFor(surface, host));
    for (const source of sourceEndpoints) {
      if (
        field.kind === 'radial'
        && progress > 0.001
        && progress < 0.999
      ) {
        source.style.visibility = 'visible';
        clearBoundaryGeometry(source);
      } else {
        applyConcealBoundary(source, frame);
      }
    }
    if (to) {
      applyRevealBoundary(to, frame);
    }
    if (rendererNeedsFrame) {
      renderer?.render(frame);
    }
  };

  return (command) => {
    if (command[0] === 'render') {
      render(command[1]);
      return;
    }
    renderer?.destroy();
    surface.style.removeProperty('visibility');
    surface.style.removeProperty('opacity');
    if (import.meta.env.DEV) {
      delete surface.dataset.phoneInkRenderer;
      delete surface.dataset.phoneInkProgress;
    }
    mountedCanvas?.remove();
  };
}

/** Hero's radial field crosses from its lazy scene as primitive positions. */
export type PhoneHeroRadialInkRequest = readonly [
  canvas: HTMLCanvasElement,
  revealSurface: HTMLElement,
  targetImage: HTMLImageElement | null,
  originX: number,
  originY: number,
  seed: string,
  generation: string,
  viewportHost: HTMLElement
];

export type PhoneHeroRadialInkCommand =
  | readonly ['prewarm']
  | readonly ['render', progress: number]
  | readonly ['dispose'];

export type PhoneHeroRadialInkBridge = (
  command: PhoneHeroRadialInkCommand
) => void;

/**
 * Keeps Hero's raw field spec and controller object in story-runtime. The
 * lazy Hero adapter receives only a callable bridge and ordered commands.
 */
export function createPhoneHeroRadialInkBridge([
  canvas,
  revealSurface,
  targetImage,
  originX,
  originY,
  seed,
  generation,
  viewportHost
]: PhoneHeroRadialInkRequest): PhoneHeroRadialInkBridge {
  const controller = createRadialInkIntroController({
    canvas,
    revealSurface,
    targetImage,
    field: {
      kind: 'radial',
      origin: { x: originX, y: originY },
      seed
    },
    generation,
    viewport: () => ({
      width: viewportHost.clientWidth || window.innerWidth,
      height: viewportHost.clientHeight || window.innerHeight
    })
  });
  return (command) => {
    switch (command[0]) {
      case 'prewarm':
        controller.prewarm();
        return;
      case 'render':
        controller.render(command[1]);
        return;
      case 'dispose':
        controller.dispose();
    }
  };
}

export type PhoneFigure2DepthTransformRequest = readonly [
  viewportWidth: number,
  viewportHeight: number,
  coverX: number,
  coverY: number,
  coverWidth: number,
  coverHeight: number,
  cameraScale: number,
  cameraTranslateX: number,
  cameraTranslateY: number,
  cameraOriginX: number,
  cameraOriginY: number
];

export type PhoneFigure2DepthInkRuntimeRequest = readonly [
  stage: HTMLElement | null,
  canvas: HTMLCanvasElement | null,
  segmentId: string,
  generation: string,
  prefersReducedMotion: boolean,
  depthSrc: string,
  seed: string,
  className: string
];

export type PhoneFigure2DepthInkRuntimeCommand =
  | readonly ['canvas']
  | readonly ['assert']
  | readonly ['prewarm', progress: number, transform: PhoneFigure2DepthTransformRequest]
  | readonly ['render', progress: number, transform: PhoneFigure2DepthTransformRequest]
  | readonly ['dispose'];

export type PhoneFigure2DepthInkRuntimeBridge = (
  command: PhoneFigure2DepthInkRuntimeCommand
) => HTMLCanvasElement | null | void;

function depthTransformFor([
  viewportWidth,
  viewportHeight,
  coverX,
  coverY,
  coverWidth,
  coverHeight,
  cameraScale,
  cameraTranslateX,
  cameraTranslateY,
  cameraOriginX,
  cameraOriginY
]: PhoneFigure2DepthTransformRequest): InkDepthTransform {
  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    cover: { x: coverX, y: coverY, width: coverWidth, height: coverHeight },
    camera: {
      scale: cameraScale,
      translateX: cameraTranslateX,
      translateY: cameraTranslateY,
      originX: cameraOriginX,
      originY: cameraOriginY
    }
  };
}

/**
 * Figure2's shared authored timeline receives a callable Ink runtime. The
 * depth field object and renderer lifecycle therefore never leave the manual
 * story-runtime chunk.
 */
export function createPhoneFigure2DepthInkRuntimeBridge([
  stage,
  existingCanvas,
  segmentId,
  generation,
  prefersReducedMotion,
  depthSrc,
  seed,
  className
]: PhoneFigure2DepthInkRuntimeRequest): PhoneFigure2DepthInkRuntimeBridge {
  const ownsCanvas = !existingCanvas;
  const canvas = mountTransitionInkCanvas(stage, segmentId, {
    renderer: 'field',
    grade: 'edge-only',
    generation,
    className
  }, existingCanvas ?? undefined);
  let failure: InkRendererFailure | null = null;
  const renderer = prefersReducedMotion ? null : createInkFieldRenderer(canvas, {
    fieldKind: 'depth',
    grade: 'edge-only',
    generation,
    removeCanvasOnDestroy: ownsCanvas,
    loseContextOnDestroy: ownsCanvas,
    onInvalidated(nextFailure) {
      failure = nextFailure;
    }
  });
  const required = productionInkRendererRequired(prefersReducedMotion);
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer?.destroy();
    if (ownsCanvas && !renderer) canvas?.remove();
  };
  const assertReady = () => {
    if (!required) return;
    failure ??= renderer?.getFailure() ?? null;
    if (renderer?.isActive() && !failure) return;
    const error = new InkRendererRunError(segmentId, failure ?? {
      generation,
      reason: 'unavailable'
    });
    dispose();
    throw error;
  };
  const frameFor = (
    progress: number,
    transformRequest: PhoneFigure2DepthTransformRequest
  ) => {
    const transform = depthTransformFor(transformRequest);
    return createInkFieldFrame(
      { kind: 'depth', depthSrc, seed, transform },
      progress,
      transform.viewport
    );
  };
  const render = (
    progress: number,
    transformRequest: PhoneFigure2DepthTransformRequest
  ) => {
    if (disposed) return;
    const frame = frameFor(progress, transformRequest);
    const visible = progress > 0.002 && progress < 0.999;
    if (canvas) {
      const active = visible && Boolean(renderer?.isActive());
      if (visible) {
        if (active) canvas.dataset.r4InkActive = 'true';
        else delete canvas.dataset.r4InkActive;
        canvas.dataset.r4InkProgress = progress.toFixed(4);
        canvas.dataset.r4InkBoundaryKind = 'depth';
        canvas.dataset.r4InkBoundaryOrigin = '0.5000,0.5000';
        canvas.dataset.r4InkBoundaryProgress = progress.toFixed(4);
        canvas.dataset.r4InkFieldSeed = String(frame.seed);
      } else {
        delete canvas.dataset.r4InkActive;
        delete canvas.dataset.r4InkProgress;
        delete canvas.dataset.r4InkBoundaryKind;
        delete canvas.dataset.r4InkBoundaryOrigin;
        delete canvas.dataset.r4InkBoundaryProgress;
        delete canvas.dataset.r4InkFieldSeed;
      }
    }
    renderer?.render(frame);
  };

  return (command) => {
    switch (command[0]) {
      case 'canvas':
        return canvas;
      case 'assert':
        assertReady();
        return;
      case 'prewarm':
        assertReady();
        renderer?.prewarm(frameFor(command[1], command[2]));
        return;
      case 'render':
        render(command[1], command[2]);
        return;
      case 'dispose':
        dispose();
    }
  };
}
