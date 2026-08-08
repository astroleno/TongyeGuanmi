import {
  circularInkOffset,
  createHorizontalInkContour,
  horizontalInkPolygon,
  type HorizontalInkContour
} from './horizontalInkContour';

export type InkOrigin = Readonly<{ x: number; y: number }>;

export type InkDepthTransform = Readonly<{
  viewport: Readonly<{ width: number; height: number }>;
  cover: Readonly<{ x: number; y: number; width: number; height: number }>;
  camera: Readonly<{
    scale: number;
    translateX: number;
    translateY: number;
    originX: number;
    originY: number;
  }>;
}>;

export type InkFieldSpec =
  | Readonly<{
      kind: 'horizontal';
      direction: 'top-to-bottom' | 'bottom-to-top';
      seed: string;
    }>
  | Readonly<{ kind: 'radial'; origin: InkOrigin; seed: string }>
  | Readonly<{
      kind: 'depth';
      depthSrc: string;
      seed: string;
      transform: InkDepthTransform;
    }>;

export type HorizontalInkFieldSpec = Extract<InkFieldSpec, { kind: 'horizontal' }>;
export type NonHorizontalInkFieldSpec = Exclude<InkFieldSpec, { kind: 'horizontal' }>;

type InkFieldFrameBase<Spec extends InkFieldSpec> = Readonly<{
  spec: Spec;
  viewport: InkViewport;
  progress: number;
  /** The sole ownership/frontier rank shared by DOM and GPU consumers. */
  boundaryRank: number;
  seed: number;
  ownership: Readonly<{
    revealClip: string | null;
    concealClip: string | null;
  }>;
  occlusion: InkOcclusionBand;
}>;

export type HorizontalInkFieldFrame = InkFieldFrameBase<HorizontalInkFieldSpec> & Readonly<{
  contour: HorizontalInkContour;
  revision: string;
}>;

export type RadialInkFieldFrame = InkFieldFrameBase<Extract<InkFieldSpec, { kind: 'radial' }>> & Readonly<{
  /** Reuses the shared packed contour transport, sampled around polar angle. */
  contour: HorizontalInkContour;
  revision: string;
}>;

export type DepthInkFieldFrame = InkFieldFrameBase<Extract<InkFieldSpec, { kind: 'depth' }>>;
export type NonHorizontalInkFieldFrame = RadialInkFieldFrame | DepthInkFieldFrame;
export type InkFieldFrame = HorizontalInkFieldFrame | RadialInkFieldFrame | DepthInkFieldFrame;

export type InkFieldFrameOptions = Readonly<{
  contour?: HorizontalInkContour;
}>;

export type InkOcclusionBand = Readonly<{
  coreMin: number;
  coreMax: number;
  alphaMin: number;
}>;

type InkDiagnosticTarget = Pick<HTMLElement, 'dataset'>;

type InkViewport = Readonly<{ width: number; height: number }>;

const GATE_START = 0.06;
const GATE_END = 0.94;
const CORE_HALF_WIDTH = 0.072;
const OCCLUSION_ALPHA_MIN = 0.92;
export const HORIZONTAL_INK_CORE_HALF_WIDTH_PX = 10;
export const HORIZONTAL_INK_SOFT_EDGE_HALF_WIDTH_PX = 28;
export const HORIZONTAL_INK_CORE_ALPHA_MIN = 1;
/** Radial DOM and GPU consume this one contour amplitude. */
export const RADIAL_INK_CONTOUR_AMPLITUDE = 0.108;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function inkOwnershipGateProgress(progress: number): number {
  return clamp((progress - GATE_START) / (GATE_END - GATE_START));
}

function occlusionBand(
  boundaryRank: number,
  halfWidth = CORE_HALF_WIDTH,
  alphaMin = OCCLUSION_ALPHA_MIN
): InkOcclusionBand {
  const rank = clamp(boundaryRank);
  const width = Math.min(CORE_HALF_WIDTH, Math.max(0.0001, halfWidth));
  return {
    coreMin: clamp(rank - width),
    coreMax: clamp(rank + width),
    alphaMin
  };
}

function horizontalOwnership(
  spec: HorizontalInkFieldSpec,
  edge: number,
  contour: HorizontalInkContour
): Pick<InkFieldFrame['ownership'], 'revealClip' | 'concealClip'> {
  return {
    revealClip: horizontalInkPolygon(contour, spec.direction, edge, 'reveal'),
    concealClip: horizontalInkPolygon(contour, spec.direction, edge, 'conceal')
  };
}

export function markHorizontalInkDiagnostics(
  target: InkDiagnosticTarget,
  frame: HorizontalInkFieldFrame
): void {
  target.dataset.r4InkBoundaryRevision = frame.revision;
  target.dataset.r4InkContourRevision = frame.revision;
  target.dataset.r4InkContourThreshold = frame.boundaryRank.toFixed(6);
  target.dataset.r4InkContourSeed = String(frame.contour.seed);
  target.dataset.r4InkContourDirection = frame.spec.direction;
  target.dataset.r4InkContourSamples = String(frame.contour.samples.length);
}

