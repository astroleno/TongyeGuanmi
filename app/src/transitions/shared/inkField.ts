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

export type InkFieldFrame = Readonly<{
  spec: InkFieldSpec;
  progress: number;
  seed: number;
  ownership: Readonly<{
    revealClip: string | null;
    concealClip: string | null;
    edge: number;
  }>;
  occlusion: InkOcclusionBand & Readonly<{
    secondaryHorizontal: InkHorizontalOcclusionBand | null;
  }>;
}>;

export type InkOcclusionBand = Readonly<{
  gateRank: number;
  coreMin: number;
  coreMax: number;
  alphaMin: number;
}>;

export type InkHorizontalOcclusionBand = InkOcclusionBand & Readonly<{
  direction: 'top-to-bottom' | 'bottom-to-top';
}>;

export type InkFieldFrameOptions = Readonly<{
  secondaryHorizontal?: Readonly<{
    direction: InkHorizontalOcclusionBand['direction'];
    gateRank: number;
  }>;
}>;

type InkViewport = Readonly<{ width: number; height: number }>;

const GATE_START = 0.06;
const GATE_END = 0.94;
const CORE_HALF_WIDTH = 0.072;
const OCCLUSION_ALPHA_MIN = 0.92;

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

function occlusionBand(gateRank: number): InkOcclusionBand {
  const rank = clamp(gateRank);
  return {
    gateRank: rank,
    coreMin: clamp(rank - CORE_HALF_WIDTH),
    coreMax: clamp(rank + CORE_HALF_WIDTH),
    alphaMin: OCCLUSION_ALPHA_MIN
  };
}

function horizontalOwnership(
  spec: Extract<InkFieldSpec, { kind: 'horizontal' }>,
  edge: number
): Pick<InkFieldFrame['ownership'], 'revealClip' | 'concealClip'> {
  const leading = percent(edge);
  const trailing = percent(1 - edge);
  if (spec.direction === 'bottom-to-top') {
    return {
      revealClip: `inset(${trailing} 0 0 0)`,
      concealClip: `inset(0 0 ${leading} 0)`
    };
  }
  return {
    revealClip: `inset(0 0 ${trailing} 0)`,
    concealClip: `inset(${leading} 0 0 0)`
  };
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
  spec: InkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options: InkFieldFrameOptions = {}
): InkFieldFrame {
  const clampedProgress = clamp(Number.isFinite(progress) ? progress : 0);
  const edge = inkOwnershipGateProgress(clampedProgress);
  const clips = spec.kind === 'horizontal'
    ? horizontalOwnership(spec, edge)
    : spec.kind === 'radial'
      ? radialOwnership(spec, edge, viewport)
      : { revealClip: null, concealClip: null };

  const primaryGateRank = edge;
  const secondaryHorizontal = options.secondaryHorizontal
    ? {
        ...occlusionBand(options.secondaryHorizontal.gateRank),
        direction: options.secondaryHorizontal.direction
      }
    : null;

  return {
    spec,
    progress: clampedProgress,
    seed: hashString(spec.seed),
    ownership: {
      ...clips,
      edge
    },
    occlusion: {
      ...occlusionBand(primaryGateRank),
      secondaryHorizontal
    }
  };
}
