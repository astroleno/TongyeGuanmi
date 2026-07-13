import {
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
  progress: number;
  seed: number;
  ownership: Readonly<{
    revealClip: string | null;
    concealClip: string | null;
    edge: number;
  }>;
  occlusion: InkOcclusionBand;
}>;

export type HorizontalInkFieldFrame = InkFieldFrameBase<HorizontalInkFieldSpec> & Readonly<{
  contour: HorizontalInkContour;
  revision: string;
  threshold: number;
}>;

export type NonHorizontalInkFieldFrame = InkFieldFrameBase<NonHorizontalInkFieldSpec>;
export type InkFieldFrame = HorizontalInkFieldFrame | NonHorizontalInkFieldFrame;

export type InkFieldFrameOptions = Readonly<{
  contour?: HorizontalInkContour;
}>;

export type InkOcclusionBand = Readonly<{
  gateRank: number;
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

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

export function inkOwnershipGateProgress(progress: number): number {
  return clamp((progress - GATE_START) / (GATE_END - GATE_START));
}

function occlusionBand(
  gateRank: number,
  halfWidth = CORE_HALF_WIDTH,
  alphaMin = OCCLUSION_ALPHA_MIN
): InkOcclusionBand {
  const rank = clamp(gateRank);
  const width = Math.min(CORE_HALF_WIDTH, Math.max(0.0001, halfWidth));
  return {
    gateRank: rank,
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
  target.dataset.r4InkContourThreshold = frame.threshold.toFixed(6);
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
  edge: number,
  viewport: InkViewport
): Pick<InkFieldFrame['ownership'], 'revealClip' | 'concealClip'> {
  const width = finitePositive(viewport.width, 1);
  const height = finitePositive(viewport.height, 1);
  const originX = clamp(spec.origin.x) * width;
  const originY = clamp(spec.origin.y) * height;
  const maximumRadius = Math.max(
    Math.hypot(originX, originY),
    Math.hypot(width - originX, originY),
    Math.hypot(originX, height - originY),
    Math.hypot(width - originX, height - originY)
  );
  return {
    revealClip: `circle(${(maximumRadius * edge).toFixed(3)}px at ${percent(spec.origin.x)} ${percent(spec.origin.y)})`,
    concealClip: null
  };
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
  const edge = inkOwnershipGateProgress(clampedProgress);
  if (spec.kind === 'horizontal') {
    const contour = options.contour ?? createHorizontalInkContour({
      authoredSeed: spec.seed,
      variationKey: 'static-frame'
    });
    return {
      spec,
      progress: clampedProgress,
      seed: contour.seed,
      contour,
      revision: contour.revision,
      threshold: edge,
      ownership: {
        ...horizontalOwnership(spec, edge, contour),
        edge
      },
      occlusion: occlusionBand(
        edge,
        HORIZONTAL_INK_CORE_HALF_WIDTH_PX / finitePositive(viewport.height, 1),
        HORIZONTAL_INK_CORE_ALPHA_MIN
      )
    };
  }

  const clips = spec.kind === 'radial'
    ? radialOwnership(spec, edge, viewport)
    : { revealClip: null, concealClip: null };

  return {
    spec,
    progress: clampedProgress,
    seed: hashString(spec.seed),
    ownership: {
      ...clips,
      edge
    },
    occlusion: occlusionBand(edge)
  };
}