export function clearHorizontalInkDiagnostics(target: InkDiagnosticTarget): void {
  delete target.dataset.r4InkBoundaryRevision;
  delete target.dataset.r4InkContourRevision;
  delete target.dataset.r4InkContourThreshold;
  delete target.dataset.r4InkContourSeed;
  delete target.dataset.r4InkContourDirection;
  delete target.dataset.r4InkContourSamples;
}

function radialOwnership(
  spec: Extract<InkFieldSpec, { kind: 'radial' }>,
  contour: HorizontalInkContour,
  boundaryRank: number,
  viewport: InkViewport
): Pick<InkFieldFrame['ownership'], 'revealClip' | 'concealClip'> {
  return {
    revealClip: radialInkPolygon(contour, spec.origin, viewport, boundaryRank),
    concealClip: null
  };
}

function radialMaximumRadius(origin: InkOrigin, viewport: InkViewport): number {
  const aspect = finitePositive(viewport.width, 1) / finitePositive(viewport.height, 1);
  const x = clamp(origin.x) * aspect;
  const y = 1 - clamp(origin.y);
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(aspect - x, y),
    Math.hypot(x, 1 - y),
    Math.hypot(aspect - x, 1 - y),
    0.0001
  );
}

/**
 * A radial clip is sampled from the same packed multiscale contour as the
 * WebGL field.  Reusing this transport removes the old smooth CSS circle and
 * a second radial texture/lifecycle without introducing another renderer.
 */
function radialInkPolygon(
  contour: HorizontalInkContour,
  origin: InkOrigin,
  viewport: InkViewport,
  boundaryRank: number
): string {
  const rank = clamp(boundaryRank);
  const width = finitePositive(viewport.width, 1);
  const height = finitePositive(viewport.height, 1);
  const aspect = width / height;
  const maximum = radialMaximumRadius(origin, viewport);
  const envelope = Math.sin(rank * Math.PI);
  const points = Array.from({ length: contour.samples.length }, (_, index) => {
    const angleRank = (index + 0.5) / contour.samples.length;
    const angle = angleRank * Math.PI * 2;
    // The authored radial field is a camera-space organic radius, not a
    // rectangle intersection.  Both DOM and WebGL use the same corner radius
    // and contour sample, so the frontier may intentionally run past a live
    // viewport edge while the ink particles continue to feather outward.
    const radius = maximum
      * (1 + circularInkOffset(contour, angleRank) * RADIAL_INK_CONTOUR_AMPLITUDE * envelope)
      * rank;
    const x = clamp(origin.x) + Math.cos(angle) * radius / aspect;
    const y = clamp(origin.y) - Math.sin(angle) * radius;
    return `${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

export function inkFieldOrigin(spec: InkFieldSpec): InkOrigin {
  if (spec.kind === 'radial') {
    return spec.origin;
  }
  if (spec.kind === 'horizontal') {
    return spec.direction === 'bottom-to-top'
      ? { x: 0.5, y: 1 }
      : { x: 0.5, y: 0 };
  }
  return { x: 0.5, y: 0.5 };
}

export function createInkFieldFrame(
  spec: HorizontalInkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options?: InkFieldFrameOptions
): HorizontalInkFieldFrame;
export function createInkFieldFrame(
  spec: NonHorizontalInkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options?: InkFieldFrameOptions
): NonHorizontalInkFieldFrame;
export function createInkFieldFrame(
  spec: InkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options?: InkFieldFrameOptions
): InkFieldFrame;
export function createInkFieldFrame(
  spec: InkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options: InkFieldFrameOptions = {}
): InkFieldFrame {
  const clampedProgress = clamp(Number.isFinite(progress) ? progress : 0);
  const boundaryRank = inkOwnershipGateProgress(clampedProgress);
  if (spec.kind === 'horizontal') {
    const contour = options.contour ?? createHorizontalInkContour({
      authoredSeed: spec.seed,
      variationKey: 'static-frame'
    });
    return {
      spec,
      viewport,
      progress: clampedProgress,
      boundaryRank,
      seed: contour.seed,
      contour,
      revision: contour.revision,
      ownership: {
        ...horizontalOwnership(spec, boundaryRank, contour)
      },
      occlusion: occlusionBand(
        boundaryRank,
        HORIZONTAL_INK_CORE_HALF_WIDTH_PX / finitePositive(viewport.height, 1),
        HORIZONTAL_INK_CORE_ALPHA_MIN
      )
    };
  }

  if (spec.kind === 'radial') {
    const contour = options.contour ?? createHorizontalInkContour({
      authoredSeed: spec.seed,
      variationKey: `radial:${spec.origin.x.toFixed(4)}:${spec.origin.y.toFixed(4)}`
    });
    return {
      spec,
      viewport,
      progress: clampedProgress,
      boundaryRank,
      seed: contour.seed,
      contour,
      revision: contour.revision,
      ownership: radialOwnership(spec, contour, boundaryRank, viewport),
      occlusion: occlusionBand(boundaryRank)
    };
  }

  return {
    spec,
    viewport,
    progress: clampedProgress,
    boundaryRank,
    seed: hashString(spec.seed),
    ownership: {
      revealClip: null,
      concealClip: null
    },
    occlusion: occlusionBand(boundaryRank)
  };
}
