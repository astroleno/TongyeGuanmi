export type InkOrigin = Readonly<{ x: number; y: number }>;

export type InkBoundarySpec =
  | Readonly<{ kind: 'radial'; origin: InkOrigin; seed: string }>
  | Readonly<{
      kind: 'horizontal';
      direction: 'top-to-bottom' | 'bottom-to-top';
      seed: string;
    }>;

export type InkBoundaryFrame = Readonly<{
  kind: InkBoundarySpec['kind'];
  origin: InkOrigin;
  progress: number;
  profile: Uint8Array;
  revealClipPath: string;
  concealClipPath: string | null;
  revision: string;
}>;

type InkViewport = Readonly<{
  width: number;
  height: number;
  samples?: number;
}>;

const DEFAULT_SAMPLES = 96;
const MIN_SAMPLES = 16;
const MAX_SAMPLES = 256;

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

function hash01(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function sampleOffset(seed: number, index: number, progress: number): number {
  const energy = Math.sin(clamp(progress) * Math.PI);
  const low = hash01(seed ^ Math.floor(index / 8)) - 0.5;
  const high = hash01(seed ^ Math.imul(index, 0x45d9f3b)) - 0.5;
  return (low * 0.080 + high * 0.026) * energy;
}

function smoothOffsets(seed: number, samples: number, progress: number, wrap: boolean): number[] {
  const offsets = Array.from({ length: samples }, (_, index) =>
    sampleOffset(seed, index, progress)
  );
  return offsets.map((offset, index) => {
    const previous = offsets[index === 0 ? (wrap ? samples - 1 : 0) : index - 1] ?? offset;
    const next = offsets[index === samples - 1 ? (wrap ? 0 : samples - 1) : index + 1] ?? offset;
    return previous * 0.2 + offset * 0.6 + next * 0.2;
  });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function point(x: number, y: number): string {
  return `${percent(x)} ${percent(y)}`;
}

function polygon(points: readonly string[]): string {
  return `polygon(${points.join(', ')})`;
}

function profileRevision(
  spec: InkBoundarySpec,
  progress: number,
  width: number,
  height: number,
  profile: Uint8Array
): string {
  let profileHash = 0x811c9dc5;
  for (const value of profile) {
    profileHash ^= value;
    profileHash = Math.imul(profileHash, 0x01000193);
  }
  return [
    spec.kind,
    hashString(spec.seed).toString(16).padStart(8, '0'),
    progress.toFixed(6),
    `${Math.round(width)}x${Math.round(height)}`,
    profile.length,
    (profileHash >>> 0).toString(16).padStart(8, '0')
  ].join(':');
}

function horizontalFrame(
  spec: Extract<InkBoundarySpec, { kind: 'horizontal' }>,
  progress: number,
  width: number,
  height: number,
  samples: number
): InkBoundaryFrame {
  const offsets = smoothOffsets(hashString(spec.seed), samples, progress, false);
  const profile = Uint8Array.from(offsets, (offset) => {
    const travel = clamp(progress + offset);
    const shaderEdge = spec.direction === 'bottom-to-top' ? travel : 1 - travel;
    return Math.round(shaderEdge * 255);
  });
  const edge = [...profile].map((value, index) =>
    point(index / (samples - 1), 1 - value / 255)
  );
  const top = [point(0, 0), point(1, 0), ...[...edge].reverse()];
  const bottom = [...edge, point(1, 1), point(0, 1)];
  const reveal = spec.direction === 'bottom-to-top' ? bottom : top;
  const conceal = spec.direction === 'bottom-to-top' ? top : bottom;
  const origin = spec.direction === 'bottom-to-top'
    ? { x: 0.5, y: 1 }
    : { x: 0.5, y: 0 };

  return {
    kind: spec.kind,
    origin,
    progress,
    profile,
    revealClipPath: polygon(reveal),
    concealClipPath: polygon(conceal),
    revision: profileRevision(spec, progress, width, height, profile)
  };
}

function radialFrame(
  spec: Extract<InkBoundarySpec, { kind: 'radial' }>,
  progress: number,
  width: number,
  height: number,
  samples: number
): InkBoundaryFrame {
  const aspect = width / height;
  const offsets = smoothOffsets(hashString(spec.seed), samples, progress, true);
  const profileValues = offsets.map((offset) =>
    Math.round(clamp(progress + offset) * 255)
  );
  profileValues[profileValues.length - 1] = profileValues[0] ?? 0;
  const profile = Uint8Array.from(profileValues);
  const radiusScale = Math.max(
    Math.hypot(spec.origin.x * aspect, spec.origin.y),
    Math.hypot((1 - spec.origin.x) * aspect, spec.origin.y),
    Math.hypot(spec.origin.x * aspect, 1 - spec.origin.y),
    Math.hypot((1 - spec.origin.x) * aspect, 1 - spec.origin.y)
  );
  const edge = [...profile].map((value, index) => {
    const angle = (index / samples - 0.5) * Math.PI * 2;
    const radius = value / 255 * radiusScale;
    return point(
      spec.origin.x + Math.cos(angle) * radius / aspect,
      spec.origin.y - Math.sin(angle) * radius
    );
  });

  return {
    kind: spec.kind,
    origin: spec.origin,
    progress,
    profile,
    revealClipPath: polygon(edge),
    concealClipPath: null,
    revision: profileRevision(spec, progress, width, height, profile)
  };
}

export function createInkBoundaryFrame(
  spec: InkBoundarySpec,
  progress: number,
  viewport: InkViewport
): InkBoundaryFrame {
  const clampedProgress = clamp(Number.isFinite(progress) ? progress : 0);
  const width = finitePositive(viewport.width, 1);
  const height = finitePositive(viewport.height, 1);
  const requestedSamples = Number.isFinite(viewport.samples) ? Math.round(viewport.samples ?? DEFAULT_SAMPLES) : DEFAULT_SAMPLES;
  const samples = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, requestedSamples));

  return spec.kind === 'radial'
    ? radialFrame(spec, clampedProgress, width, height, samples)
    : horizontalFrame(spec, clampedProgress, width, height, samples);
}
