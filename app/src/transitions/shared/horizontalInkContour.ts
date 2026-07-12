export const HORIZONTAL_INK_CONTOUR_SAMPLES = 128;
export const HORIZONTAL_INK_CONTOUR_AMPLITUDE = 0.055;

export type HorizontalInkDirection = 'bottom-to-top' | 'top-to-bottom';
export type HorizontalInkOwnership = 'reveal' | 'conceal';

export type HorizontalInkContour = Readonly<{
  seed: number;
  revision: string;
  samples: Uint8Array;
}>;

type HorizontalInkContourInput = Readonly<{
  authoredSeed: string;
  variationKey: string;
}>;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixHash(seed: number, value: number): number {
  let mixed = (seed ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function randomSigned(seed: number, lattice: number): number {
  return mixHash(seed, lattice) / 0xffffffff * 2 - 1;
}

function smoother(value: number): number {
  const clamped = clamp(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function valueNoise(seed: number, x: number, frequency: number): number {
  const position = x * frequency;
  const left = Math.floor(position);
  const blend = smoother(position - left);
  const from = randomSigned(seed, left);
  const to = randomSigned(seed, left + 1);
  return from + (to - from) * blend;
}

function contourValues(seed: number): number[] {
  const values = Array.from({ length: HORIZONTAL_INK_CONTOUR_SAMPLES }, (_, index) => {
    const x = index / Math.max(1, HORIZONTAL_INK_CONTOUR_SAMPLES - 1);
    return valueNoise(seed, x, 2) * 0.56
      + valueNoise(mixHash(seed, 17), x, 5) * 0.29
      + valueNoise(mixHash(seed, 43), x, 9) * 0.15;
  });
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  const maximum = Math.max(...centered.map(Math.abs), 0.0001);
  return centered.map((value) => clamp(value / maximum * 0.92, -1, 1));
}

function byteRevision(seed: number, samples: Uint8Array): string {
  let hash = seed;
  for (const sample of samples) {
    hash = mixHash(hash, sample);
  }
  return `horizontal-ink-contour-v1-${seed.toString(16).padStart(8, '0')}-${hash.toString(16).padStart(8, '0')}`;
}

export function createHorizontalInkContour(input: HorizontalInkContourInput): HorizontalInkContour {
  const seed = hashString(`${input.authoredSeed}:${input.variationKey}`);
  const samples = Uint8Array.from(
    contourValues(seed),
    (value) => Math.round((value * 0.5 + 0.5) * 255)
  );
  return Object.freeze({
    seed,
    revision: byteRevision(seed, samples),
    samples
  });
}

export function horizontalInkOffset(contour: HorizontalInkContour, x: number): number {
  const position = clamp(Number.isFinite(x) ? x : 0) * Math.max(0, contour.samples.length - 1);
  const leftIndex = Math.floor(position);
  const rightIndex = Math.min(contour.samples.length - 1, leftIndex + 1);
  const blend = position - leftIndex;
  const left = ((contour.samples[leftIndex] ?? 128) / 255) * 2 - 1;
  const right = ((contour.samples[rightIndex] ?? 128) / 255) * 2 - 1;
  return clamp(left + (right - left) * blend, -1, 1);
}

function percent(value: number): string {
  return `${(clamp(value) * 100).toFixed(3)}%`;
}

export function horizontalInkPolygon(
  contour: HorizontalInkContour,
  direction: HorizontalInkDirection,
  threshold: number,
  ownership: HorizontalInkOwnership
): string {
  const normalizedThreshold = clamp(Number.isFinite(threshold) ? threshold : 0);
  const envelope = Math.sin(normalizedThreshold * Math.PI);
  const boundary = Array.from({ length: contour.samples.length }, (_, index) => {
    const x = index / Math.max(1, contour.samples.length - 1);
    const offset = horizontalInkOffset(contour, x) * HORIZONTAL_INK_CONTOUR_AMPLITUDE * envelope;
    const y = direction === 'bottom-to-top'
      ? 1 - normalizedThreshold + offset
      : normalizedThreshold - offset;
    return `${percent(x)} ${percent(y)}`;
  });
  const ownsBottom = (direction === 'bottom-to-top') === (ownership === 'reveal');
  const outerY = ownsBottom ? '100.000%' : '0.000%';
  return `polygon(0.000% ${outerY}, ${boundary.join(', ')}, 100.000% ${outerY})`;
}
